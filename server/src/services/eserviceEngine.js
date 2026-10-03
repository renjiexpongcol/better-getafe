import crypto from "node:crypto";
import { barangays } from "../../../src/data/barangays.js";
import { PUBLIC_STATUS, publicStatus, PROFILE_SOURCES, fieldProfileSource, profileValues } from '../../../src/data/serviceApplication.js';
import { businessBillingMethods } from './businessBilling.js';
import { BILLING_STEPS, WORKFLOW_TYPES, PAYMENT_METHODS } from '../../../src/data/businessBillingWorkflow.js';
import { APPLICATION_STEPS, WORKFLOW_PERMISSIONS } from "../../../src/data/eserviceWorkflow.js";
import { getPortalPool, getCmsPool } from "./cloudSql.js";
import { requireAccess } from "./authorizationService.js";
import { appointmentAvailability, appointmentSlotLockValues, isExactAppointmentMinute } from "./appointmentScheduling.js";
import {
  fail,
  uuid,
  text,
  cents,
  decimal,
  totalFees,
  validateValues,
  validateWorkflow,
} from "./eserviceValidation.js";

const hash = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class EserviceEngine {
  constructor({ pool = getPortalPool, authorize = requireAccess } = {}) {
    this.pool = pool;
    this.authorize = authorize;
  }
  async read(sql, values = []) {
    const [rows] = await (await this.pool()).execute(sql, values);
    return rows;
  }
  async saveProfileBusiness(actor, id, data, key, correlation) {
    if (actor.kind !== 'resident') fail('Resident access required.', 403);
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Enter business information.');
    const allowed = ['business_name', 'trade_name', 'ownership_type', 'address'];
    if (Object.keys(data).some(name => !allowed.includes(name))) fail('Unknown business field.');
    const name = text(data.business_name, 160);
    if (!name) fail('Enter your business name.');
    const tradeName = text(data.trade_name || '', 160);
    const ownership = text(data.ownership_type || '', 80);
    if (!['Sole proprietorship', 'Partnership', 'Corporation', 'Cooperative'].includes(ownership)) fail('Choose a business ownership type.');
    const address = data.address;
    if (!address || typeof address !== 'object' || Array.isArray(address) || Object.keys(address).some(k => !['street', 'barangay'].includes(k))) fail('Enter a business address.');
    const cleanAddress = { street: text(address.street, 240), barangay: text(address.barangay, 120), municipality: 'Getafe', province: 'Bohol' };
    if (!cleanAddress.street || !barangays.some(item => item.name === cleanAddress.barangay)) fail('Enter the business address and choose a Getafe barangay.');
    if (id) uuid(id);
    return this.idempotent(actor, `profile-business:${id || 'new'}`, key, data, async db => {
      let business;
      if (id) {
        [business] = await db('SELECT b.* FROM businesses b JOIN business_owners o ON o.business_id=b.id WHERE b.id=? AND o.user_id=? AND o.effective_until IS NULL FOR UPDATE OF b', [id, actor.id]);
        if (!business) fail('Business not found.', 404);
        if (business.status !== 'UNVERIFIED') fail('Contact the business permits office to update a verified business record.', 409);
        const [submitted] = await db("SELECT 1 FROM service_requests r WHERE r.status NOT IN ('DRAFT','CANCELLED','REJECTED') AND (EXISTS(SELECT 1 FROM request_business_billing x WHERE x.request_id=r.id AND x.business_id=?) OR EXISTS(SELECT 1 FROM business_applications a WHERE a.request_id=r.id AND a.business_id=?)) LIMIT 1", [id, id]);
        if (submitted) fail('Contact the business permits office to update business information already used in a submitted application.', 409);
        [business] = await db('UPDATE businesses SET business_name=?,trade_name=?,ownership_type=?,address=?::jsonb,updated_at=now() WHERE id=? RETURNING *', [name, tradeName, ownership, JSON.stringify(cleanAddress), id]);
      } else {
        [business] = await db("INSERT INTO businesses(business_reference,business_name,trade_name,ownership_type,address,status) VALUES(?,?,?,?,?::jsonb,'UNVERIFIED') RETURNING *", [`PROFILE-${crypto.randomUUID()}`, name, tradeName, ownership, JSON.stringify(cleanAddress)]);
        await db('INSERT INTO business_owners(business_id,user_id) VALUES(?,?)', [business.id, actor.id]);
      }
      await this.audit(db, actor, id ? 'business.profile_updated' : 'business.profile_added', business.id, {}, correlation);
      return business;
    });
  }
  async staffIdentities(ids) {
    const [rows] = await (
      await getCmsPool()
    ).execute(
      "SELECT u.id,u.name,p.eid FROM users u LEFT JOIN employee_profiles p ON p.user_id=u.id WHERE u.id=ANY(?::text[]) AND u.role IN ('staff','admin','super_admin','it_support','content_manager','disabled')",
      [[...new Set(ids.filter(Boolean))]],
    );
    return new Map(rows.map((user) => [user.id, `${user.name} · EID ${user.eid}`]));
  }
  async syncDepartment(db, id) {
    const [rows] = await (
      await getCmsPool()
    ).execute("SELECT * FROM departments WHERE id=?", [id]);
    const department = rows[0];
    if (!department) fail("Choose an existing municipal office.");
    await db(
      "INSERT INTO departments(id,slug,name,published,display_order,content) VALUES(?,?,?,?,?,?::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,published=EXCLUDED.published,content=EXCLUDED.content",
      [
        department.id,
        department.slug,
        department.name,
        department.published,
        department.display_order,
        JSON.stringify(department.content),
      ],
    );
  }
  async transaction(work) {
    const client = await (await this.pool()).getConnection();
    const db = async (sql, values = []) =>
      (await client.execute(sql, values))[0];
    try {
      await client.beginTransaction();
      const result = await work(db);
      await client.commit();
      return result;
    } catch (error) {
      await client.rollback();
      throw error;
    } finally {
      client.release();
    }
  }
  async audit(
    db,
    actor,
    action,
    target,
    metadata = {},
    correlation = crypto.randomUUID(),
  ) {
    if (actor.kind !== 'resident' && actor.role) {
      const [rows] = await (await getCmsPool()).execute('SELECT eid FROM employee_profiles WHERE user_id=?',[actor.id]);
      metadata = { ...metadata, actor_eid: rows[0]?.eid || actor.eid || null };
    }
    await db(
      "INSERT INTO audit_logs(id,user_id,action,category,setting_key,new_value,correlation_id) VALUES(?,?,?,?,?,?,?)",
      [
        crypto.randomUUID(),
        actor.id,
        action,
        "eservices",
        String(target),
        JSON.stringify(metadata),
        correlation,
      ],
    );
  }
  async notify(db, request, title, message, event = "request.status_changed") {
    const template=request.settings_snapshot?.notification_templates?.[event];
    if(template) {
      const render=value=>value.replace(/\{(reference|status)\}/g,(_,key)=>key==='reference'?request.request_number:publicStatus(request.status));
      if(template.title) title=render(template.title);
      if(template.message) message=render(template.message);
    }
    await db(
      "INSERT INTO eservice_notification_outbox(user_id,request_id,title,message,event_type) VALUES(?,?,?,?,?)",
      [request.applicant_user_id, request.id, title, message, event],
    );
  }
  async idempotent(actor, scope, key, payload, work) {
    if (!/^[\w-]{8,100}$/.test(String(key || "")))
      fail("A valid operation key is required.", 400);
    return this.transaction(async (db) => {
      await db("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", [
        `${actor.id}:${scope}:${key}`,
      ]);
      const [previous] = await db(
        "SELECT * FROM eservice_idempotency WHERE actor_id=? AND scope=? AND key=?",
        [actor.id, scope, key],
      );
      if (previous) {
        if (previous.payload_hash !== hash(payload))
          fail("This operation key has already been used.", 409);
        return previous.response;
      }
      const response = await work(db);
      await db(
        "INSERT INTO eservice_idempotency(actor_id,scope,key,payload_hash,response) VALUES(?,?,?,?,?::jsonb)",
        [actor.id, scope, key, hash(payload), JSON.stringify(response)],
      );
      return response;
    });
  }
  async catalog(includePrivate = false) {
    return this.read(
      `SELECT s.*,d.name AS department_name,c.name AS category_name,c.slug AS category_slug,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'required',r.required,'help_text',r.help_text) ORDER BY r.display_order),'[]'::jsonb) FROM service_requirements r WHERE r.service_id=s.id AND r.revision=s.version) AS requirements,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',f.code,'description',f.description,'amount',f.amount,'fee_type',f.fee_type) ORDER BY f.code),'[]'::jsonb) FROM service_fees f WHERE f.service_id=s.id AND f.revision=s.version) AS fees
        FROM services s LEFT JOIN departments d ON d.id=s.department_id LEFT JOIN service_categories c ON c.id=s.category_id ${includePrivate ? "" : "WHERE s.published AND (s.effective_from IS NULL OR s.effective_from<=now()) AND (s.effective_until IS NULL OR s.effective_until>now())"} ORDER BY s.display_order,s.name`,
    );
  }
  async catalogPage(query = {}) {
    const q = text(query.q || "", 100);
    const department = text(query.department || "", 200);
    const page = Number(query.page || 1), limit = Number(query.limit || 20);
    if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100) fail("Invalid catalog pagination.", 400);
    if (query.published && !["true", "false"].includes(query.published)) fail("Invalid publishing filter.", 400);
    const filters = [], values = [];
    if (q) { filters.push("(strpos(lower(s.name),lower(?))>0 OR strpos(lower(s.slug),lower(?))>0 OR strpos(lower(s.description),lower(?))>0)"); values.push(q,q,q); }
    if (department) { filters.push("s.department_id=?"); values.push(department); }
    if (query.published) { filters.push("s.published=?"); values.push(query.published === "true"); }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const [count] = await this.read(`SELECT count(*)::integer AS total FROM services s ${where}`, values);
    const items = await this.read(`SELECT s.id,s.name,s.slug,s.department_id,s.published,s.online_available,s.display_order,d.name AS department_name,c.name AS category_name FROM services s LEFT JOIN departments d ON d.id=s.department_id LEFT JOIN service_categories c ON c.id=s.category_id ${where} ORDER BY s.display_order,s.name,s.id LIMIT ? OFFSET ?`, [...values,limit,(page - 1)*limit]);
    return { items, total: count.total, page, limit };
  }
  async configuration(
    idOrSlug,
    includePrivate = false,
    db = this.read.bind(this),
  ) {
    const [service] = await db(
      `SELECT * FROM services WHERE (id::text=? OR slug=?) ${includePrivate ? "" : "AND published AND (effective_from IS NULL OR effective_from<=now()) AND (effective_until IS NULL OR effective_until>now())"}`,
      [idOrSlug, idOrSlug],
    );
    if (!service) fail("Service not found.", 404);
    const revision = service.version;
    const [definition] = await db(
      "SELECT * FROM service_form_definitions WHERE service_id=? AND revision=?",
      [service.id, revision],
    );
    const [workflow] = await db(
      "SELECT * FROM service_workflows WHERE service_id=? AND revision=?",
      [service.id, revision],
    );
    return {
      ...service,
      definition: definition || null,
      requirements: await db(
        "SELECT * FROM service_requirements WHERE service_id=? AND revision=? ORDER BY display_order",
        [service.id, revision],
      ),
      fields: definition
        ? await db(
            "SELECT * FROM service_form_fields WHERE definition_id=? ORDER BY display_order",
            [definition.id],
          )
        : [],
      steps: workflow
        ? await db(
            "SELECT * FROM service_workflow_steps WHERE workflow_id=? ORDER BY display_order",
            [workflow.id],
          )
        : [],
      workflow: workflow || null,
      fees: await db(
        "SELECT * FROM service_fees WHERE service_id=? AND revision=? ORDER BY code",
        [service.id, revision],
      ),
    };
  }
  async saveService(actor, data, id, correlation) {
    await this.authorize(actor, "services.catalog.manage");
    const name = text(data.name, 200),
      slug = text(data.slug, 120);
    if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
      fail("Enter a name and URL slug.");
    if (data.department_id) text(data.department_id, 200);
    if (data.category_id) uuid(data.category_id);
    if (
      ![
        "APPLICATION",
        "BUSINESS_NEW",
        "BUSINESS_RENEWAL",
        "BUSINESS",
        "REAL_PROPERTY",
        "WATER",
        "PAYMENT_ORDER",
        "DIRECTORY",
      ].includes(data.kind || "APPLICATION")
    )
      fail("Choose a supported service type.");
    if (
      !Number.isInteger(Number(data.display_order || 0)) ||
      Number(data.display_order || 0) < 0 ||
      Number(data.display_order || 0) > 99999
    )
      fail("Enter a valid display order.");
    for (const key of [
      "published",
      "online_available",
      "payment_required",
      "appointment_required",
    ])
      if (data[key] !== undefined && typeof data[key] !== "boolean")
        fail("Use a valid setting value.");
    for (const key of ["effective_from", "effective_until"])
      if (data[key] && !Number.isFinite(Date.parse(data[key])))
        fail("Enter a valid effective date.");
    if (
      data.effective_from &&
      data.effective_until &&
      Date.parse(data.effective_until) <= Date.parse(data.effective_from)
    )
      fail("The end date must follow the start date.");
    const settings = {
      separation_of_duties: data.settings?.separation_of_duties !== false,
      workflow_type: data.settings?.workflow_type || (data.kind === 'BUSINESS' ? 'ASSESSMENT_PAYMENT' : data.kind === 'DIRECTORY' ? 'INFORMATION' : 'APPLICATION'),
      payment_methods: data.settings?.payment_methods || ['TREASURY'],
      payment_instructions: text(data.settings?.payment_instructions || '',4000),
      allow_partial_payment: data.settings?.allow_partial_payment === true,
      payment_provider: text(data.settings?.payment_provider || '',100),
      notification_templates: {},
      directory_category_id: data.settings?.directory_category_id ? uuid(data.settings.directory_category_id) : '',
    };
    for(const event of ['request.status_changed','payment.requires_attention']) {
      const template=data.settings?.notification_templates?.[event];
      if(template) settings.notification_templates[event]={title:text(template.title || '',160),message:text(template.message || '',2000)};
    }
    if (!WORKFLOW_TYPES.includes(settings.workflow_type)) fail('Choose a supported workflow type.');
    if (!Array.isArray(settings.payment_methods) || settings.payment_methods.some(method => !Object.hasOwn(PAYMENT_METHODS,method))) fail('Choose supported payment methods.');
    const billing = settings.workflow_type === 'ASSESSMENT_PAYMENT';
    if (settings.workflow_type === 'APPOINTMENT') data={...data,appointment_required:true};
    if (billing) data = { ...data, payment_required:true, declaration:data.declaration || 'I confirm that I am authorized to transact for this business and that the submitted information is correct.' };
    if (data.hero_image) {
      const [media] = await (
        await getCmsPool()
      ).execute("SELECT status,content_type FROM media WHERE storage_path=?", [
        text(data.hero_image, 1024),
      ]);
      if (
        !media[0] ||
        media[0].status !== "active" ||
        !String(media[0].content_type).startsWith("image/")
      )
        fail("Choose an active image from the Media Library.");
    }
    const fields = data.fields || [],
      steps = data.steps?.length ? data.steps : billing ? BILLING_STEPS : APPLICATION_STEPS,
      requirements = data.requirements || [],
      fees = data.fees || [];
    const allowedPermissions = WORKFLOW_PERMISSIONS;
    if (steps.some((step) => !allowedPermissions.includes(step.permission)))
      fail("Choose a supported workflow permission.");
    if (
      data.published &&
      data.kind === "BUSINESS_NEW" &&
      !fields.some((field) => field.key === "business_name" && field.required)
    )
      fail("New business applications require a business_name field.");
    if (
      ![fields, steps, requirements, fees].every(
        (value) => Array.isArray(value) && value.length <= 100,
      )
    )
      fail("Too many configuration entries.");
    if (
      new Set(fields.map((f) => f.key)).size !== fields.length ||
      fields.some((f) => !/^[a-z][a-z0-9_]{0,63}$/.test(f.key))
    )
      fail("Use unique field keys.");
    const types = [
      "text",
      "textarea",
      "email",
      "telephone",
      "number",
      "currency",
      "date",
      "select",
      "radio",
      "checkbox",
      "address",
      "file",
    ];
    for (const field of fields) {
      if (field.profile_source && !PROFILE_SOURCES.includes(field.profile_source)) fail('Choose a supported profile source.');
      if (field.profile_readonly && !fieldProfileSource(field)) fail('Read-only fields require a profile source.');
      if (fieldProfileSource(field) === 'address' && field.type !== 'address') fail('Use an address field for the profile address.');
      text(field.section || '', 100);
      if (['Documents', 'Review', 'Appointment'].includes(field.section)) fail('Use a service-specific section name; Documents, Appointment and Review are reserved.');
      if (!types.includes(field.type)) fail("Choose a supported field type.");
      if (!text(field.label, 200)) fail("Enter a field label.");
      if (field.validation?.pattern)
        fail(
          "Use length and numeric limits instead of arbitrary regular expressions.",
        );
      for (const key of ["min", "max", "maxLength"])
        if (
          field.validation?.[key] !== undefined &&
          (!Number.isFinite(Number(field.validation[key])) ||
            (key === "maxLength" &&
              (Number(field.validation[key]) < 1 ||
                Number(field.validation[key]) > 4000)))
        )
          fail("Enter valid field validation limits.");
      if (
        !Array.isArray(field.options || []) ||
        (field.options || []).some(
          (option) => typeof option !== "string" || option.length > 200,
        )
      )
        fail("Enter valid field options.");
      if (
        field.visibility &&
        (!fields.some((f) => f.key === field.visibility.field) ||
          !["string", "boolean", "number"].includes(
            typeof field.visibility.equals,
          ))
      )
        fail("Choose a valid visibility rule.");
      if (field.type === "file")
        fail(
          "Configure uploads in Documents using a requirement, rather than a form field.",
        );
    }
    for (const requirement of requirements)
      if (!text(requirement.code, 100) || !text(requirement.label, 200))
        fail("Enter requirement codes and labels.");
    for (const fee of fees) {
      cents(fee.amount);
      if (fee.fee_type && !['CHARGE','TAX','REGULATORY','PENALTY','CREDIT','PROCESSING'].includes(fee.fee_type)) fail('Choose a supported charge type.');
      if (
        !text(fee.code, 100) ||
        !text(fee.description, 300) ||
        !text(fee.source, 300)
      )
        fail("Enter the fee code, description and authorized source.");
    }
    if (steps.length) validateWorkflow(steps, Boolean(data.payment_required));
    if (
      data.published &&
      (!data.department_id ||
        !steps.length ||
        (!fields.length && !billing) ||
        !text(data.declaration || "", 4000))
    ) {
      if (
        ["APPLICATION", "BUSINESS_NEW", "BUSINESS_RENEWAL", "BUSINESS"].includes(
          data.kind || "APPLICATION",
        )
      )
        fail(
          "Configure the department, form, declaration and workflow before publishing.",
        );
    }
    return this.transaction(async (db) => {
      if (data.department_id) await this.syncDepartment(db, data.department_id);
      if (data.category_id && !(await db("SELECT 1 FROM service_categories WHERE id=?", [data.category_id])).length) fail("Choose an existing service category.");
      if (data.published && data.department_id && !(await db("SELECT 1 FROM departments WHERE id=? AND published=TRUE", [data.department_id])).length) fail("Choose an active office before publishing.");
      let service;
      if (id) {
        [service] = await db("SELECT * FROM services WHERE id=? FOR UPDATE", [
          uuid(id),
        ]);
        if (!service) fail("Service not found.", 404);
        if (Number(data.version) !== service.version)
          fail("This service changed. Reload before saving.", 409);
      }
      const revision = service ? service.version + 1 : 1;
      const values = [
        name,
        slug,
        data.category_id || null,
        data.department_id || null,
        data.kind || "APPLICATION",
        text(data.short_description || "", 500),
        text(data.description || "", 20000),
        text(data.eligibility || ""),
        text(data.instructions || ""),
        text(data.processing_time || "", 500),
        Boolean(data.published),
        Boolean(data.online_available),
        Boolean(data.payment_required),
        Boolean(data.appointment_required),
        Number(data.display_order || 0),
        data.effective_from || null,
        data.effective_until || null,
        JSON.stringify(data.contact || {}),
        JSON.stringify(settings),
        revision,
        text(data.icon || "FileText", 80),
        data.hero_image || null,
      ];
      if (service)
        [service] = await db(
          "UPDATE services SET name=?,slug=?,category_id=?,department_id=?,kind=?,short_description=?,description=?,eligibility=?,instructions=?,processing_time=?,published=?,online_available=?,payment_required=?,appointment_required=?,display_order=?,effective_from=?,effective_until=?,contact=?::jsonb,settings=?::jsonb,version=?,icon=?,hero_image=?,updated_at=now() WHERE id=? RETURNING *",
          [...values, id],
        );
      else
        [service] = await db(
          "INSERT INTO services(name,slug,category_id,department_id,kind,short_description,description,eligibility,instructions,processing_time,published,online_available,payment_required,appointment_required,display_order,effective_from,effective_until,contact,settings,version,icon,hero_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,?,?) RETURNING *",
          values,
        );
      const [definition] = await db(
        "INSERT INTO service_form_definitions(service_id,revision,declaration) VALUES(?,?,?) RETURNING *",
        [service.id, revision, text(data.declaration || "")],
      );
      for (const [index, field] of fields.entries())
        await db(
          "INSERT INTO service_form_fields(definition_id,key,label,type,required,help_text,validation,options,visibility,display_order,section,profile_source,profile_readonly) VALUES(?,?,?,?,?,?,?::jsonb,?::jsonb,?::jsonb,?,?,?,?)",
          [
            definition.id,
            field.key,
            field.label,
            field.type,
            Boolean(field.required),
            text(field.help_text || ""),
            JSON.stringify(field.validation || {}),
            JSON.stringify(field.options || []),
            JSON.stringify(field.visibility || null),
            index,
            text(field.section || '', 100),
            field.profile_source || '',
            field.profile_readonly === true,
          ],
        );
      const [workflow] = await db(
        "INSERT INTO service_workflows(service_id,revision) VALUES(?,?) RETURNING *",
        [service.id, revision],
      );
      for (const [index, step] of steps.entries())
        await db(
          "INSERT INTO service_workflow_steps(workflow_id,status,label,permission,next_statuses,display_order) VALUES(?,?,?,?,?::jsonb,?)",
          [
            workflow.id,
            step.status,
            step.label,
            step.permission,
            JSON.stringify(step.next_statuses),
            index,
          ],
        );
      // Requirements are revision-specific: older requests retain the original IDs.
      for (const [index, requirement] of requirements.entries())
        await db(
          "INSERT INTO service_requirements(service_id,code,label,help_text,required,display_order,revision) VALUES(?,?,?,?,?,?,?)",
          [
            service.id,
            requirement.code,
            requirement.label,
            text(requirement.help_text || ""),
            Boolean(requirement.required),
            index,
            revision,
          ],
        );
      for (const fee of fees)
        await db(
          "INSERT INTO service_fees(service_id,revision,code,description,amount,source,fee_type) VALUES(?,?,?,?,?,?,?)",
          [
            service.id,
            revision,
            fee.code,
            fee.description,
            String(fee.amount),
            fee.source,
            fee.fee_type || 'CHARGE',
          ],
        );
      await this.audit(
        db,
        actor,
        "service.configuration.changed",
        service.id,
        { revision, published: service.published },
        correlation,
      );
      return this.configuration(service.id, true, db);
    });
  }
  async owned(db, actor, id, lock = false) {
    const [request] = await db(
      `SELECT * FROM service_requests WHERE id=? AND applicant_user_id=? ${lock ? "FOR UPDATE" : ""}`,
      [uuid(id), actor.id],
    );
    if (!request) fail("Request not found.", 404);
    return request;
  }
  async staff(db, actor, id, permission, lock = false) {
    const [request] = await db(
      `SELECT * FROM service_requests WHERE id=? ${lock ? "FOR UPDATE" : ""}`,
      [uuid(id)],
    );
    if (!request) fail("Request not found.", 404);
    await this.authorize(actor, permission, request);
    const [member] = await db(
      "SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?",
      [actor.id, request.department_id],
    );
    if (!member) fail("This request belongs to another department.", 403);
    return request;
  }
  stale(request, version) {
    if (Number(version) !== request.version)
      fail(
        "This request was updated by another user. Refresh to view the latest version.",
        409,
      );
  }
  async values(db, request) {
    return Object.fromEntries(
      (
        await db(
          "SELECT f.key,v.value FROM request_form_values v JOIN service_form_fields f ON f.id=v.field_id WHERE request_id=?",
          [request.id],
        )
      ).map((row) => [row.key, row.value]),
    );
  }
  async change(
    db,
    actor,
    request,
    target,
    reason,
    correlation,
    { payment = false } = {},
  ) {
    const [step] = await db(
      "SELECT * FROM service_workflow_steps WHERE workflow_id=? AND status=?",
      [request.workflow_id, request.status],
    );
    const [next] = await db(
      "SELECT * FROM service_workflow_steps WHERE workflow_id=? AND status=?",
      [request.workflow_id, target],
    );
    if (!next || !step?.next_statuses.includes(target))
      fail("That workflow transition is not allowed.", 409);
    if (["AWAITING_PAYMENT", "PAID"].includes(target) && !payment)
      fail("Use assessment or verified payment processing.", 409);
    if (['CANCELLED','REJECTED'].includes(target)) {
      const orders=await db("SELECT * FROM payment_orders WHERE (request_id=? OR id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=?)) AND status NOT IN ('CANCELLED','EXPIRED') FOR UPDATE",[request.id,request.id]);
      for (const order of orders) {
        const [financial]=await db("SELECT 1 WHERE EXISTS(SELECT 1 FROM payments p WHERE p.payment_order_id=? AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)) OR EXISTS(SELECT 1 FROM payment_attempts WHERE payment_order_id=? AND status='PENDING') OR EXISTS(SELECT 1 FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING')",[order.id,order.id,order.id]);
        if (financial) fail('Reconcile recorded or pending payments before closing this transaction.',409);
        if (order.request_id) await db("UPDATE payment_orders SET status='CANCELLED' WHERE id=?",[order.id]);
        else {
          await db("INSERT INTO request_actions(request_id,actor_user_id,action,metadata) VALUES(?,?,'assessment.unlinked',?::jsonb)",[request.id,actor.id,JSON.stringify({order_number:order.order_number,reason:target})]);
          await db('UPDATE request_business_billing SET selected_order_id=NULL,reviewed_order_id=NULL,reviewed_at=NULL WHERE request_id=?',[request.id]);
        }
      }
    }
    if (["AWAITING_PAYMENT", "PAID"].includes(target)) {
      const [order] = await db(
        "SELECT status FROM payment_orders WHERE (request_id=? OR id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=?)) AND status NOT IN ('CANCELLED','EXPIRED')",
        [request.id, request.id],
      );
      if (!order || (target === "PAID" && order.status !== "PAID"))
        fail("A valid verified financial record is required.", 409);
    }
    if (["APPROVED", "FOR_RELEASE", "COMPLETED"].includes(target)) {
      const [order] = await db(
        "SELECT status FROM payment_orders WHERE (request_id=? OR id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=?)) AND status NOT IN ('CANCELLED','EXPIRED')",
        [request.id, request.id],
      );
      if (request.payment_required && order?.status !== "PAID")
        fail(
          "Verified payment is required before approval or completion.",
          409,
        );
      const [invalid] = await db(
        "SELECT 1 FROM service_requirements r WHERE service_id=? AND revision=? AND required AND NOT EXISTS(SELECT 1 FROM request_documents d WHERE d.request_id=? AND d.requirement_id=r.id AND d.status='ACCEPTED' AND NOT EXISTS(SELECT 1 FROM request_documents replacement WHERE replacement.replaces_id=d.id)) LIMIT 1",
        [request.service_id, request.configuration_revision, request.id],
      );
      if (invalid) fail("Accept the required documents before approval.", 409);
      if (target === 'COMPLETED' && (await db('SELECT 1 FROM request_business_billing WHERE request_id=?',[request.id])).length) {
        const [missingReceipt] = await db("SELECT 1 FROM payments p JOIN payment_orders o ON o.id=p.payment_order_id WHERE (o.request_id=? OR o.id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=?)) AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id) AND NOT EXISTS(SELECT 1 FROM payment_receipts r WHERE r.payment_id=p.id AND r.kind='OFFICIAL')",[request.id,request.id]);
        if (missingReceipt) fail('Record the official receipt for each verified payment before completion.',409);
      }
    }
    if (actor.kind !== "resident")
      await this.authorize(actor, next.permission, request);
    const [updated] = await db(
      "UPDATE service_requests SET status=?,current_workflow_step_id=?,version=version+1,updated_at=now(),submitted_at=CASE WHEN ?='SUBMITTED' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,received_at=CASE WHEN ?='RECEIVED' THEN now() ELSE received_at END,completed_at=CASE WHEN ?='COMPLETED' THEN now() ELSE completed_at END,cancelled_at=CASE WHEN ?='CANCELLED' THEN now() ELSE cancelled_at END WHERE id=? RETURNING *",
      [target, next.id, target, target, target, target, request.id],
    );
    if (target === "APPROVED") {
      const [application] = await db(
        "SELECT * FROM business_applications WHERE request_id=?",
        [request.id],
      );
      if (application) {
        const values = await this.values(db, request);
        await db(
          "UPDATE businesses SET status=?,business_name=COALESCE(?,business_name),trade_name=COALESCE(?,trade_name),ownership_type=COALESCE(?,ownership_type),address=COALESCE(?::jsonb,address),updated_at=now() WHERE id=?",
          [
            "ACTIVE",
            values.business_name || null,
            values.trade_name || null,
            values.ownership_type || null,
            values.business_address
              ? JSON.stringify(values.business_address)
              : null,
            application.business_id,
          ],
        );
      }
    }
    await db(
      "INSERT INTO request_status_history(request_id,from_status,to_status,actor_user_id,reason) VALUES(?,?,?,?,?)",
      [request.id, request.status, target, actor.id, text(reason || "")],
    );
    await this.audit(
      db,
      actor,
      "request.status.changed",
      request.id,
      { from: request.status, to: target },
      correlation,
    );
    await this.notify(
      db,
      updated,
      "Application update",
      `${request.request_number}: ${publicStatus(target)}`,
    );
    return updated;
  }
  async createDraft(actor, data, key, correlation) {
    actor = { ...actor, kind: "resident" };
    return this.idempotent(actor, "draft", key, data, async (db) => {
      const service = await this.configuration(
        uuid(data.service_id),
        false,
        db,
      );
      if (
        !service.online_available ||
        ['INFORMATION','PAYMENT'].includes(service.settings?.workflow_type) ||
        !service.department_id ||
        !service.definition ||
        !service.workflow ||
        !["APPLICATION", "BUSINESS_NEW", "BUSINESS_RENEWAL", "BUSINESS"].includes(
          service.kind,
        )
      )
        fail("Online applications are not available for this service.");
      const [request] = await db(
        "INSERT INTO service_requests(request_number,service_id,applicant_user_id,department_id,definition_id,workflow_id,configuration_revision,current_workflow_step_id,payment_required,settings_snapshot) VALUES('GET-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_request_reference')::text,6,'0'),?,?,?,?,?,?,?,?,?::jsonb) RETURNING *",
        [
          service.id,
          actor.id,
          service.department_id,
          service.definition.id,
          service.workflow.id,
          service.version,
          service.steps.find((s) => s.status === "DRAFT")?.id || null,
          service.payment_required,
          JSON.stringify({ ...service.settings, appointment_required: service.appointment_required }),
        ],
      );
      const [user] = await db('SELECT id,name,email FROM portal_users WHERE id=?', [actor.id]);
      const [profile] = await db('SELECT * FROM resident_profiles WHERE user_id=?', [actor.id]);
      const applicant = profileValues(user, profile);
      await db('UPDATE service_requests SET applicant_snapshot=?::jsonb WHERE id=?', [JSON.stringify(applicant), request.id]);
      for (const field of service.fields) {
        const value = applicant[fieldProfileSource(field)];
        if (value !== undefined && value !== '') await db('INSERT INTO request_form_values(request_id,field_id,value) VALUES(?,?,?::jsonb)', [request.id, field.id, JSON.stringify(value)]);
      }
      if (service.settings?.workflow_type === 'ASSESSMENT_PAYMENT') {
        const [owned] = await db('SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL',[uuid(data.business_id),actor.id]);
        if (!owned) fail('Choose a business that you own.',404);
        await db('INSERT INTO request_business_billing(request_id,business_id) VALUES(?,?)',[request.id,data.business_id]);
        const [reference] = await db("SELECT 'BILL-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_bill_reference')::text,6,'0') AS value");
        await db('UPDATE service_requests SET request_number=? WHERE id=?',[reference.value,request.id]);
        request.request_number = reference.value;
      }
      if (service.kind === "BUSINESS_RENEWAL" || service.settings?.workflow_type === 'ASSESSMENT_PAYMENT') {
        const [business] = await db(
          "SELECT b.* FROM businesses b JOIN business_owners o ON o.business_id=b.id WHERE b.id=? AND o.user_id=? AND o.effective_until IS NULL",
          [uuid(data.business_id), actor.id],
        );
        if (!business) fail("Choose a business that you own.", 404);
        if (service.kind === 'BUSINESS_RENEWAL') await db(
          "INSERT INTO business_applications(request_id,business_id,application_type) VALUES(?,?,'RENEWAL')",
          [request.id, business.id],
        );
        const reusable = {
          business_name: business.business_name,
          trade_name: business.trade_name,
          ownership_type: business.ownership_type,
          business_address: business.address,
        };
        for (const field of service.fields)
          if (Object.hasOwn(reusable, field.key))
            await db(
              "INSERT INTO request_form_values(request_id,field_id,value) VALUES(?,?,?::jsonb) ON CONFLICT(request_id,field_id) DO UPDATE SET value=EXCLUDED.value",
              [request.id, field.id, JSON.stringify(reusable[field.key])],
            );
      }
      await db(
        "INSERT INTO request_status_history(request_id,to_status,actor_user_id) VALUES(?,'DRAFT',?)",
        [request.id, actor.id],
      );
      await this.audit(
        db,
        actor,
        "request.draft.created",
        request.id,
        {},
        correlation,
      );
      return request;
    });
  }
  async saveDraft(actor, id, data, correlation) {
    return this.transaction(async (db) => {
      const request = await this.owned(db, actor, id, true);
      this.stale(request, data.version);
      if (!["DRAFT", "NEEDS_INFORMATION"].includes(request.status))
        fail("This application cannot be edited.", 409);
      const fields = await db(
        "SELECT * FROM service_form_fields WHERE definition_id=?",
        [request.definition_id],
      );
      const submitted = { ...(data.values || {}) };
      for (const field of fields) {
        if (field.profile_readonly || fieldProfileSource(field) === 'user_id') {
          const source = request.applicant_snapshot?.[fieldProfileSource(field)];
          if (source !== undefined) submitted[field.key] = source;
        }
      }
      const values = validateValues(fields, submitted);
      if (data.appointment !== undefined) {
        if (!data.appointment || typeof data.appointment !== 'object' || Array.isArray(data.appointment)) fail('Enter valid appointment details.');
        const appointment = Object.fromEntries(['date', 'time', 'reason', 'contact'].map(key => [key, text(data.appointment[key] || '', key === 'reason' ? 1000 : 40)]));
        await db('UPDATE service_requests SET draft_context=?::jsonb WHERE id=?', [JSON.stringify({ appointment }), id]);
      }
      if (data.draft_step !== undefined) {
        if (!Number.isInteger(data.draft_step) || data.draft_step < 0 || data.draft_step > 102) fail('Invalid application step.');
        await db('UPDATE service_requests SET draft_step=? WHERE id=?', [data.draft_step, id]);
      }
      await db("DELETE FROM request_form_values WHERE request_id=?", [id]);
      for (const value of values)
        await db(
          "INSERT INTO request_form_values(request_id,field_id,value) VALUES(?,?,?::jsonb)",
          [id, value.field_id, JSON.stringify(value.value)],
        );
      await this.audit(
        db,
        actor,
        "request.draft.updated",
        id,
        { fields: values.map((v) => v.field_id) },
        correlation,
      );
      return (
        await db(
          "UPDATE service_requests SET version=version+1,updated_at=now() WHERE id=? RETURNING *",
          [id],
        )
      )[0];
    });
  }
  async submit(actor, id, data, key, correlation, response = false) {
    actor = { ...actor, kind: "resident" };
    return this.idempotent(
      actor,
      `${response ? "respond" : "submit"}:${id}`,
      key,
      data,
      async (db) => {
        const request = await this.owned(db, actor, id, true);
        this.stale(request, data.version);
        if (request.status !== (response ? "NEEDS_INFORMATION" : "DRAFT"))
          fail(
            "This application has already been submitted or cannot be submitted.",
            409,
          );
        if (data.declaration !== true)
          fail("Confirm the applicant declaration.");
        const fields = await db(
          "SELECT * FROM service_form_fields WHERE definition_id=?",
          [request.definition_id],
        );
        const values = await this.values(db, request);
        validateValues(fields, values, true);
        const [missing] = await db(
          "SELECT 1 FROM service_requirements r WHERE r.service_id=? AND r.revision=? AND r.required AND NOT EXISTS(SELECT 1 FROM request_documents d WHERE d.request_id=? AND d.requirement_id=r.id AND d.status IN ('PENDING','ACCEPTED') AND NOT EXISTS(SELECT 1 FROM request_documents n WHERE n.replaces_id=d.id)) LIMIT 1",
          [request.service_id, request.configuration_revision, id],
        );
        if (missing) fail("Upload the required documents.");
        if (!response && request.settings_snapshot?.appointment_required) {
          const at = new Date(data.appointment_at);
          const contact = String(data.contact_number || "").replace(/\s+/g, "");
          if (!isExactAppointmentMinute(at)) fail("Choose an available appointment slot.");
          if (!/^09\d{9}$/.test(contact)) fail("Enter a valid Philippine mobile number.");
          const [profile] = await db("SELECT barangay FROM resident_profiles WHERE user_id=?", [actor.id]);
          if (!profile?.barangay) fail("Add your barangay to your resident profile before booking.");
          await db("SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))", appointmentSlotLockValues(at));
          const availability = await appointmentAvailability(db, request.service_id);
          const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
          const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
          if (!availability.dates.find(item => item.date === day)?.slots.some(slot => slot.time === time)) fail("That slot is no longer available. Choose another time.", 409);
          const [department] = await db("SELECT name FROM departments WHERE id=?", [request.department_id]);
          const [serviceName] = await db("SELECT name FROM services WHERE id=?", [request.service_id]);
          await db("INSERT INTO appointments(id,user_id,department,service,service_id,appointment_at,reason,contact_number,barangay,status,created_at,service_request_id) VALUES(?,?,?,?,?,?,?,?,?,'requested',now(),?)", [crypto.randomUUID(), actor.id, department.name, serviceName.name, request.service_id, at.toISOString(), text(data.appointment_reason || '', 1000), contact, profile.barangay, id]);
        }
        const [service] = await db("SELECT * FROM services WHERE id=?", [
          request.service_id,
        ]);
        if (service.kind === "BUSINESS_NEW" && !response) {
          if (!values.business_name)
            fail("The business form must include a business_name field.");
          const [business] = await db(
            "INSERT INTO businesses(business_reference,business_name,trade_name,ownership_type,address) VALUES(?,?,?,?,?::jsonb) RETURNING *",
            [
              (await db("SELECT 'BUS-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_business_reference')::text,6,'0') AS reference"))[0].reference,
              String(values.business_name),
              String(values.trade_name || ""),
              String(values.ownership_type || ""),
              JSON.stringify(values.business_address || {}),
            ],
          );
          await db(
            "INSERT INTO business_owners(business_id,user_id) VALUES(?,?)",
            [business.id, actor.id],
          );
          await db(
            "INSERT INTO business_applications(request_id,business_id,application_type) VALUES(?,?,'NEW')",
            [id, business.id],
          );
        }
        const updated = await this.change(
          db,
          actor,
          request,
          response ? request.resume_status : "SUBMITTED",
          response
            ? "Applicant provided corrections"
            : "Applicant declaration accepted",
          correlation,
          {
            payment:
              response &&
              ["AWAITING_PAYMENT", "PAID"].includes(request.resume_status),
          },
        );
        if (response)
          await db(
            "UPDATE service_requests SET resume_status=NULL,due_at=NULL WHERE id=?",
            [id],
          );
        return updated;
      },
    );
  }
  async list(actor, query = {}, staff = false) {
    const page = Math.max(1, Math.min(100000, Number(query.page) || 1)),
      limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    if (staff) await this.authorize(actor, "requests.department.view");
    const conditions = [
        staff
          ? "EXISTS(SELECT 1 FROM eservice_department_members m WHERE m.department_id=r.department_id AND m.user_id=?)"
          : "r.applicant_user_id=?",
      ],
      values = [actor.id];
    for (const [key, column] of Object.entries({
      status: "status",
      service_id: "service_id",
      department_id: "department_id",
    }))
      if (query[key]) {
        if (!staff && key === 'status' && Object.values(PUBLIC_STATUS).includes(query[key])) {
          conditions.push('r.status=ANY(?::text[])');
          values.push(Object.keys(PUBLIC_STATUS).filter(status => PUBLIC_STATUS[status] === query[key]));
        } else {
          conditions.push(`r.${column}=?`);
          values.push(query[key]);
        }
      }
    if (query.assigned === "me") {
      conditions.push("r.assigned_user_id=?");
      values.push(actor.id);
    }
    if (query.assigned === "unassigned")
      conditions.push("r.assigned_user_id IS NULL");
    if (query.business === 'true') conditions.push('EXISTS(SELECT 1 FROM request_business_billing x WHERE x.request_id=r.id)');
    if (query.business_id) {
      const businessId = uuid(query.business_id);
      conditions.push('(EXISTS(SELECT 1 FROM request_business_billing x WHERE x.request_id=r.id AND x.business_id=?) OR EXISTS(SELECT 1 FROM business_applications a WHERE a.request_id=r.id AND a.business_id=?))');
      values.push(businessId, businessId);
    }
    if (query.search) {
      let staffMatches = [];
      if (staff) { const [matches] = await (await getCmsPool()).execute('SELECT u.id FROM users u JOIN employee_profiles p ON p.user_id=u.id WHERE p.eid=? OR u.name ILIKE ? OR u.email ILIKE ?',[text(query.search,100),`%${query.search}%`,`%${query.search}%`]); staffMatches=matches.map(m=>m.id); }
      conditions.push("(r.request_number ILIKE ? OR s.name ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ? OR EXISTS(SELECT 1 FROM request_business_billing x JOIN businesses b ON b.id=x.business_id LEFT JOIN billing_accounts a ON a.business_id=b.id WHERE x.request_id=r.id AND (b.business_name ILIKE ? OR b.business_reference ILIKE ? OR a.account_number ILIKE ?)) OR r.assigned_user_id=ANY(?::text[]))");
      values.push(...Array(7).fill(`%${text(query.search, 100)}%`));
      values.push(staffMatches);
    }
    for (const [key, op] of [
      ["from", ">="],
      ["to", "<="],
    ])
      if (query[key]) {
        if (!Number.isFinite(Date.parse(query[key])))
          fail("Choose a valid date.");
        conditions.push(`r.submitted_at ${op} ?::timestamptz`);
        values.push(query[key]);
      }
    const rows = await this.read(
      `SELECT r.*,s.name AS service_name,u.name AS applicant_name,
        COALESCE((SELECT x.business_id FROM request_business_billing x WHERE x.request_id=r.id),(SELECT a.business_id FROM business_applications a WHERE a.request_id=r.id)) AS business_id,
        (SELECT b.business_name FROM request_business_billing x JOIN businesses b ON b.id=x.business_id WHERE x.request_id=r.id) AS business_name,
        (SELECT o.amount FROM payment_orders o WHERE (o.request_id=r.id OR o.id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=r.id)) AND o.status NOT IN ('CANCELLED','EXPIRED') LIMIT 1) AS amount,
        EXISTS(SELECT 1 FROM payment_attempts p JOIN payment_orders o ON o.id=p.payment_order_id WHERE p.status='PENDING' AND (o.request_id=r.id OR o.id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=r.id))) AS payment_pending,
        count(*) OVER()::integer AS total FROM service_requests r JOIN services s ON s.id=r.service_id JOIN portal_users u ON u.id=r.applicant_user_id WHERE ${conditions.join(" AND ")} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    );
    if (staff)
      for (const request of rows)
        await this.authorize(actor, "requests.department.view", request);
    if (staff) {
      const names = await this.staffIdentities(
        rows.map((row) => row.assigned_user_id),
      );
      rows.forEach((row) => {
        row.assigned_user_name = names.get(row.assigned_user_id) || null;
      });
    }
    const items = staff
      ? rows
      : rows.map((row) => {
          const {
            assigned_user_id,
            resume_status,
            settings_snapshot,
            workflow_id,
            current_workflow_step_id,
            department_id,
            ...safe
          } = row;
          return { ...safe, public_status: publicStatus(row.status) };
        });
    return { items, total: rows[0]?.total || 0, page, limit };
  }
  async detail(actor, id, staff = false, correlation) {
    return this.transaction(async (db) => {
      const request = staff
        ? await this.staff(db, actor, id, "requests.department.view")
        : await this.owned(db, actor, id);
      const [service] = await db(
        "SELECT name,kind,instructions,payment_required FROM services WHERE id=?",
        [request.service_id],
      );
      const [definition] = await db(
        "SELECT * FROM service_form_definitions WHERE id=?",
        [request.definition_id],
      );
      const result = {
        ...request,
        service,
        definition,
        fields: await db(
          "SELECT * FROM service_form_fields WHERE definition_id=? ORDER BY display_order",
          [request.definition_id],
        ),
        values: await this.values(db, request),
        requirements: await db(
          "SELECT * FROM service_requirements WHERE service_id=? AND revision=? ORDER BY display_order",
          [request.service_id, request.configuration_revision],
        ),
        fees: await db('SELECT code,description,amount,fee_type FROM service_fees WHERE service_id=? AND revision=? ORDER BY code', [request.service_id, request.configuration_revision]),
        documents: await db(
          "SELECT id,requirement_id,original_filename,mime_type,size_bytes,status,uploaded_at,reviewed_at,review_reason,replaces_id,scan_status FROM request_documents WHERE request_id=? ORDER BY uploaded_at",
          [id],
        ),
        history: await db(
          "SELECT * FROM request_status_history WHERE request_id=? ORDER BY created_at,id",
          [id],
        ),
        notes: await db(
          `SELECT * FROM request_notes WHERE request_id=? ${staff ? "" : "AND visibility='APPLICANT'"} ORDER BY created_at`,
          [id],
        ),
        orders: await db(
          "SELECT * FROM payment_orders WHERE request_id=? OR id IN (SELECT selected_order_id FROM request_business_billing WHERE request_id=?) ORDER BY created_at",
          [id,id],
        ),
        business: (await db('SELECT b.* FROM businesses b JOIN request_business_billing x ON x.business_id=b.id WHERE x.request_id=?',[id]))[0] || null,
        billing_actions: await db("SELECT id,action,metadata,created_at FROM request_actions WHERE request_id=? AND action IN ('payment.submitted','receipt.issued') ORDER BY created_at",[id]),
        appointment: (await db("SELECT id,appointment_at,status,reason,contact_number FROM appointments WHERE service_request_id=?", [id]))[0] || null,
      };
      if (staff) {
        result.fees = await db('SELECT code,description,amount,source,fee_type FROM service_fees WHERE service_id=? AND revision=? ORDER BY code',[request.service_id,request.configuration_revision]);
        const names = await this.staffIdentities([request.assigned_user_id]);
        result.assigned_user_name = names.get(request.assigned_user_id) || null;
        const [applicant] = await db(
          "SELECT name,email FROM portal_users WHERE id=?",
          [request.applicant_user_id],
        );
        result.applicant = applicant;
        result.actions = await db(
          "SELECT * FROM request_actions WHERE request_id=? ORDER BY created_at",
          [id],
        );
        result.steps = await db(
          "SELECT * FROM service_workflow_steps WHERE workflow_id=? ORDER BY display_order",
          [request.workflow_id],
        );
        result.assignments = await db(
          "SELECT * FROM request_assignments WHERE request_id=? ORDER BY created_at",
          [id],
        );
        const actors=await this.staffIdentities([...result.history.map(event=>event.actor_user_id),...result.actions.map(event=>event.actor_user_id)]);
        result.history.forEach(event=>{event.staff_label=actors.get(event.actor_user_id) || 'Applicant';});
        result.actions.forEach(event=>{event.staff_label=actors.get(event.actor_user_id) || 'Applicant';});
        await this.audit(db, actor, "request.viewed", id, {}, correlation);
      } else {
        delete result.assigned_user_id;
        delete result.resume_status;
        result.settings_snapshot = { appointment_required: request.settings_snapshot?.appointment_required === true };
        result.public_status = publicStatus(request.status);
        delete result.current_workflow_step_id;
        delete result.workflow_id;
        delete result.department_id;
        result.definition = { declaration: definition.declaration };
        result.history = result.history.filter((event, index, events) => index === 0 || publicStatus(event.to_status) !== publicStatus(events[index - 1].to_status));
        result.notes = result.notes.map(({ actor_user_id, ...note }) => note);
        result.history = result.history.map(
          ({ id, from_status, to_status, created_at }) => ({
            id,
            from_status: from_status ? publicStatus(from_status) : null,
            to_status: publicStatus(to_status),
            created_at,
          }),
        );
      }
      return result;
    });
  }
  async process(actor, id, operation, data, key, correlation) {
    const permission = {
      assign: "requests.department.assign",
      status: "requests.department.process",
      information: "requests.department.process",
      note: "requests.department.process",
      document: "documents.process",
      assessment: "assessments.create",
      approve: "requests.department.approve",
    }[operation];
    return this.idempotent(
      actor,
      `${operation}:${id}`,
      key,
      data,
      async (db) => {
        const request = await this.staff(db, actor, id, permission, true);
        this.stale(request, data.version);
        if (operation === 'status' && data.status === 'NEEDS_INFORMATION') fail('Use Request information to send instructions to the applicant.');
        if (
          ["DRAFT", "COMPLETED", "CANCELLED", "REJECTED"].includes(
            request.status,
          )
        )
          fail("This request is not available for processing.", 409);
        if (operation === "status" || operation === "approve")
          return this.change(
            db,
            actor,
            request,
            operation === "approve" ? "APPROVED" : data.status,
            text(data.reason || ""),
            correlation,
          );
        if (operation === "assign") {
          const [member] = await db(
            "SELECT * FROM eservice_department_members WHERE user_id=? AND department_id=?",
            [text(data.assigned_user_id, 200), request.department_id],
          );
          if (!member) fail("Choose a staff member in this department.");
          await db(
            "INSERT INTO request_assignments(request_id,assigned_user_id,assigned_by) VALUES(?,?,?)",
            [id, data.assigned_user_id, actor.id],
          );
          await db(
            "UPDATE service_requests SET assigned_user_id=? WHERE id=?",
            [data.assigned_user_id, id],
          );
        }
        if (operation === "note" || operation === "information") {
          const message = text(data.message);
          if (!message) fail("Enter a message.");
          const visibility =
            operation === "information" ? "APPLICANT" : data.visibility;
          if (!["INTERNAL", "APPLICANT"].includes(visibility))
            fail("Choose note visibility.");
          await db(
            "INSERT INTO request_notes(request_id,actor_user_id,visibility,message) VALUES(?,?,?,?)",
            [id, actor.id, visibility, message],
          );
          if (operation === "information") {
            if (data.due_at && !Number.isFinite(Date.parse(data.due_at)))
              fail("Choose a valid due date.");
            await db(
              "UPDATE service_requests SET resume_status=?,due_at=? WHERE id=?",
              [request.status, data.due_at || null, id],
            );
            const updated = await this.change(
              db,
              actor,
              request,
              "NEEDS_INFORMATION",
              "Corrections requested",
              correlation,
            );
            await this.notify(
              db,
              request,
              "Additional information requested",
              message,
            );
            return updated;
          }
          if (visibility === "APPLICANT")
            await this.notify(
              db,
              request,
              "Message from the municipal office",
              message,
            );
        }
        if (operation === "document") {
          if (
            !["ACCEPTED", "REJECTED", "REPLACEMENT_REQUIRED"].includes(
              data.status,
            )
          )
            fail("Choose a document review status.");
          const reason = text(data.reason || "");
          if (data.status !== "ACCEPTED" && !reason)
            fail("Enter the reason for replacement or rejection.");
          const [document] = await db(
            "UPDATE request_documents SET status=?,reviewed_by=?,reviewed_at=now(),review_reason=? WHERE id=? AND request_id=? AND NOT EXISTS(SELECT 1 FROM request_documents n WHERE n.replaces_id=request_documents.id) RETURNING id",
            [data.status, actor.id, reason, uuid(data.document_id), id],
          );
          if (!document) fail("Current document not found.", 404);
          await db(
            "INSERT INTO request_actions(request_id,actor_user_id,action,metadata) VALUES(?,?,?,?::jsonb)",
            [
              id,
              actor.id,
              "document.reviewed",
              JSON.stringify({
                document_id: document.id,
                status: data.status,
                reason,
              }),
            ],
          );
        }
        if (operation === "assessment") {
          if (request.status !== "FOR_ASSESSMENT")
            fail("Send the request for assessment first.", 409);
          let fees = await db(
            "SELECT * FROM service_fees WHERE service_id=? AND revision=?",
            [request.service_id, request.configuration_revision],
          );
          if ((await db('SELECT 1 FROM request_business_billing WHERE request_id=?',[id])).length) {
            if (!Array.isArray(data.fee_codes) || !data.fee_codes.length || data.fee_codes.some(code=>!fees.some(fee=>fee.code===code))) fail('Select the configured charges that apply to this business.');
            fees=fees.filter(fee=>data.fee_codes.includes(fee.code));
          }
          if (!fees.length) fail("No authorized fees are configured.");
          const total = totalFees(fees);
          if (cents(total) === 0n)
            fail("A payment order must have a positive amount.");
          const [order] = await db(
            "INSERT INTO payment_orders(order_number,request_id,user_id,department_id,amount,assessed_by,expires_at,billing_period) VALUES('PO-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_order_reference')::text,6,'0'),?,?,?,?,?,?,?) RETURNING *",
            [
              id,
              request.applicant_user_id,
              request.department_id,
              total,
              actor.id,
              data.due_at ? (() => { if (!Number.isFinite(Date.parse(data.due_at)) || Date.parse(data.due_at)<=Date.now()) fail('Choose a future assessment due date.'); return data.due_at; })() : null,
              text(data.billing_period || '',100),
            ],
          );
          for (const fee of fees)
            await db(
              "INSERT INTO payment_order_items(payment_order_id,fee_code,description,amount,source,fee_type) VALUES(?,?,?,?,?,?)",
              [order.id, fee.code, fee.description, fee.amount, fee.source,fee.fee_type],
            );
          await this.audit(
            db,
            actor,
            "assessment.created",
            order.id,
            { amount: total },
            correlation,
          );
          return {
            request: await this.change(
              db,
              actor,
              request,
              "AWAITING_PAYMENT",
              "Assessment issued",
              correlation,
              { payment: true },
            ),
            order,
          };
        }
        await this.audit(
          db,
          actor,
          `request.${operation}`,
          id,
          {
            document_id: data.document_id || null,
            visibility: data.visibility || null,
          },
          correlation,
        );
        return (
          await db(
            "UPDATE service_requests SET version=version+1,updated_at=now() WHERE id=? RETURNING *",
            [id],
          )
        )[0];
      },
    );
  }
  async order(actor, id, staff = false) {
    uuid(id);
    const [order] = await this.read("SELECT o.*,COALESCE(NULLIF(o.billing_period,''),s.period) AS billing_period,COALESCE(o.expires_at,s.due_at) AS expires_at FROM payment_orders o LEFT JOIN billing_statements s ON s.id=o.statement_id WHERE o.id=?", [
      id,
    ]);
    if (!order) fail("Payment order not found.", 404);
    if (staff) {
      await this.authorize(actor, "payments.view", order);
      if (
        !(
          await this.read(
            "SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?",
            [actor.id, order.department_id],
          )
        ).length
      )
        fail("This order belongs to another department.", 403);
    } else if (order.user_id !== actor.id)
      fail("Payment order not found.", 404);
    return {
      ...order,
      items: await this.read(
        "SELECT * FROM payment_order_items WHERE payment_order_id=?",
        [id],
      ),
      payments: await this.read(
        "SELECT id,payment_reference,amount,method,status,provider_reference,paid_at,verified_at FROM payments WHERE payment_order_id=?",
        [id],
      ),
      attempts: await this.read('SELECT id,reference,method,payer_reference,amount,status,payment_id,created_at,resolved_at,reason FROM payment_attempts WHERE payment_order_id=? ORDER BY created_at DESC',[id]),
      gateway_pending: (await this.read("SELECT 1 FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING'",[id])).length>0,
      receipts: await this.read(
        "SELECT r.* FROM payment_receipts r JOIN payments p ON p.id=r.payment_id WHERE p.payment_order_id=?",
        [id],
      ),
      adjustments: await this.read(
        "SELECT a.id,a.payment_id,a.kind,a.created_at FROM payment_adjustments a JOIN payments p ON p.id=a.payment_id WHERE p.payment_order_id=?",
        [id],
      ),
      online_available: false,
    };
  }
  async confirmPayment(
    actor,
    id,
    data,
    key,
    correlation,
    verifiedProvider = null,
  ) {
    return this.idempotent(
      actor,
      `payment:${uuid(id)}`,
      key,
      data,
      async (db) => {
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? FOR UPDATE",
          [id],
        );
        if (!order) fail("Payment order not found.", 404);
        await this.authorize(actor, "payments.verify", order);
        if (
          !(
            await db(
              "SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?",
              [actor.id, order.department_id],
            )
          ).length
        )
          fail("Department access required.", 403);
        const [requestConfig] = await db('SELECT r.* FROM service_requests r LEFT JOIN request_business_billing x ON x.request_id=r.id WHERE r.id=? OR x.selected_order_id=?',[order.request_id,id]);
        if (requestConfig && requestConfig.status!=='AWAITING_PAYMENT') fail('This transaction is not awaiting payment.',409);
        if (
          requestConfig?.settings_snapshot?.separation_of_duties !== false &&
          order.assessed_by === actor.id
        )
          fail(
            "A different authorized employee must verify this payment.",
            403,
          );
        if (
          !["UNPAID", "ISSUED", "PARTIALLY_PAID"].includes(order.status) ||
          (order.expires_at && new Date(order.expires_at) <= new Date())
        )
          fail("This order is not available for payment.", 409);
        const amount = cents(data.amount);
        if (amount <= 0n) fail("Enter a positive payment amount.");
        const [balance] = await db(
          "SELECT COALESCE(sum(p.amount),0)::text AS paid FROM payments p WHERE p.payment_order_id=? AND p.status=? AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)",
          [id, "CONFIRMED"],
        );
        const paid = cents(balance.paid) + amount;
        if (paid > cents(order.amount))
          fail("Payment exceeds the outstanding amount.");
        const reference = text(data.reference, 200);
        if (!reference)
          fail("Enter the authorized cashier transaction reference.");
        const paymentId = crypto.randomUUID();
        const [attempt] = await db("SELECT * FROM payment_attempts WHERE payment_order_id=? AND status='PENDING' FOR UPDATE",[id]);
        const [checkout] = await db("SELECT * FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING' FOR UPDATE",[id]);
        if (checkout && (!verifiedProvider || checkout.provider!==verifiedProvider || cents(checkout.amount)!==amount)) fail('Reconcile the pending gateway checkout before recording a different payment.',409);
        if (verifiedProvider && requestConfig && (await db('SELECT 1 FROM request_business_billing WHERE request_id=?',[requestConfig.id])).length && !checkout) fail('A matching gateway checkout is required.',409);
        if (attempt && (!data.attempt_id || data.attempt_id !== attempt.id || cents(attempt.amount) !== amount || attempt.payer_reference !== reference)) fail('Verify the pending payment submission using its exact amount and reference.',409);
        if (data.attempt_id && !attempt) fail('Payment submission was already processed.',409);
        await db(
          "INSERT INTO payments(id,user_id,payment_order_id,amount,method,status,provider,provider_reference,currency,paid_at,verified_at,verified_by,created_at) VALUES(?,?,?,?,?,'CONFIRMED',?,?,'PHP',now(),now(),?,now())",
          [
            paymentId,
            order.user_id,
            id,
            decimal(amount),
            verifiedProvider ? "ONLINE" : attempt?.method || "CASH",
            verifiedProvider || "MANUAL",
            reference,
            actor.id,
          ],
        );
        if (attempt) await db("UPDATE payment_attempts SET status='VERIFIED',payment_id=?,resolved_at=now(),resolved_by=? WHERE id=?",[paymentId,actor.id,attempt.id]);
        if (checkout) await db("UPDATE payment_gateway_checkouts SET status='CONFIRMED',payment_id=? WHERE id=?",[paymentId,checkout.id]);
        await db(
          "INSERT INTO payment_allocations(payment_id,payment_order_id,amount) VALUES(?,?,?)",
          [paymentId, id, decimal(amount)],
        );
        await db(
          "INSERT INTO payment_receipts(payment_id,kind) VALUES(?,'CONFIRMATION')",
          [paymentId],
        );
        const status = paid === cents(order.amount) ? "PAID" : "PARTIALLY_PAID";
        await db("UPDATE payment_orders SET status=? WHERE id=?", [status, id]);
        if (requestConfig && status === "PAID") {
          const [request] = await db(
            "SELECT * FROM service_requests WHERE id=? FOR UPDATE",
            [requestConfig.id],
          );
          await this.change(
            db,
            actor,
            request,
            "PAID",
            "Payment verified by Treasury",
            correlation,
            { payment: true },
          );
        }
        await this.audit(
          db,
          actor,
          "payment.verified",
          paymentId,
          { order_id: id, amount: decimal(amount) },
          correlation,
        );
        return { id: paymentId, status, amount: decimal(amount) };
      },
    );
  }
  async reversePayment(actor, paymentId, data, key, correlation) {
    return this.idempotent(
      actor,
      `reverse:${paymentId}`,
      key,
      data,
      async (db) => {
        const [payment] = await db(
          "SELECT * FROM payments WHERE id=? AND payment_order_id IS NOT NULL",
          [paymentId],
        );
        if (!payment) fail("Payment not found.", 404);
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? FOR UPDATE",
          [payment.payment_order_id],
        );
        await this.authorize(actor, "payments.reverse", order);
        if (
          !(
            await db(
              "SELECT 1 FROM eservice_department_members WHERE user_id=? AND department_id=?",
              [actor.id, order.department_id],
            )
          ).length
        )
          fail("Department access required.", 403);
        if (payment.verified_by === actor.id)
          fail(
            "A different authorized employee must reverse this payment.",
            403,
          );
        const reason = text(data.reason);
        if (!reason) fail("Enter a reversal reason.");
        const [linkedRequest] = await db('SELECT r.* FROM service_requests r LEFT JOIN request_business_billing x ON x.request_id=r.id WHERE r.id=? OR x.selected_order_id=? FOR UPDATE OF r',[order.request_id,order.id]);
        if (linkedRequest) {
          const request = linkedRequest;
          if (!["AWAITING_PAYMENT", "PAID"].includes(request.status))
            fail(
              "Resolve the approved application before reversing its payment.",
              409,
            );
          if (request.status === "PAID")
            await this.change(
              db,
              actor,
              request,
              "AWAITING_PAYMENT",
              "Verified payment reversed",
              correlation,
              { payment: true },
            );
        }
        await db(
          "INSERT INTO payment_adjustments(payment_id,kind,reason,actor_id) VALUES(?,'REVERSAL',?,?)",
          [payment.id, reason, actor.id],
        );
        const [sum] = await db(
          "SELECT COALESCE(sum(p.amount),0)::text AS paid FROM payments p WHERE payment_order_id=? AND status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)",
          [order.id],
        );
        const status = cents(sum.paid) > 0n ? "PARTIALLY_PAID" : "UNPAID";
        await db("UPDATE payment_orders SET status=? WHERE id=?", [
          status,
          order.id,
        ]);
        await this.audit(
          db,
          actor,
          "payment.reversed",
          payment.id,
          { order_id: order.id, reason },
          correlation,
        );
        return { payment_id: payment.id, order_id: order.id, status };
      },
    );
  }
  async adjustAssessment(actor, id, data, key, correlation) {
    return this.idempotent(
      actor,
      `adjust-assessment:${uuid(id)}`,
      key,
      data,
      async (db) => {
        const request = await this.staff(
          db,
          actor,
          id,
          "assessments.adjust",
          true,
        );
        this.stale(request, data.version);
        if (request.status !== "AWAITING_PAYMENT")
          fail("Only an unpaid assessment may be replaced.", 409);
        const reason = text(data.reason || "");
        if (!reason)
          fail(
            "Enter the reason for applying the current authorized fee schedule.",
          );
        const [old] = await db(
          "SELECT * FROM payment_orders WHERE request_id=? AND status NOT IN ('CANCELLED','EXPIRED') FOR UPDATE",
          [id],
        );
        if (old && (await db("SELECT 1 FROM payment_attempts WHERE payment_order_id=? AND status='PENDING'",[old.id])).length) fail('Resolve pending payment verification before replacing the assessment.',409);
        if (old && (await db("SELECT 1 FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING'",[old.id])).length) fail('Reconcile the online checkout before replacing the assessment.',409);
        if (
          !old ||
          (
            await db("SELECT 1 FROM payments WHERE payment_order_id=?", [
              old.id,
            ])
          ).length
        )
          fail(
            "Resolve recorded payments before replacing the assessment.",
            409,
          );
        const [service] = await db("SELECT version FROM services WHERE id=?", [
          request.service_id,
        ]);
        const fees = await db(
          "SELECT * FROM service_fees WHERE service_id=? AND revision=?",
          [request.service_id, service.version],
        );
        if (!fees.length) fail("No current authorized fees are configured.");
        const total = totalFees(fees);
        if (cents(total) <= 0n) fail("Configure a positive assessment.");
        await db("UPDATE payment_orders SET status='CANCELLED' WHERE id=?", [
          old.id,
        ]);
        const [order] = await db(
          "INSERT INTO payment_orders(order_number,request_id,user_id,department_id,amount,assessed_by) VALUES('PO-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(nextval('eservice_order_reference')::text,6,'0'),?,?,?,?,?) RETURNING *",
          [
            id,
            request.applicant_user_id,
            request.department_id,
            total,
            actor.id,
          ],
        );
        for (const fee of fees)
          await db(
            "INSERT INTO payment_order_items(payment_order_id,fee_code,description,amount,source,fee_type) VALUES(?,?,?,?,?,?)",
            [order.id, fee.code, fee.description, fee.amount, fee.source,fee.fee_type],
          );
        await db(
          "INSERT INTO request_actions(request_id,actor_user_id,action,metadata) VALUES(?,?,?,?::jsonb)",
          [
            id,
            actor.id,
            "assessment.adjusted",
            JSON.stringify({
              previous_order: old.id,
              order_id: order.id,
              fee_revision: service.version,
              reason,
            }),
          ],
        );
        await db(
          "UPDATE service_requests SET version=version+1,updated_at=now() WHERE id=?",
          [id],
        );
        await this.audit(
          db,
          actor,
          "assessment.adjusted",
          order.id,
          {
            previous_order: old.id,
            previous_amount: old.amount,
            amount: total,
            fee_revision: service.version,
            reason,
          },
          correlation,
        );
        await this.notify(
          db,
          request,
          "Updated assessment issued",
          `${request.request_number}: payment order ${order.order_number}`,
          "payment.requires_attention",
        );
        return { order };
      },
    );
  }
}
Object.assign(EserviceEngine.prototype, businessBillingMethods);
