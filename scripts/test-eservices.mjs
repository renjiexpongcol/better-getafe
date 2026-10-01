import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import pg from "pg";
import express from "express";
import dotenv from "dotenv";
import {
  activateStorage,
  ensureCitizenStoragePrivate,
} from "../server/src/services/storage.js";
import { EserviceEngine } from "../server/src/services/eserviceEngine.js";
import { installEserviceRoutes } from "../server/src/services/eserviceRoutes.js";
import {
  cents,
  decimal,
  inspectDocument,
  validateValues,
  validateWorkflow,
} from "../server/src/services/eserviceValidation.js";
import {
  requireAccess,
  ensureAuthorizationData,
} from "../server/src/services/authorizationService.js";
import { activateDatabase } from "../server/src/services/cloudSql.js";
import { drainEserviceOutbox } from "../server/src/services/eserviceRoutes.js";
import {
  verifyTimestampedHmac,
  PaymentProviderRegistry,
} from "../server/src/services/eservicePaymentProviders.js";
import { closeConfigStore } from "../server/src/config/DatabaseSettingsProvider.js";
dotenv.config({ quiet: true });
test("confidential object storage rejects public or unverified bucket ACLs", async () => {
  const resource = (acl) => ({
    provider: "backblaze",
    bucket: "test-only",
    client: { send: async () => acl, destroy() {} },
  });
  activateStorage(
    resource({
      Owner: { ID: "owner" },
      Grants: [{ Grantee: { Type: "Group", URI: "public" } }],
    }),
  );
  await assert.rejects(() => ensureCitizenStoragePrivate(), {
    code: "PRIVATE_BUCKET_REQUIRED",
  });
  activateStorage(resource({}));
  await assert.rejects(() => ensureCitizenStoragePrivate(), {
    code: "PRIVATE_BUCKET_REQUIRED",
  });
  activateStorage(
    resource({
      Owner: { ID: "owner" },
      Grants: [
        {
          Grantee: { Type: "CanonicalUser", ID: "owner" },
          Permission: "FULL_CONTROL",
        },
      ],
    }),
  );
  await ensureCitizenStoragePrivate();
  activateStorage(null);
});

test("exact decimal amounts and authoritative form/file validation", () => {
  assert.equal(decimal(cents("0.10") + cents("0.20")), "0.30");
  assert.throws(() => cents("1.001"));
  assert.throws(() => cents("-1"));
  assert.throws(() => cents("1e3"));
  assert.throws(() =>
    inspectDocument(Buffer.from("<script>"), "application/pdf"),
  );
  assert.equal(
    inspectDocument(Buffer.from("%PDF-1.4\n"), "application/pdf").length,
    64,
  );
  assert.throws(() =>
    validateValues(
      [{ id: "a", key: "name", label: "Name", type: "text", required: true }],
      {},
      true,
    ),
  );
  assert.throws(() => validateValues([], { userId: "attacker" }, true));
  assert.throws(() =>
    validateWorkflow(
      [{ status: "DRAFT", next_statuses: ["COMPLETED"] }],
      false,
    ),
  );
  const raw = Buffer.from('{"verified":true}'),
    secret = "test-only-secret",
    timestamp = String(Math.floor(Date.now() / 1000)),
    signature = crypto
      .createHmac("sha256", secret)
      .update(timestamp + ".")
      .update(raw)
      .digest("hex");
  assert(verifyTimestampedHmac(raw, { secret, timestamp, signature }));
  assert(
    !verifyTimestampedHmac(Buffer.from("changed"), {
      secret,
      timestamp,
      signature,
    }),
  );
  assert(
    !verifyTimestampedHmac(raw, {
      secret,
      timestamp,
      signature,
      now: Date.now() + 3600000,
    }),
  );
  assert.throws(() => new PaymentProviderRegistry().getOnline("unconfigured"));
});

