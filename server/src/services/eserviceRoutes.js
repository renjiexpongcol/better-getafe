import express from "express";
import crypto from "node:crypto";
import { EserviceEngine } from "./eserviceEngine.js";
import { publicService } from './eservicePresentation.js';
import { appointmentAvailability } from "./appointmentScheduling.js";
import {
  fail,
  uuid,
  text,
  inspectDocument,
  cents,
  decimal,
} from "./eserviceValidation.js";
import { writeEserviceFile, readCitizenFile, deleteCitizenFile } from "./storage.js";
import { requireAccess } from "./authorizationService.js";
import { actionThrottle } from "./authSecurity.js";
import {
  createInAppNotification,
  queueOptionalNotification,
} from "./notificationService.js";
import { getPostgresRuntime } from "../repositories/postgresRuntime.js";
import { getCmsUserById, searchDepartmentStaff } from "../repositories/cmsUserRepository.js";
import { PaymentProviderRegistry } from "./eservicePaymentProviders.js";
import { getCmsPool } from "./cloudSql.js";
import { getMediaByStoragePath } from "../repositories/mediaRepository.js";
import { createDownloadUrl } from "./storage.js";

export function installEserviceRoutes(
  app,
  {
    resident,
    admin,
    permission,
    engine = new EserviceEngine(),
    scan = null,
    providers = new PaymentProviderRegistry(),
    files = {
    write: writeEserviceFile,
      read: readCitizenFile,
      remove: deleteCitizenFile,
    },
    throttleUpload = actionThrottle,
    cmsPool = getCmsPool,
    findStaff = getCmsUserById,
    searchStaff = searchDepartmentStaff,
  },
) {
  const handle = (work) => async (req, res) => {
    res.set("Cache-Control", "no-store, private");
    try {
      await work(req, res);
    } catch (error) {
      const status =
        error.code === "23505"
          ? 409
          : [400, 403, 404, 409, 422, 429].includes(error.status)
            ? error.status
            : 503;
      if (status === 503)
        console.error(
          JSON.stringify({
            event: "eservices.failure",
            request_id: req.requestId,
            code: error.code || "UNAVAILABLE",
            route: req.route?.path,
          }),
        );
      res.status(status).json({
        request_id: req.requestId,
        error:
          status === 503
            ? "This service is temporarily unavailable. Your saved information is preserved. Please try again."
            : error.code === "23505"
              ? "This record or transaction reference already exists."
              : error.message,
      });
    }
  };
  const key = (req) => req.get("Idempotency-Key");
  const actor = (req) => ({ ...req.resident, kind: "resident" });
  const validateProvider = data => { if(data.settings?.payment_provider) { const provider=providers.getOnline(data.settings.payment_provider); if(typeof provider.checkout!=='function') fail('This provider does not support online checkout.'); } return data; };
  app.get('/api/staff/eservices/billing-parties',admin,permission('billing.manage'),handle(async(req,res)=>{
    const q=text(req.query.q || '',100);
    if (q.length<2) return res.json({items:[]});
    const items=await engine.read(`SELECT DISTINCT u.id,u.name,u.email,b.id AS business_id,b.business_name,b.business_reference
      FROM portal_users u LEFT JOIN business_owners owner ON owner.user_id=u.id AND owner.effective_until IS NULL LEFT JOIN businesses b ON b.id=owner.business_id
      WHERE (u.name ILIKE ? OR u.email ILIKE ? OR b.business_name ILIKE ? OR b.business_reference ILIKE ?)
      AND (b.id IS NULL OR EXISTS(SELECT 1 FROM business_applications ba JOIN service_requests r ON r.id=ba.request_id JOIN eservice_department_members m ON m.department_id=r.department_id WHERE ba.business_id=b.id AND m.user_id=?) OR EXISTS(SELECT 1 FROM billing_accounts a JOIN eservice_department_members m ON m.department_id=a.department_id WHERE a.business_id=b.id AND m.user_id=?))
      ORDER BY u.name,b.business_name LIMIT 20`,[...Array(4).fill(`%${q}%`),req.admin.id,req.admin.id]);
    res.json({items});
  }));
  app.get('/api/requests/:id/business-billing',resident,handle(async(req,res)=>res.json(await engine.businessBilling(actor(req),req.params.id))));
  app.post('/api/requests/:id/select-assessment',resident,handle(async(req,res)=>res.json(await engine.selectBillingOrder(actor(req),req.params.id,req.body,key(req),req.requestId))));
  app.post('/api/requests/:id/review-assessment',resident,handle(async(req,res)=>res.json(await engine.reviewBillingOrder(actor(req),req.params.id,req.body,key(req),req.requestId))));
  app.post('/api/payment-orders/:id/payment-submissions',resident,handle(async(req,res)=>res.status(201).json(await engine.submitPaymentAttempt(actor(req),req.params.id,req.body,key(req),req.requestId))));
  app.post('/api/staff/eservices/payment-orders/:id/reject-submission',admin,permission('payments.verify'),handle(async(req,res)=>res.json(await engine.rejectPaymentAttempt(req.admin,req.params.id,req.body,key(req),req.requestId))));
  app.post('/api/staff/eservices/payment-orders/:id/receipt',admin,permission('payments.verify'),handle(async(req,res)=>res.status(201).json(await engine.issueOfficialReceipt(req.admin,req.params.id,req.body,key(req),req.requestId))));
  app.post(
    "/api/eservices/payment-webhooks/:provider",
    handle(async (req, res) => {
      const event = await providers.verify(
        req.params.provider,
        req.rawBody,
        req.headers,
      );
      const verifier = await getCmsUserById(event.verifierUserId);
      if (!verifier) fail("Payment verifier is unavailable.", 503);
      const result = await engine.confirmPayment(
        verifier,
        event.orderId,
        { amount: String(event.amount), reference: event.reference },
        `callback-${crypto.createHash("sha256").update(event.reference).digest("hex")}`,
        req.requestId,
        event.provider,
      );
      res.json(result);
    }),
  );
  app.get(
    "/api/services",
    handle(async (req, res) => res.json({ items: (await engine.catalog()).map(publicService) })),
  );
  app.get(
    "/api/services/:slug",
    handle(async (req, res) => {
      const service = await engine.configuration(req.params.slug);
      if (service.hero_image) {
        const media = await getMediaByStoragePath(service.hero_image);
        if (media?.status === "active")
          service.hero_url = await createDownloadUrl(
            media.storage_path,
            media.storage_bucket,
          );
      }
      const [department] = service.department_id ? await engine.read('SELECT name FROM departments WHERE id=?', [service.department_id]) : [];
      res.json(publicService({ ...service, department_name: department?.name }));
    }),
  );
  app.post(
    "/api/requests",
    resident,
    handle(async (req, res) =>
      res
        .status(201)
        .json(
          await engine.createDraft(
            actor(req),
            req.body,
            key(req),
            req.requestId,
          ),
        ),
    ),
  );
  app.get(
    "/api/requests",
    resident,
    handle(async (req, res) =>
      res.json(await engine.list(actor(req), req.query)),
    ),
  );
  app.get(
    "/api/requests/:id",
    resident,
    handle(async (req, res) =>
      res.json(
        await engine.detail(actor(req), req.params.id, false, req.requestId),
      ),
    ),
  );
  app.get(
    "/api/requests/:id/appointment-availability",
    resident,
    handle(async (req, res) => {
      const request = await engine.detail(actor(req), req.params.id);
      if (!request.settings_snapshot?.appointment_required || request.status !== 'DRAFT')
        fail('Appointment booking is unavailable for this application.', 409);
      res.json(await appointmentAvailability(engine.read.bind(engine), request.service_id));
    }),
  );
  app.patch(
    "/api/requests/:id/draft",
    resident,
    handle(async (req, res) =>
      res.json(
        await engine.saveDraft(
          actor(req),
          req.params.id,
          req.body,
          req.requestId,
        ),
      ),
    ),
  );
  for (const operation of ["submit", "respond"])
    app.post(
      `/api/requests/:id/${operation}`,
      resident,
      handle(async (req, res) =>
        res.json(
          await engine.submit(
            actor(req),
            req.params.id,
            req.body,
            key(req),
            req.requestId,
            operation === "respond",
          ),
        ),
      ),
    );
  app.post(
    "/api/requests/:id/documents",
    resident,
    express.raw({
      type: ["application/pdf", "image/png", "image/jpeg"],
      limit: "10mb",
    }),
    handle(async (req, res) => {
      const throttle = await throttleUpload(
        "eservices-upload",
        req.resident.id,
        20,
        3600000,
      );
      if (!throttle.allowed) {
        res.set("Retry-After", String(throttle.retryAfter));
        fail("Too many uploads. Please try again later.", 429);
      }
      const mime = req.get("Content-Type")?.split(";")[0],
        checksum = inspectDocument(req.body, mime),
        storageKey = `eservices/${uuid(req.params.id)}/${crypto.randomUUID()}`;
      // Binary objects are private and never registered as public Media Library assets.
      let stored = false;
      try {
        const result = await engine.idempotent(
          actor(req),
          `upload:${req.params.id}`,
          key(req),
          {
            checksum,
            requirement: req.get("X-Requirement-Id"),
            replaces: req.get("X-Replaces-Id") || null,
          },
          async (db) => {
            const request = await engine.owned(
              db,
              actor(req),
              req.params.id,
              true,
            );
            engine.stale(request, req.get("X-Request-Version"));
            if (!["DRAFT", "NEEDS_INFORMATION"].includes(request.status))
              fail("Documents cannot be changed at this stage.", 409);
            const [requirement] = await db(
              "SELECT * FROM service_requirements WHERE id=? AND service_id=? AND revision=?",
              [
                uuid(req.get("X-Requirement-Id")),
                request.service_id,
                request.configuration_revision,
              ],
            );
            if (!requirement) fail("Requirement not found.", 404);
            const [current] = await db(
              "SELECT d.* FROM request_documents d WHERE d.request_id=? AND d.requirement_id=? AND NOT EXISTS(SELECT 1 FROM request_documents n WHERE n.replaces_id=d.id) ORDER BY d.uploaded_at DESC LIMIT 1 FOR UPDATE",
              [request.id, requirement.id],
            );
            const replacement = req.get("X-Replaces-Id") || null;
            if ((current?.id || null) !== replacement)
              fail("Refresh before replacing this document.", 409);
            if (scan && !(await scan(req.body, mime)))
              fail("The document did not pass the security scan.");
            await files.write(storageKey, req.body, mime);
            stored = true;
            const filename =
              text(
                decodeURIComponent(req.get("X-Filename") || "document"),
                200,
              ).replace(/[^a-zA-Z0-9._ -]/g, "_") || "document";
            const [document] = await db(
              "INSERT INTO request_documents(request_id,requirement_id,storage_key,original_filename,mime_type,size_bytes,checksum,uploaded_by,replaces_id,scan_status) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id",
              [
                request.id,
                requirement.id,
                storageKey,
                filename,
                mime,
                req.body.length,
                checksum,
                req.resident.id,
                replacement,
                scan ? "CLEAN" : "UNSCANNED",
              ],
            );
            await db(
              "UPDATE service_requests SET version=version+1,updated_at=now() WHERE id=?",
              [request.id],
            );
            await engine.audit(
              db,
              actor(req),
              "document.uploaded",
              document.id,
              { request_id: request.id, checksum },
              req.requestId,
            );
            return document;
          },
        );
        res.status(201).json(result);
      } catch (error) {
        if (stored) {
          try {
            const committed = await engine.read(
              "SELECT 1 FROM request_documents WHERE storage_key=?",
              [storageKey],
            );
            if (!committed.length) await files.remove(storageKey);
          } catch {
            console.error("Private upload cleanup requires reconciliation.");
          }
        }
        throw error;
      }
    }),
  );
  const download = (staff) =>
    handle(async (req, res) => {
      const result = await engine.transaction(async (db) => {
        const request = staff
          ? await engine.staff(db, req.admin, req.params.id, "documents.view")
          : await engine.owned(db, actor(req), req.params.id);
        const [document] = await db(
          "SELECT * FROM request_documents WHERE request_id=? AND id=?",
          [request.id, uuid(req.params.documentId)],
        );
        if (!document) fail("Document not found.", 404);
        await engine.audit(
          db,
          staff ? req.admin : actor(req),
          "document.downloaded",
          document.id,
          {},
          req.requestId,
        );
        const bytes = await files.read(document.storage_key);
        return { document, bytes };
      });
      res
        .set({
          "Content-Type": result.document.mime_type,
          "Content-Disposition": `attachment; filename="${result.document.original_filename.replace(/["\r\n]/g, "_")}"`,
          "X-Content-Type-Options": "nosniff",
        })
        .send(result.bytes);
    });
  app.get("/api/requests/:id/documents/:documentId", resident, download(false));
  app.get(
    "/api/staff/eservices/requests/:id/documents/:documentId",
    admin,
    download(true),
  );
  app.get(
    "/api/staff/eservices/requests",
    admin,
    handle(async (req, res) =>
      res.json(await engine.list(req.admin, req.query, true)),
    ),
  );
  app.get(
    "/api/staff/eservices/requests/:id",
    admin,
    handle(async (req, res) =>
      res.json(
        await engine.detail(req.admin, req.params.id, true, req.requestId),
      ),
    ),
  );
  for (const [path, operation] of Object.entries({
    assign: "assign",
    status: "status",
    "request-information": "information",
    notes: "note",
    documents: "document",
    assessment: "assessment",
    approve: "approve",
  }))
    app.post(
      `/api/staff/eservices/requests/:id/${path}`,
      admin,
      handle(async (req, res) =>
        res.json(
          await engine.process(
            req.admin,
            req.params.id,
            operation,
            req.body,
            key(req),
            req.requestId,
          ),
        ),
      ),
    );
  app.post('/api/businesses', resident, handle(async (req, res) => res.status(201).json(await engine.saveProfileBusiness(actor(req), null, req.body, key(req), req.requestId))));
  app.put('/api/businesses/:id', resident, handle(async (req, res) => res.json(await engine.saveProfileBusiness(actor(req), req.params.id, req.body, key(req), req.requestId))));
  app.get(
    "/api/businesses",
    resident,
    handle(async (req, res) =>
      res.json({
        items: await engine.read(
          "SELECT b.*,(b.status='UNVERIFIED' AND NOT EXISTS(SELECT 1 FROM service_requests r WHERE r.status NOT IN ('DRAFT','CANCELLED','REJECTED') AND (EXISTS(SELECT 1 FROM request_business_billing x WHERE x.request_id=r.id AND x.business_id=b.id) OR EXISTS(SELECT 1 FROM business_applications a WHERE a.request_id=r.id AND a.business_id=b.id)))) AS profile_editable,u.name AS owner_name,COALESCE((SELECT string_agg(a.account_number,', ') FROM billing_accounts a WHERE a.business_id=b.id AND a.user_id=o.user_id),'') AS account_numbers FROM businesses b JOIN business_owners o ON o.business_id=b.id JOIN portal_users u ON u.id=o.user_id WHERE o.user_id=? AND o.effective_until IS NULL",
          [req.resident.id],
        ),
      }),
    ),
  );
  app.post(
    "/api/staff/eservices/requests/:id/adjust-assessment",
    admin,
    handle(async (req, res) =>
      res.json(
        await engine.adjustAssessment(
          req.admin,
          req.params.id,
          req.body,
          key(req),
          req.requestId,
        ),
      ),
    ),
  );
  app.get(
    "/api/billing/accounts",
    resident,
    handle(async (req, res) =>
      res.json({
        items: await engine.read(
          "SELECT * FROM billing_accounts WHERE user_id=? ORDER BY account_type,account_number",
          [req.resident.id],
        ),
      }),
    ),
  );
  app.get(
    "/api/billing/accounts/:id/statements",
    resident,
    handle(async (req, res) => {
      if (
        !(
          await engine.read(
            "SELECT 1 FROM billing_accounts WHERE id=? AND user_id=?",
            [uuid(req.params.id), req.resident.id],
          )
        ).length
      )
        fail("Account not found.", 404);
      res.json({
        items: await engine.read(
          "SELECT s.*,t.total::text AS total,GREATEST(t.total-COALESCE(p.total,0),0)::text AS balance FROM billing_statements s CROSS JOIN LATERAL(SELECT COALESCE(sum(i.amount),0) AS total FROM billing_statement_items i WHERE i.statement_id=s.id) t LEFT JOIN LATERAL(SELECT COALESCE(sum(payment.amount),0) AS total FROM payment_orders o JOIN payments payment ON payment.payment_order_id=o.id WHERE o.statement_id=s.id AND payment.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=payment.id)) p ON TRUE WHERE s.account_id=? ORDER BY s.created_at DESC LIMIT 100",
          [req.params.id],
        ),
        orders: await engine.read(
          "SELECT o.* FROM payment_orders o JOIN billing_statements s ON s.id=o.statement_id WHERE s.account_id=? ORDER BY o.created_at DESC LIMIT 100",
          [req.params.id],
        ),
      });
    }),
  );
  app.get(
    "/api/payment-orders",
    resident,
    handle(async (req, res) =>
      res.json({
        items: await engine.read(
          "SELECT o.*,COALESCE(a.account_type,CASE WHEN EXISTS(SELECT 1 FROM business_applications b WHERE b.request_id=o.request_id) THEN 'BUSINESS' ELSE 'OTHER' END) AS account_type FROM payment_orders o LEFT JOIN billing_statements statement ON statement.id=o.statement_id LEFT JOIN billing_accounts a ON a.id=statement.account_id WHERE o.user_id=? ORDER BY o.created_at DESC LIMIT 100",
          [req.resident.id],
        ),
      }),
    ),
  );
  app.get(
    "/api/payment-orders/:id",
    resident,
    handle(async (req, res) =>
      res.json(await engine.order(actor(req), req.params.id)),
    ),
  );
  app.post(
    "/api/payment-orders/:id/checkout",
    resident,
    handle(async (req, res) => {
      const owner=actor(req),orderId=uuid(req.params.id);
      const intent=await engine.idempotent(owner,`checkout:${orderId}`,key(req),{},async db=>{
        const [order]=await db('SELECT * FROM payment_orders WHERE id=? AND user_id=? FOR UPDATE',[orderId,owner.id]);
        if(!order || !['UNPAID','ISSUED','PARTIALLY_PAID'].includes(order.status) || (order.expires_at && new Date(order.expires_at)<=new Date())) fail('Assessment unavailable for payment.',409);
        const [request]=await db('SELECT r.*,x.reviewed_order_id,x.business_id FROM service_requests r JOIN request_business_billing x ON x.request_id=r.id WHERE r.id=? OR x.selected_order_id=?',[order.request_id,orderId]);
        if(!request || request.status!=='AWAITING_PAYMENT' || request.reviewed_order_id!==orderId) fail('Review the current assessment before payment.',409);
        if (!(await db('SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL',[request.business_id,owner.id])).length) fail('Business access required.',403);
        const provider=providers.getOnline(request.settings_snapshot?.payment_provider);
        if(typeof provider.checkout!=='function') fail('Online payment is currently unavailable.',409);
        if((await db("SELECT 1 FROM payment_attempts WHERE payment_order_id=? AND status='PENDING'",[orderId])).length) fail('A manual payment is already awaiting verification.',409);
        const [existing]=await db("SELECT * FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING'",[orderId]);
        if(existing) return existing;
        const [paid]=await db("SELECT COALESCE(sum(p.amount),0)::text AS total FROM payments p WHERE p.payment_order_id=? AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)",[orderId]);
        const [checkout]=await db('INSERT INTO payment_gateway_checkouts(payment_order_id,user_id,provider,amount) VALUES(?,?,?,?) RETURNING *',[orderId,owner.id,provider.id,decimal(cents(order.amount)-cents(paid.total))]);
        await engine.audit(db,owner,'payment.checkout.requested',request.id,{checkout_id:checkout.id,amount:checkout.amount},req.requestId);
        return checkout;
      });
      const [current]=await engine.read('SELECT * FROM payment_gateway_checkouts WHERE id=?',[intent.id]);
      if(current.status!=='PENDING') return res.json({status:current.status});
      if(current.checkout_url) return res.json({url:current.checkout_url,status:'PENDING'});
      const provider=providers.getOnline(current.provider);
      // Adapter contract: retrying this key must return the same provider checkout.
      const result=await provider.checkout({orderId,amount:current.amount,currency:'PHP',idempotencyKey:current.id});
      let url; try {url=new URL(result?.url);} catch {fail('The payment provider did not return a checkout address.',503);}
      if(url.protocol!=='https:' || url.username || url.password || !provider.checkoutHosts?.includes(url.hostname)) fail('The payment provider returned an untrusted checkout address.',503);
      await engine.transaction(async db=>{await db('UPDATE payment_gateway_checkouts SET checkout_url=?,provider_reference=? WHERE id=? AND checkout_url IS NULL',[url.href,text(result.reference,200),current.id]);});
      res.json({url:url.href,status:'PENDING'});
    }),
  );
  app.get(
    "/api/staff/eservices/payment-orders/:id",
    admin,
    handle(async (req, res) =>
      res.json(await engine.order(req.admin, req.params.id, true)),
    ),
  );
  app.post(
    "/api/staff/eservices/payment-orders/:id/confirm",
    admin,
    handle(async (req, res) =>
      res.json(
        await engine.confirmPayment(
          req.admin,
          req.params.id,
          req.body,
          key(req),
          req.requestId,
        ),
      ),
    ),
  );
  app.post(
    "/api/staff/eservices/payments/:id/reverse",
    admin,
    handle(async (req, res) =>
      res.json(
        await engine.reversePayment(
          req.admin,
          req.params.id,
          req.body,
          key(req),
          req.requestId,
        ),
      ),
    ),
  );
  app.get(
    "/api/staff/eservices/options",
    admin,
    permission("requests.department.view"),
    handle(async (req, res) => {
      const members = await engine.read("SELECT user_id,department_id FROM eservice_department_members WHERE department_id IN(SELECT department_id FROM eservice_department_members WHERE user_id=?)", [req.admin.id]);
      const identities = await engine.staffIdentities(members.map(member => member.user_id));
      res.json({
        departments: await engine.read(
          "SELECT d.id,d.name FROM departments d JOIN eservice_department_members m ON m.department_id=d.id WHERE m.user_id=?",
          [req.admin.id],
        ),
        services: await engine.read(
          "SELECT id,name FROM services WHERE department_id IN(SELECT department_id FROM eservice_department_members WHERE user_id=?)",
          [req.admin.id],
        ),
        members: members.map(member => ({ ...member,staff_label:identities.get(member.user_id) || 'Staff member' })),
      });
    }),
  );
  app.get(
    "/api/staff/eservices/report",
    admin,
    permission("reports.view"),
    handle(async (req, res) =>
      res.json({
        items: await engine.read(
          "SELECT r.department_id,r.status,count(*)::integer AS count FROM service_requests r WHERE EXISTS(SELECT 1 FROM eservice_department_members m WHERE m.user_id=? AND m.department_id=r.department_id) GROUP BY r.department_id,r.status",
          [req.admin.id],
        ),
        outbox: await engine.read(
          "SELECT count(*)::integer AS pending FROM eservice_notification_outbox o JOIN service_requests r ON r.id=o.request_id WHERE delivered_at IS NULL AND EXISTS(SELECT 1 FROM eservice_department_members m WHERE m.user_id=? AND m.department_id=r.department_id)",
          [req.admin.id],
        ),
      }),
    ),
  );
  app.get(
    "/api/admin/services",
    admin,
    permission("services.catalog.view"),
    handle(async (req, res) => res.json(await engine.catalogPage(req.query))),
  );
  app.get(
    "/api/admin/services/options",
    admin,
    permission("services.catalog.view"),
    handle(async (req, res) =>
      res.json({
        payment_providers:[...providers.providers.values()].filter(p=>p.online && typeof p.checkout==='function' && typeof p.verifyWebhook==='function').map(p=>({id:p.id,name:p.name || p.id})),
        departments: (
          await (
            await getCmsPool()
          ).execute("SELECT id,name,published FROM departments ORDER BY name")
        )[0],
        categories: await engine.read(
          "SELECT * FROM service_categories ORDER BY name",
        ),
      }),
    ),
  );
  app.get(
    "/api/admin/services/:id",
    admin,
    permission("services.catalog.view"),
    handle(async (req, res) =>
      res.json(await engine.configuration(uuid(req.params.id), true)),
    ),
  );
  app.post(
    "/api/admin/services",
    admin,
    handle(async (req, res) =>
      res
        .status(201)
        .json(
          await engine.saveService(req.admin, validateProvider(req.body), null, req.requestId),
        ),
    ),
  );
  app.put(
    "/api/admin/services/:id",
    admin,
    handle(async (req, res) =>
      res.json(
        await engine.saveService(
          req.admin,
          validateProvider(req.body),
          uuid(req.params.id),
          req.requestId,
        ),
      ),
    ),
  );
  app.get(
    "/api/admin/service-categories",
    admin,
    permission("services.catalog.view"),
    handle(async (req, res) =>
      res.json({
        items: await engine.read(
          "SELECT * FROM service_categories ORDER BY name",
        ),
      }),
    ),
  );
  app.post(
    "/api/admin/service-categories",
    admin,
    permission("services.catalog.manage"),
    handle(async (req, res) =>
      res.json(
        await engine.transaction(async (db) => {
          const slug = text(req.body.slug, 120);
          if (!text(req.body.name, 200)) fail("Enter a category name.");
          if (!/^[a-z0-9-]+$/.test(slug)) fail("Enter a valid category slug.");
          const [category] = await db(
            "INSERT INTO service_categories(name,slug) VALUES(?,?) RETURNING *",
            [text(req.body.name, 200), slug],
          );
          await engine.audit(
            db,
            req.admin,
            "category.created",
            category.id,
            {},
            req.requestId,
          );
          return category;
        }),
      ),
    ),
  );
  app.get(
    "/api/admin/eservices/staff-search",
    admin,
    permission("eservices.admin"),
    handle(async (req, res) => {
      const q = text(req.query.q || "", 100);
      const limit = Number(req.query.limit || 10), page = Number(req.query.page || 1);
      if (!Number.isInteger(limit) || limit < 1 || limit > 20 || !Number.isInteger(page) || page < 1 || page > 100) fail("Invalid search pagination.", 400);
      res.json(q ? { ...await searchStaff(q, limit, (page - 1) * limit), page } : { items: [], has_more: false, page });
    }),
  );
  app.get(
    "/api/admin/eservices/department-members",
    admin,
    permission("eservices.admin"),
    handle(async (req, res) => {
      const userId = text(req.query.user_id, 200);
      if (!userId) fail("Choose a staff member.", 400);
      res.json({
        items: await engine.read(
          "SELECT m.user_id,m.department_id,d.name AS department_name FROM eservice_department_members m JOIN departments d ON d.id=m.department_id WHERE m.user_id=? ORDER BY d.name",
          [userId],
        ),
      });
    }),
  );
  app.get(
    "/api/admin/eservices/audit",
    admin,
    permission("eservices.admin"),
    permission("audit.view"),
    handle(async (req, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const items = await engine.read(
          "SELECT id,user_id,action,setting_key,new_value,correlation_id,created_at FROM audit_logs WHERE category='eservices' ORDER BY created_at DESC LIMIT 50 OFFSET ?",
          [(page - 1) * 50],
        );
      const identities = await engine.staffIdentities(items.flatMap(item => [item.user_id,item.setting_key]));
      res.json({ items:items.map(item => ({ ...item,staff_label:identities.get(item.user_id) || 'System',record_label:identities.get(item.setting_key) || item.setting_key })),page });
    }),
  );
  app.post(
    "/api/admin/eservices/department-members",
    admin,
    permission("eservices.admin"),
    handle(async (req, res) => {
      const staff = await findStaff(text(req.body.user_id, 200));
      if (
        !staff ||
        !["staff", "admin", "super_admin", "it_support"].includes(staff.role)
      )
        fail("Choose an active municipal staff account.");
      res.json(
        await engine.transaction(async (db) => {
          const departmentId = text(req.body.department_id, 200);
          if (!departmentId) fail("Choose a municipal office.", 400);
          const [departments] = await (await cmsPool()).execute("SELECT id FROM departments WHERE id=? AND published=TRUE", [departmentId]);
          if (!departments.length) fail("Choose an active municipal office.");
          await engine.syncDepartment(db, departmentId);
          await db(
            "INSERT INTO eservice_department_members(user_id,department_id) VALUES(?,?)",
            [staff.id, departmentId],
          );
          await engine.audit(
            db,
            req.admin,
            "department.access.granted",
            staff.id,
            { department_id: req.body.department_id },
            req.requestId,
          );
          return { ok: true };
        }),
      );
    }),
  );
  app.post(
    "/api/admin/eservices/department-members/revoke",
    admin,
    permission("eservices.admin"),
    handle(async (req, res) =>
      res.json(
        await engine.transaction(async (db) => {
          const removed = await db(
            "DELETE FROM eservice_department_members WHERE user_id=? AND department_id=? RETURNING user_id",
            [text(req.body.user_id, 200), text(req.body.department_id, 200)],
          );
          if (!removed.length) fail("This access has already been removed.", 404);
          await engine.audit(
            db,
            req.admin,
            "department.access.revoked",
            req.body.user_id,
            { department_id: req.body.department_id },
            req.requestId,
          );
          return { ok: true };
        }),
      ),
    ),
  );
  // Import only authorized source records; the source reference prevents duplicates.
  app.post(
    "/api/staff/eservices/billing",
    admin,
    permission("billing.manage"),
    handle(async (req, res) =>
      res.json(
        await engine.idempotent(
          req.admin,
          "billing-import",
          key(req),
          req.body,
          async (db) => {
            const data = req.body;
            await requireAccess(req.admin, "billing.manage", {
              department_id: data.department_id,
            });
            if (
              !(
                await db(
                  "SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?",
                  [req.admin.id, data.department_id],
                )
              ).length
            )
              fail("Department access required.", 403);
            if (
              !["BUSINESS", "REAL_PROPERTY", "WATER", "OTHER"].includes(
                data.account_type,
              )
            )
              fail("Choose a billing account type.");
            if (
              !Array.isArray(data.items) ||
              !data.items.length ||
              data.items.length > 100
            )
              fail("Enter statement items.");
            const total = decimal(
              data.items.reduce((sum, item) => sum + cents(item.amount), 0n),
            );
            if (cents(total) === 0n)
              fail("An imported payment order must have a positive amount.");
            if (
              !text(data.source_reference || "", 200) ||
              !text(data.account_number || "", 100) ||
              !text(data.period || "", 100)
            )
              fail(
                "Enter the account, billing period and authorized source reference.",
              );
            if (data.account_type === "BUSINESS") {
              if (
                !data.business_id ||
                !(
                  await db(
                    "SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL",
                    [uuid(data.business_id), data.user_id],
                  )
                ).length
              )
                fail(
                  "Business account ownership must match an existing owner.",
                );
            }
            const source = text(data.source, 500);
            if (!source) fail("Enter the authorized municipal data source.");
            const [account] = await db(
              "INSERT INTO billing_accounts(account_type,account_number,property_identifier,business_id,user_id,source,department_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_type,account_number) DO UPDATE SET account_number=EXCLUDED.account_number RETURNING *",
              [
                data.account_type,
                text(data.account_number, 100),
                data.property_identifier || null,
                data.business_id || null,
                text(data.user_id, 200),
                source,
                data.department_id,
              ],
            );
            if (
              account.user_id !== data.user_id ||
              account.department_id !== data.department_id
            )
              fail("Account ownership does not match.", 409);
            const [statement] = await db(
              "INSERT INTO billing_statements(account_id,period,due_at,source_reference) VALUES(?,?,?,?) RETURNING *",
              [
                account.id,
                text(data.period, 100),
                data.due_at || null,
                text(data.source_reference, 200),
              ],
            );
            for (const item of data.items)
              await db(
                "INSERT INTO billing_statement_items(statement_id,description,amount) VALUES(?,?,?)",
                [
                  statement.id,
                  text(item.description, 500),
                  String(item.amount),
                ],
              );
            const [order] = await db(
              "INSERT INTO payment_orders(order_number,statement_id,user_id,department_id,amount,assessed_by) VALUES('PO-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_order_reference')::text,6,'0'),?,?,?,?,?) RETURNING *",
              [
                statement.id,
                account.user_id,
                account.department_id,
                total,
                req.admin.id,
              ],
            );
            for (const [index, item] of data.items.entries())
              await db(
                "INSERT INTO payment_order_items(payment_order_id,fee_code,description,amount,source) VALUES(?,?,?,?,?)",
                [
                  order.id,
                  `SOURCE-${index}`,
                  item.description,
                  String(item.amount),
                  source,
                ],
              );
            await engine.audit(
              db,
              req.admin,
              "billing.imported",
              statement.id,
              { source, order_id: order.id },
              req.requestId,
            );
            return { account, statement, order };
          },
        ),
      ),
    ),
  );
  return engine;
}