test("PostgreSQL and HTTP e-services lifecycle, privacy, permissions, concurrency and financial integrity", async (t) => {
  const schema = `eservice_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const options = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || "127.0.0.1",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || "getafe_portal",
        user: process.env.DB_USER || "getafe_app",
        password: process.env.DB_PASSWORD,
      };
  const root = new pg.Pool(options);
  await root.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({
    ...options,
    options: `-c search_path=${schema},public`,
  });
  const sql = (query, values) =>
    pool.query(
      query.replace(/\?/g, () => `$${++sql.index}`),
      values,
    );
  const facade = {
    execute: async (query, values = []) => {
      sql.index = 0;
      const result = await sql(query, values);
      return [result.rows, result];
    },
    getConnection: async () => {
      const client = await pool.connect();
      return {
        execute: async (query, values = []) => {
          let index = 0;
          const result = await client.query(
            query.replace(/\?/g, () => `$${++index}`),
            values,
          );
          return [result.rows, result];
        },
        beginTransaction: () => client.query("BEGIN"),
        commit: () => client.query("COMMIT"),
        rollback: () => client.query("ROLLBACK"),
        release: () => client.release(),
      };
    },
  };
  const permissions = [
    "services.catalog.manage",
    "requests.department.view",
    "requests.department.assign",
    "requests.department.process",
    "requests.department.approve",
    "documents.process",
    "documents.view",
    "assessments.create",
    "assessments.adjust",
    "payments.verify",
    "payments.view",
    "payments.reverse",
    "billing.manage",
    "eservices.admin",
    "services.catalog.view",
  ];
  const resident = { id: crypto.randomUUID(), kind: "resident" },
    other = { id: crypto.randomUUID(), kind: "resident" },
    processor = { id: crypto.randomUUID(), permissions, role: "staff" },
    cashier = { id: crypto.randomUUID(), permissions, role: "staff" },
    outsider = { id: crypto.randomUUID(), permissions, role: "staff" },
    denied = { id: crypto.randomUUID(), role: "staff" };
  const engine = new EserviceEngine({
    pool: async () => facade,
    authorize: requireAccess,
  });
  let server;
  try {
    for (const file of (await fs.readdir("database/migrations/postgresql"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pool.query(
        await fs.readFile(`database/migrations/postgresql/${file}`, "utf8"),
      );
    const resource = { ...facade, pool, users: 0 };
    activateDatabase("database", resource);
    activateDatabase("portalDatabase", resource);
    for (const user of [processor, cashier, outsider, denied])
      await pool.query(
        "INSERT INTO users(id,name,email,password,role,created_at,updated_at) VALUES($1,'Test staff',$2,'unusable','staff',now(),now())",
        [user.id, `${user.id}@example.invalid`],
      );
    await ensureAuthorizationData();
    const group = crypto.randomUUID();
    await pool.query(
      "INSERT INTO auth_groups(id,name,created_at,updated_at) VALUES($1,'Test-only e-services processors',now(),now())",
      [group],
    );
    for (const permission of permissions)
      await pool.query(
        "INSERT INTO auth_group_permissions(group_id,permission_id,created_at) VALUES($1,$2,now())",
        [group, permission],
      );
    for (const user of [processor, cashier, outsider])
      await pool.query(
        "INSERT INTO auth_user_groups(user_id,group_id,created_at) VALUES($1,$2,now())",
        [user.id, group],
      );
    for (const user of [resident, other])
      await pool.query(
        "INSERT INTO portal_users(id,name,email,password,created_at,updated_at) VALUES($1,'Test resident',$2,'unusable',now(),now())",
        [user.id, `${user.id}@example.invalid`],
      );
    for (const user of [processor, cashier])
      await pool.query(
        "INSERT INTO eservice_department_members(user_id,department_id) VALUES($1,'treasury')",
        [user.id],
      );
    const steps = [
      ["DRAFT", "SUBMITTED"],
      ["SUBMITTED", "RECEIVED"],
      ["RECEIVED", "IN_REVIEW"],
      ["IN_REVIEW", "NEEDS_INFORMATION", "FOR_ASSESSMENT", "REJECTED"],
      ["NEEDS_INFORMATION", "IN_REVIEW"],
      ["FOR_ASSESSMENT", "AWAITING_PAYMENT"],
      ["AWAITING_PAYMENT", "PAID"],
      ["PAID", "FOR_APPROVAL"],
      ["FOR_APPROVAL", "APPROVED"],
      ["APPROVED", "FOR_RELEASE"],
      ["FOR_RELEASE", "COMPLETED"],
      ["COMPLETED"],
      ["REJECTED"],
    ].map(([status, ...next_statuses]) => ({
      status,
      label: status,
      permission:
        status === "PAID"
          ? "payments.verify"
          : status === "APPROVED"
            ? "requests.department.approve"
            : "requests.department.process",
      next_statuses,
    }));
    const service = await engine.saveService(
      processor,
      {
        name: "Test business application",
        slug: `test-${resident.id}`,
        kind: "BUSINESS_NEW",
        department_id: "treasury",
        published: true,
        online_available: true,
        payment_required: true,
        declaration: "I confirm this information.",
        fields: [
          {
            key: "business_name",
            label: "Business name",
            type: "text",
            required: true,
          },
          {
            key: "business_address",
            label: "Business address",
            type: "address",
          },
        ],
        requirements: [
          { code: "DOC", label: "Configured document", required: true },
        ],
        fees: [
          {
            code: "FEE1",
            description: "Configured fee",
            amount: "10.10",
            source: "Test-only policy",
          },
          {
            code: "FEE2",
            description: "Configured fee two",
            amount: "20.20",
            source: "Test-only policy",
          },
        ],
        steps,
      },
      null,
    );
    const objects = new Map();
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, bytes) => {
          req.rawBody = Buffer.from(bytes);
        },
      }),
    );
    const auth = (kind) => (req, res, next) => {
      const uid = req.get("X-Test-Actor");
      const user = [resident, other, processor, cashier, outsider].find(
        (u) => u.id === uid,
      );
      if (!user)
        return res.status(401).json({ error: "Authentication required." });
      req[kind] = user;
      next();
    };
    const gatewaySecret = "test-only-gateway-secret";
    const providers = new PaymentProviderRegistry([
      {
        id: "TEST_GATEWAY",
        online: true,
        verifierUserId: cashier.id,
        verifyWebhook: async (raw, headers) => {
          if (
            !verifyTimestampedHmac(raw, {
              secret: gatewaySecret,
              signature: headers["x-signature"],
              timestamp: headers["x-timestamp"],
            })
          ) {
            const error = new Error("Invalid signature.");
            error.status = 403;
            throw error;
          }
          return JSON.parse(raw.toString());
        },
      },
    ]);
    installEserviceRoutes(app, {
      resident: auth("resident"),
      admin: auth("admin"),
      permission: permission => (req, res, next) => {
        if (!req.admin?.permissions?.includes(permission)) return res.status(403).json({ error: "Permission required." });
        next();
      },
      engine,
      providers,
      files: {
        write: async (k, v) => objects.set(k, v),
        read: async (k) => objects.get(k),
        remove: async (k) => objects.delete(k),
      },
      throttleUpload: async () => ({ allowed: true }),
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (
      actor,
      path,
      method = "GET",
      body,
      key = crypto.randomUUID(),
    ) => {
      const response = await fetch(base + path, {
        method,
        headers: {
          "X-Test-Actor": actor.id,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    await t.test("staff lookup, catalog pagination, department grants and immediate revocation", async () => {
      const lookup = await call(processor, "/api/admin/eservices/staff-search?q=Test&limit=2");
      assert.equal(lookup.status, 200);
      assert.equal(lookup.body.items.length, 2);
      assert.equal(lookup.body.has_more, true);
      assert.deepEqual(Object.keys(lookup.body.items[0]).sort(), ["email", "id", "name"]);
      assert.equal((await call(processor, `/api/admin/eservices/staff-search?q=${outsider.id}`)).body.items[0].id, outsider.id);
      assert.equal((await call(processor, `/api/admin/eservices/staff-search?q=${outsider.id}@example.invalid`)).body.items[0].id, outsider.id);
      assert.equal((await call(processor, "/api/admin/eservices/staff-search?q=nobody")).body.items.length, 0);
      assert.equal((await call(processor, "/api/admin/eservices/staff-search?q=x&limit=1000")).status, 400);
      assert.equal((await call(processor, `/api/admin/eservices/staff-search?q=${"x".repeat(101)}`)).status, 422);
      assert.equal((await call(resident, "/api/admin/eservices/staff-search?q=Test")).status, 403);
      assert.equal((await call({id:"expired"}, "/api/admin/eservices/staff-search?q=Test")).status, 401);
      const catalog = await call(processor, "/api/admin/services?limit=1&page=1");
      assert.equal(catalog.status, 200); assert.equal(catalog.body.items.length, 1); assert.ok(catalog.body.total > 0);
      assert.equal((await call(processor, "/api/admin/services?published=invalid")).status, 400);
      assert.equal((await call(processor, "/api/admin/eservices/department-members")).status, 422);
      const grant = { user_id: outsider.id, department_id: "treasury" };
      assert.equal((await call(resident, "/api/admin/eservices/department-members", "POST", grant)).status, 403);
      assert.equal((await call(processor, "/api/admin/eservices/department-members", "POST", { ...grant, user_id: resident.id })).status, 422);
      await pool.query("UPDATE users SET role='disabled' WHERE id=$1", [outsider.id]);
      assert.equal((await call(processor, `/api/admin/eservices/staff-search?q=${outsider.id}`)).body.items.length, 0);
      assert.equal((await call(processor, "/api/admin/eservices/department-members", "POST", grant)).status, 422);
      await pool.query("UPDATE users SET role='staff' WHERE id=$1", [outsider.id]);
      await pool.query("UPDATE departments SET published=FALSE WHERE id='treasury'");
      assert.equal((await call(processor, "/api/admin/eservices/department-members", "POST", grant)).status, 422);
      await pool.query("UPDATE departments SET published=TRUE WHERE id='treasury'");
      const grants = await Promise.all([call(processor, "/api/admin/eservices/department-members", "POST", grant), call(processor, "/api/admin/eservices/department-members", "POST", grant)]);
      assert.deepEqual(grants.map(result => result.status).sort(), [200,409]);
      assert.equal((await call(processor, `/api/admin/eservices/department-members?user_id=${outsider.id}`)).body.items.length, 1);
      const audits = await pool.query("SELECT * FROM audit_logs WHERE action='department.access.granted' AND setting_key=$1", [outsider.id]);
      assert.equal(audits.rows.length, 1);
      assert.equal((await call(processor, "/api/admin/eservices/department-members/revoke", "POST", grant)).status, 200);
      assert.equal((await call(processor, `/api/admin/eservices/department-members?user_id=${outsider.id}`)).body.items.length, 0);
      assert.equal((await call(processor, "/api/admin/eservices/department-members/revoke", "POST", grant)).status, 404);
    });
    let request;
    const version = async () =>
      (
        await engine.read("SELECT version FROM service_requests WHERE id=?", [
          request.id,
        ])
      )[0].version;
    const action = async (op, data = {}, actor = processor) =>
      engine.process(
        actor,
        request.id,
        op,
        { version: await version(), ...data },
        crypto.randomUUID(),
      );
    await t.test(
      "create draft and replay create without duplicate",
      async () => {
        const key = crypto.randomUUID(),
          data = { service_id: service.id, userId: other.id };
        const created = await call(
          resident,
          "/api/requests",
          "POST",
          data,
          key,
        );
        assert.equal(created.status, 201);
        request = created.body;
        const replay = await call(resident, "/api/requests", "POST", data, key);
        assert.equal(replay.body.id, request.id);
        assert.equal(request.applicant_user_id, resident.id);
        assert.match(request.request_number, /^GET-\d{4}-\d{6,}$/);
      },
    );
    await t.test("own draft update, IDOR block and stale update", async () => {
      const body = {
        version: request.version,
        values: {
          business_name: "Test business",
          business_address: { barangay: "Test" },
        },
      };
      assert.equal(
        (await call(other, `/api/requests/${request.id}/draft`, "PATCH", body))
          .status,
        404,
      );
      request = await engine.saveDraft(resident, request.id, body);
      await assert.rejects(() => engine.saveDraft(resident, request.id, body), {
        status: 409,
      });
    });
    let documentId;
    const upload = async (replaces) => {
      const response = await fetch(
        `${base}/api/requests/${request.id}/documents`,
        {
          method: "POST",
          headers: {
            "X-Test-Actor": resident.id,
            "Content-Type": "application/pdf",
            "X-Filename": "test.pdf",
            "X-Requirement-Id": service.requirements[0].id,
            "X-Request-Version": String(await version()),
            "Idempotency-Key": crypto.randomUUID(),
            ...(replaces ? { "X-Replaces-Id": replaces } : {}),
          },
          body: Buffer.from("%PDF-1.4\nTest-only document"),
        },
      );
      const data = await response.json();
      assert.equal(response.status, 201, JSON.stringify(data));
      return data.id;
    };
    await t.test(
      "private upload and unauthorized download blocked",
      async () => {
        documentId = await upload();
        const ok = await fetch(
          `${base}/api/requests/${request.id}/documents/${documentId}`,
          { headers: { "X-Test-Actor": resident.id } },
        );
        assert.equal(ok.status, 200);
        const blocked = await fetch(
          `${base}/api/requests/${request.id}/documents/${documentId}`,
          { headers: { "X-Test-Actor": other.id } },
        );
        assert.equal(blocked.status, 404);
        assert.equal(
          (await pool.query("SELECT count(*)::integer AS count FROM media"))
            .rows[0].count,
          0,
        );
      },
    );
    await t.test(
      "submission is idempotent, persists business and immutable history",
      async () => {
        const key = crypto.randomUUID(),
          data = { version: await version(), declaration: true };
        request = await engine.submit(resident, request.id, data, key);
        assert.equal(request.status, "SUBMITTED");
        assert.deepEqual(
          await engine.submit(resident, request.id, data, key),
          JSON.parse(JSON.stringify(request)),
        );
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::integer AS count FROM business_applications",
            )
          ).rows[0].count,
          1,
        );
        await assert.rejects(
          () =>
            pool.query(
              "UPDATE request_status_history SET reason=$1 WHERE request_id=$2",
              ["tamper", request.id],
            ),
          /immutable/,
        );
      },
    );
    await t.test(
      "department boundaries and real permission-engine denial",
      async () => {
        const grant = { user_id: outsider.id, department_id: "treasury" };
        assert.equal((await call(processor, "/api/admin/eservices/department-members", "POST", grant)).status, 200);
        assert.equal((await engine.detail(outsider, request.id, true)).id, request.id);
        assert.equal((await call(processor, "/api/admin/eservices/department-members/revoke", "POST", grant)).status, 200);
        await assert.rejects(() => engine.detail(outsider, request.id, true), {
          status: 403,
        });
        await assert.rejects(() => action("status", { status: "COMPLETED" }), {
          status: 409,
        });
        await assert.rejects(
          () => action("assign", { assigned_user_id: processor.id }, denied),
          { status: 403 },
        );
      },
    );
    await t.test("assignment and review", async () => {
      await action("assign", { assigned_user_id: processor.id });
      assert.equal(
        (
          await engine.read(
            "SELECT assigned_user_id FROM service_requests WHERE id=?",
            [request.id],
          )
        )[0].assigned_user_id,
        processor.id,
      );
      await action("status", { status: "RECEIVED" });
      await action("status", { status: "IN_REVIEW" });
    });
    await t.test(
      "simultaneous staff updates reject the stale writer",
      async () => {
        const current = await version();
        const results = await Promise.allSettled([
          engine.process(
            processor,
            request.id,
            "assign",
            { version: current, assigned_user_id: processor.id },
            crypto.randomUUID(),
          ),
          engine.process(
            cashier,
            request.id,
            "assign",
            { version: current, assigned_user_id: cashier.id },
            crypto.randomUUID(),
          ),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          results.find((r) => r.status === "rejected").reason.status,
          409,
        );
      },
    );
    await t.test(
      "staff-only notes stay private and document corrections preserve history",
      async () => {
        await action("note", {
          message: "Private staff note",
          visibility: "INTERNAL",
        });
        await action("document", {
          document_id: documentId,
          status: "REPLACEMENT_REQUIRED",
          reason: "Please upload a clearer copy.",
        });
        await action("information", {
          message: "Please upload a clearer copy.",
        });
        const residentDetail = await engine.detail(resident, request.id);
        assert(!residentDetail.notes.some((n) => n.visibility === "INTERNAL"));
        assert.equal(residentDetail.status, "NEEDS_INFORMATION");
        const replacement = await upload(documentId);
        await engine.submit(
          resident,
          request.id,
          { version: await version(), declaration: true },
          crypto.randomUUID(),
          null,
          true,
        );
        await action("document", {
          document_id: replacement,
          status: "ACCEPTED",
        });
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM request_documents WHERE request_id=?",
              [request.id],
            )
          )[0].count,
          2,
        );
      },
    );
    let order;
    await t.test(
      "assessment rolls back all records on failure and calculates authorized totals",
      async () => {
        await action("status", { status: "FOR_ASSESSMENT" });
        const audit = engine.audit;
        engine.audit = async function (...args) {
          if (args[2] === "assessment.created")
            throw new Error("Injected test failure");
          return audit.apply(this, args);
        };
        await assert.rejects(
          () => action("assessment"),
          /Injected test failure/,
        );
        engine.audit = audit;
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM payment_orders",
            )
          )[0].count,
          0,
        );
        assert.equal(
          (await engine.detail(resident, request.id)).status,
          "FOR_ASSESSMENT",
        );
        const result = await action("assessment", { amount: "0.01" });
        order = result.order;
        assert.equal(order.amount, "30.30");
        assert.equal(result.request.status, "AWAITING_PAYMENT");
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM payment_order_items WHERE payment_order_id=?",
              [order.id],
            )
          )[0].count,
          2,
        );
      },
    );
    await t.test(
      "unpaid assessment replacement preserves prior orders and uses only CMS fees",
      async () => {
        await engine.saveService(
          processor,
          {
            ...service,
            declaration: service.definition.declaration,
            fees: [
              {
                code: "FEE1",
                description: "Revised authorized fee",
                amount: "10.20",
                source: "Test revision two",
              },
              {
                code: "FEE2",
                description: "Revised authorized fee two",
                amount: "20.10",
                source: "Test revision two",
              },
            ],
          },
          service.id,
        );
        const old = order;
        const adjusted = await engine.adjustAssessment(
          processor,
          request.id,
          {
            version: await version(),
            reason: "Apply the newly authorized schedule",
            amount: "0.01",
          },
          crypto.randomUUID(),
        );
        order = adjusted.order;
        assert.equal(order.amount, "30.30");
        assert.equal(
          (await engine.order(resident, old.id)).status,
          "CANCELLED",
        );
        assert.equal(
          (await engine.detail(resident, request.id)).configuration_revision,
          1,
        );
        assert.equal(
          (await engine.order(resident, order.id)).items[0].source,
          "Test revision two",
        );
      },
    );
    await t.test(
      "payment permissions, separation of duties, partial payment and duplicate confirmation",
      async () => {
        await assert.rejects(
          () =>
            engine.confirmPayment(
              processor,
              order.id,
              { amount: "30.30", reference: "self" },
              crypto.randomUUID(),
            ),
          { status: 403 },
        );
        await assert.rejects(
          () =>
            engine.confirmPayment(
              outsider,
              order.id,
              { amount: "30.30", reference: "outsider" },
              crypto.randomUUID(),
            ),
          { status: 403 },
        );
        await assert.rejects(
          () =>
            engine.confirmPayment(
              cashier,
              order.id,
              { amount: "100.00", reference: "overpay" },
              crypto.randomUUID(),
            ),
          { status: 422 },
        );
        const first = await engine.confirmPayment(
          cashier,
          order.id,
          { amount: "10.10", reference: "TEST-CASH-1" },
          crypto.randomUUID(),
        );
        assert.equal(first.status, "PARTIALLY_PAID");
        await assert.rejects(
          async () =>
            engine.adjustAssessment(
              processor,
              request.id,
              {
                version: await version(),
                reason: "Attempt adjustment after payment",
              },
              crypto.randomUUID(),
            ),
          { status: 409 },
        );
        const key = crypto.randomUUID(),
          data = { amount: "20.20", reference: "TEST-CASH-2" };
        const paid = await engine.confirmPayment(cashier, order.id, data, key);
        assert.equal(paid.status, "PAID");
        assert.deepEqual(
          await engine.confirmPayment(cashier, order.id, data, key),
          paid,
        );
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM payments WHERE payment_order_id=?",
              [order.id],
            )
          )[0].count,
          2,
        );
        await assert.rejects(
          () => pool.query("DELETE FROM payments WHERE id=$1", [paid.id]),
          /adjustment/,
        );
        assert.equal(
          (await engine.order(resident, order.id)).receipts.filter(
            (r) => r.kind === "OFFICIAL",
          ).length,
          0,
        );
      },
    );
    await t.test(
      "approval, release, completion, full history and audit",
      async () => {
        await action("status", { status: "FOR_APPROVAL" });
        await action("approve");
        await action("status", { status: "FOR_RELEASE" });
        await action("status", { status: "COMPLETED" });
        const detail = await engine.detail(resident, request.id);
        assert.equal(detail.status, "COMPLETED");
        assert(detail.completed_at);
        assert(detail.history.some((e) => e.to_status === "NEEDS_INFORMATION"));
        assert(
          (
            await engine.read(
              "SELECT 1 FROM audit_logs WHERE category='eservices'",
            )
          ).length > 10,
        );
        assert(
          (await engine.read("SELECT 1 FROM eservice_notification_outbox"))
            .length > 5,
        );
        assert.equal(
          (await engine.read("SELECT status FROM businesses"))[0].status,
          "ACTIVE",
        );
      },
    );
    await t.test(
      "renewal retains business and reuses permitted values in a new transaction",
      async () => {
        const business = (await engine.read("SELECT id FROM businesses"))[0];
        const renewal = await engine.saveService(
          processor,
          {
            ...service,
            id: undefined,
            name: "Test renewal",
            slug: `renew-${resident.id}`,
            kind: "BUSINESS_RENEWAL",
            declaration: service.definition.declaration,
          },
          null,
        );
        const draft = await engine.createDraft(
          resident,
          { service_id: renewal.id, business_id: business.id },
          crypto.randomUUID(),
        );
        const detail = await engine.detail(resident, draft.id);
        assert.equal(detail.values.business_name, "Test business");
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM businesses",
            )
          )[0].count,
          1,
        );
        assert.equal(
          (await engine.detail(resident, request.id)).status,
          "COMPLETED",
        );
        await assert.rejects(
          () =>
            engine.createDraft(
              other,
              { service_id: renewal.id, business_id: business.id },
              crypto.randomUUID(),
            ),
          { status: 404 },
        );
      },
    );
    await t.test(
      "durable outbox uses existing notifications and deduplicates delivery",
      async () => {
        await drainEserviceOutbox(engine);
        const before = (
          await engine.read(
            "SELECT count(*)::integer AS count FROM notifications",
          )
        )[0].count;
        assert(before > 5);
        await drainEserviceOutbox(engine);
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM notifications",
            )
          )[0].count,
          before,
        );
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM eservice_notification_outbox WHERE delivered_at IS NULL",
            )
          )[0].count,
          0,
        );
      },
    );
    await t.test(
      "authorized source billing, verified provider callback, replay and immutable reversal",
      async () => {
        const imported = await call(
          processor,
          "/api/staff/eservices/billing",
          "POST",
          {
            account_type: "WATER",
            account_number: "TEST-WATER",
            user_id: resident.id,
            department_id: "treasury",
            source: "Test-only authorized utility source",
            source_reference: "TEST-STMT-1",
            period: "2026-10",
            items: [{ description: "Source charge", amount: "40.40" }],
          },
        );
        assert.equal(imported.status, 200, JSON.stringify(imported.body));
        const waterOrder = imported.body.order;
        const initialStatement = await call(
          resident,
          `/api/billing/accounts/${imported.body.account.id}/statements`,
        );
        assert.equal(
          initialStatement.status,
          200,
          JSON.stringify(initialStatement.body),
        );
        assert.equal(initialStatement.body.items[0].balance, "40.40");
        assert.equal(
          (
            await call(
              other,
              `/api/billing/accounts/${imported.body.account.id}/statements`,
            )
          ).status,
          404,
        );
        const payload = JSON.stringify({
            status: "CONFIRMED",
            currency: "PHP",
            orderId: waterOrder.id,
            reference: "TEST-GATEWAY-1",
            amount: "40.40",
          }),
          timestamp = String(Math.floor(Date.now() / 1000)),
          signature = crypto
            .createHmac("sha256", gatewaySecret)
            .update(timestamp + ".")
            .update(payload)
            .digest("hex");
        const webhook = async (sig) => {
          const response = await fetch(
            `${base}/api/eservices/payment-webhooks/TEST_GATEWAY`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Timestamp": timestamp,
                "X-Signature": sig,
              },
              body: payload,
            },
          );
          return { status: response.status, body: await response.json() };
        };
        assert.equal((await webhook("bad")).status, 403);
        const payment = await webhook(signature);
        assert.equal(payment.status, 200, JSON.stringify(payment.body));
        assert.equal(payment.body.status, "PAID");
        assert.equal(
          (
            await call(
              resident,
              `/api/billing/accounts/${imported.body.account.id}/statements`,
            )
          ).body.items[0].balance,
          "0.00",
        );
        const replay = await webhook(signature);
        assert.equal(replay.body.id, payment.body.id);
        assert.equal(
          (
            await engine.read(
              "SELECT count(*)::integer AS count FROM payments WHERE payment_order_id=?",
              [waterOrder.id],
            )
          )[0].count,
          1,
        );
        const reversal = await engine.reversePayment(
          processor,
          payment.body.id,
          { reason: "Test-only authorized reversal" },
          crypto.randomUUID(),
        );
        assert.equal(reversal.status, "UNPAID");
        assert.equal(
          (
            await call(
              resident,
              `/api/billing/accounts/${imported.body.account.id}/statements`,
            )
          ).body.items[0].balance,
          "40.40",
        );
        assert.equal(
          (
            await engine.read("SELECT status FROM payments WHERE id=?", [
              payment.body.id,
            ])
          )[0].status,
          "CONFIRMED",
        );
        assert.equal(
          (await engine.order(resident, waterOrder.id)).adjustments.length,
          1,
        );
      },
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await root.query(`DROP SCHEMA ${schema} CASCADE`);
    await root.end();
    await closeConfigStore();
  }
});