// PostgreSQL outbox preserves events through Redis outages. Existing notification
// preferences and Redis email jobs handle delivery; retries never block requests.
export async function drainEserviceOutbox(engine = new EserviceEngine()) {
  return engine.transaction(async (db) => {
    const events = await db(
      "SELECT * FROM eservice_notification_outbox WHERE delivered_at IS NULL AND available_at<=now() ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED",
    );
    for (const event of events) {
      try {
        const notificationDb = await getPostgresRuntime("portal");
        await createInAppNotification({
          db: notificationDb,
          userId: event.user_id,
          title: event.title,
          message: event.message,
          type: event.event_type,
          eventKey: `eservices:${event.id}`,
        });
        const delivery = await queueOptionalNotification({
          userId: event.user_id,
          type: event.event_type,
          data: {
            title: event.title,
            message: event.message,
            applicationId: event.request_id,
          },
          eventId: `eservices:${event.id}`,
          retryFailed: true,
        });
        if (delivery.status === "failed")
          fail("Notification delivery requires retry.", 503);
        await db(
          "UPDATE eservice_notification_outbox SET delivered_at=now(),attempts=attempts+1 WHERE id=?",
          [event.id],
        );
      } catch {
        await db(
          "UPDATE eservice_notification_outbox SET attempts=attempts+1,available_at=now()+(LEAST(3600,30*power(2,LEAST(attempts,7)))::text||' seconds')::interval WHERE id=?",
          [event.id],
        );
        console.error(
          JSON.stringify({
            event: "eservices.notification.retry",
            correlation_id: event.id,
            attempts: event.attempts + 1,
          }),
        );
      }
    }
    return events.length;
  });
}
