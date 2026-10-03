import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

// Browser fixtures only. No applications, bills or balances enter the database.
const output = path.resolve(process.env.ESERVICES_UI_OUTPUT || "artifacts/unified-eservices");
await fs.mkdir(output, { recursive: true });
const service = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "new-business-application",
  name: "New Business Application",
  kind: "BUSINESS_NEW",
  department_id: "treasury",
  description:
    "Apply through the Municipal Treasury and configured licensing office.",
  short_description: "Apply and track your business request.",
  instructions: "Complete the form and upload the configured requirements.",
  eligibility: "Configured by the responsible office.",
  processing_time: "",
  online_available: true,
  payment_required: true,
  published: true,
  version: 1,
  definition: { declaration: "I confirm the information is accurate." },
  fields: [
    {
      id: "name",
      key: "business_name",
      label: "Business name",
      type: "text",
      required: true,
      validation: {},
    },
    {
      id: "email",
      key: "email",
      label: "Contact email",
      type: "email",
      required: true,
      validation: {},
    },
  ],
  requirements: [
    { id: "doc", code: "doc", label: "Supporting document", required: true },
  ],
  fees: [
    {
      id: "fee",
      code: "fee",
      description: "Configured assessment fee",
      amount: "30.30",
      source: "Test policy",
    },
  ],
  steps: [],
};
let record = {
  id: "22222222-2222-4222-8222-222222222222",
  request_number: "GET-2026-000001",
  version: 1,
  status: "DRAFT",
  service,
  definition: service.definition,
  fields: service.fields,
  requirements: service.requirements,
  values: {
    business_name: "Getafe Test Enterprise",
    email: "resident@example.invalid",
  },
  documents: [],
  history: [
    { id: "h1", to_status: "DRAFT", created_at: "2026-10-01T01:00:00Z" },
  ],
  notes: [],
  orders: [],
  applicant_snapshot: { user_id: 'test-user', full_name: 'Test Resident', email: 'resident@example.invalid', mobile: '09123456789' },
  steps: [{ status: "SUBMITTED", next_statuses: ["RECEIVED"] }],
  submitted_at: null,
};
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 1050 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    record = { ...record, status: "DRAFT", version: 1, draft_step: 0, documents: [], submitted_at: null };
    const context = await browser.newContext({ viewport }),
      page = await context.newPage();
    let role = "resident";
    const errors = [];
    let memberships = [];
    let staffSearches = 0;
    let profileBusinesses = [];
    let selectedBusiness = null;
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.stack);
    });
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        p = url.pathname;
      let body = {};
      if (p === "/api/auth/me")
        body = {
          user: {
            id: "test-user",
            name: "Test Resident",
            email: "resident@example.invalid",
            role,
            permissions: [
              "services.catalog.view",
              "services.catalog.manage",
              "requests.department.view",
              "requests.department.assign",
              "requests.department.process",
              "documents.process",
              "documents.view",
              "payments.view",
              "payments.verify",
              "assessments.create",
              "eservices.admin",
            ],
            setupRequired: false,
          },
        };
      else if (p === "/api/public/config")
        body = {
          "general.name": "Municipality of Getafe",
          "general.url": "https://getafe.example.invalid",
        };
      else if (p === "/api/citizen/dashboard")
        body = {
          profile: { full_name: "Test Resident" },
          applications: [],
          appointments: [],
          documents: [],
          payments: [],
          notifications: [],
          counts: {},
        };
      else if (p === "/api/users/me/preferences") body = { preferences: {} };
      else if (p === "/api/services/new-business-application") body = service;
      else if (p === "/api/services") body = { items: [service] };
      else if (p === '/api/services/profile-business') body = { ...service, kind: 'BUSINESS', slug: 'profile-business', settings: { workflow_type: 'ASSESSMENT_PAYMENT' } };
      else if (p === '/api/businesses' && req.method() === 'POST') {
        body = { ...req.postDataJSON(), id: '33333333-3333-4333-8333-333333333333', status: 'UNVERIFIED', business_reference: 'PROFILE-test' };
        profileBusinesses.push(body);
      }
      else if (p.startsWith('/api/businesses/') && req.method() === 'PUT') {
        body = { ...profileBusinesses[0], ...req.postDataJSON() }; profileBusinesses = [body];
      }
      else if (p === '/api/businesses') body = { items: profileBusinesses };
      else if (p === "/api/requests" && req.method() === "POST") { selectedBusiness = req.postDataJSON().business_id; body = record; }
      else if (p === "/api/requests" && url.searchParams.has("service_id")) body = { items: [] };
      else if (p === "/api/requests")
        body = {
          items: [
            {
              ...record,
              service_name: service.name,
              applicant_name: "Test Resident",
            },
          ],
          total: 1,
        };
      else if (p.endsWith("/draft")) {
        const data = req.postDataJSON();
        record = {
          ...record,
          values: data.values,
          draft_step: data.draft_step,
          version: record.version + 1,
        };
        body = record;
      } else if (p.endsWith('/documents') && req.method() === 'POST') {
        record = { ...record, version: record.version + 1, documents: [{ id: 'document-1', requirement_id: 'doc', original_filename: 'support.pdf', status: 'PENDING' }] };
        body = { id: 'document-1' };
      } else if (p.endsWith("/submit")) {
        record = {
          ...record,
          status: "SUBMITTED",
          version: record.version + 1,
          submitted_at: "2026-10-01T01:00:00Z",
        };
        body = record;
      } else if (p === `/api/requests/${record.id}`) body = record;
      else if (p === "/api/admin/eservices/staff-search") {
        staffSearches++;
        const q = url.searchParams.get("q");
        if (q === "failure") { await route.fulfill({ status: 503, json: { error: "Search unavailable. Try again." } }); return; }
        if (q === "slow") await new Promise(resolve => setTimeout(resolve, 700));
        body = { items: ["re", "renjie", "slow"].includes(q) ? [{ id: "staff-123", name: "Renjie Pongcol", email: "renjie@example.invalid" }] : [] };
      }
      else if (p === "/api/admin/eservices/department-members" && req.method() === "POST") {
        memberships = [{ department_id: "treasury", department_name: "Municipal Treasury Office" }]; body = { ok: true };
      }
      else if (p.endsWith("/department-members/revoke")) { memberships = []; body = { ok: true }; }
      else if (p === "/api/admin/eservices/department-members") body = { items: memberships };
      else if (p === "/api/admin/services/options")
        body = {
          departments: [{ id: "treasury", name: "Municipal Treasury Office" }],
          categories: [{ id: "business", name: "Business Services" }],
        };
      else if (p === "/api/admin/services") body = { items: [service] };
      else if (p === `/api/admin/services/${service.id}`) body = service;
      else if (p === "/api/staff/eservices/requests")
        body = {
          items: [
            {
              ...record,
              service_name: service.name,
              applicant_name: "Test Resident",
            },
          ],
          total: 1,
        };
      else if (p === `/api/staff/eservices/requests/${record.id}`)
        body = {
          ...record,
          assigned_user_id: null,
          applicant_user_id: "test-user",
        };
      else if (p === "/api/news") body = { items: [] };
      else if (
        ["/api/categories", "/api/officials", "/api/barangays"].includes(p)
      )
        body = [];
      else if (p === "/api/billing/accounts" || p === "/api/payment-orders")
        body = { items: [] };
      else if (p === "/api/staff/eservices/options")
        body = {
          departments: [{ id: "treasury", name: "Treasury" }],
          services: [service],
          members: [],
        };
      else body = { items: [] };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const base = process.env.UI_TEST_URL || "http://127.0.0.1:5173";
    await page.goto(base + '/app/services/profile-business');
    await page.getByRole('link', { name: 'Manage business information' }).click();
    const profile = page.getByRole('dialog');
    await profile.getByRole('heading', { name: 'Business information', exact: true }).waitFor();
    await profile.getByRole('button', { name: 'Add business', exact: true }).click();
    await profile.getByLabel('Business name', { exact: true }).fill('Resident enterprise');
    await profile.getByLabel('Ownership type', { exact: true }).selectOption('Sole proprietorship');
    await profile.getByLabel('Business barangay', { exact: true }).selectOption('Alumar');
    await profile.getByLabel('Business street, building or purok').fill('Purok 2');
    await profile.getByRole('button', { name: 'Save business', exact: true }).click();
    await profile.getByText('Business information saved. You can now choose it in your application.', { exact: true }).waitFor();
    await profile.locator('.profile-businesses').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `profile-business-${viewport.width}.png`) });
    await profile.getByRole('button', { name: 'Close profile editor', exact: true }).click();
    assert.equal(await page.getByLabel('Registered business').inputValue(), '33333333-3333-4333-8333-333333333333');
    await page.reload();
    await page.getByRole('link', { name: 'Manage business information' }).click();
    await profile.getByRole('heading', { name: 'Resident enterprise', exact: true }).waitFor();
    await profile.getByRole('button', { name: 'Edit business', exact: true }).click();
    await profile.getByLabel('Business name', { exact: true }).fill('Updated resident enterprise');
    await profile.getByRole('button', { name: 'Close profile editor', exact: true }).click();
    await profile.getByRole('alertdialog').waitFor();
    await profile.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await profile.getByRole('button', { name: 'Save business', exact: true }).click();
    await profile.getByText('Business information saved. You can now choose it in your application.', { exact: true }).waitFor();
    await profile.getByRole('button', { name: 'Close profile editor', exact: true }).click();
    await page.getByRole('button', { name: 'Start application', exact: true }).click();
    await page.waitForURL('**/app/e-requests/' + record.id);
    assert.equal(selectedBusiness, profileBusinesses[0].id);
    await page.goto(base + '/app/services');
    await page.getByRole('link', { name: 'Apply', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Apply', exact: true }).getAttribute('href'), '/app/services/new-business-application');
    await page.getByText('Eligibility, requirements and fees', { exact: true }).click();
    await page.getByText('Configured assessment fee: ₱30.30', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `Catalog overflow at ${viewport.width}`);
    await page.screenshot({ path: path.join(output, `catalog-${viewport.width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Apply', exact: true }).click();
    await page.waitForURL('**/app/services/new-business-application');
    await page.getByRole('complementary', { name: 'Citizen navigation' }).waitFor({ state: 'attached' });
    assert.equal(await page.locator('.topbar').count(), 0, 'Public website header must not appear in app service details');
    await page.reload();
    await page
      .getByRole("button", { name: "Start application", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(output, `service-${viewport.width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Start application", exact: true })
      .click();
    await page.getByRole('heading', { name: 'Applicant information', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Supporting document' }).waitFor();
    await page.getByLabel('Upload document').setInputFiles({ name: 'support.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nfixture') });
    await page.getByText('Document uploaded.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByLabel("Business name").waitFor();
    await page.getByLabel("Business name").fill("Updated Test Enterprise");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.getByText("Progress saved.", { exact: true }).waitFor();
    await page.getByLabel('Business name').fill('Saved before leaving');
    await page.getByRole('link', { name: 'My requests', exact: true }).click();
    await page.waitForURL('**/app/e-requests');
    await page.getByRole('link', { name: record.request_number, exact: true }).click();
    await page.getByLabel('Business name').waitFor();
    assert.equal(await page.getByLabel('Business name').inputValue(), 'Saved before leaving');
    await page.getByLabel('Business name').fill('Updated Test Enterprise');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Progress saved.', { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, `resident-${viewport.width}.png`),
      fullPage: true,
    });
    await page.reload();
    await page.getByLabel('Business name').waitFor();
    assert.equal(await page.getByLabel('Business name').inputValue(), 'Updated Test Enterprise');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Review', exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `review-${viewport.width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `Review overflow at ${viewport.width}`);
    await page.getByLabel('I confirm the information is accurate.').check();
    await page.getByRole('button', { name: 'Submit application', exact: true }).click();
    await page.getByRole('heading', { name: 'Application submitted', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Track request', exact: true }).click();
    await page.locator(".es-timeline").waitFor();
    await page.goto(base + "/app/e-billing/real_property");
    await page
      .getByText(
        "Online real property billing is not yet available for this account.",
      )
      .waitFor();
    role = "admin";
    await page.goto(base + "/admin?sysparm_object_id=service-catalog");
    await page
      .getByRole("heading", { name: "E-Services · Service catalog" })
      .waitFor();
    const staffInput = page.getByRole("combobox", { name: "Staff member", exact: true });
    const grant = page.getByRole("button", { name: "Grant department access", exact: true });
    assert.equal(await grant.isDisabled(), true);
    await staffInput.fill("nobody");
    await page.getByText("No matches found.", { exact: true }).waitFor();
    await staffInput.fill("failure");
    await page.getByText("We couldn't complete your request right now. Please try again later.").waitFor();
    const before = staffSearches;
    await staffInput.fill("r"); await staffInput.fill("ren"); await staffInput.fill("renjie");
    await page.getByRole("option", { name: /Renjie Pongcol/ }).waitFor();
    assert.equal(staffSearches, before + 1, "rapid typing is debounced");
    await staffInput.press("ArrowDown"); await staffInput.press("Enter");
    await page.getByText("No department access assigned.").waitFor();
    const officeInput = page.getByRole("combobox", { name: "Office", exact: true });
    await officeInput.fill("Treasury");
    await page.getByRole("listbox", { name: "Office matches" }).getByRole("option", { name: "Municipal Treasury Office", exact: true }).waitFor();
    await officeInput.press("ArrowUp"); await officeInput.press("Enter");
    await grant.click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByText("Department access granted.", { exact: true }).waitFor();
    assert.equal(await grant.isDisabled(), true);
    await officeInput.fill("Treasury");
    await page.getByRole("option", { name: /Already assigned/ }).waitFor();
    assert.equal(await page.getByRole("option", { name: /Already assigned/ }).getAttribute("aria-disabled"), "true");
    await officeInput.press("Escape");
    await page.screenshot({ path: path.join(output, `catalog-access-${viewport.width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "catalog fits viewport");
    await page.getByRole("button", { name: "Remove access to Municipal Treasury Office" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByText("Department access removed.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Clear staff member" }).click();
    assert.equal(await officeInput.isDisabled(), true);
    await staffInput.fill("slow");
    await page.waitForTimeout(400);
    await staffInput.fill("nobody");
    await page.getByText("No matches found.", { exact: true }).waitFor();
    await page.waitForTimeout(800);
    assert.equal(await page.getByRole("option", { name: /Renjie Pongcol/ }).count(), 0, "stale search cannot replace current results");
    await staffInput.press("Tab");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("button", { name: "Application form", exact: true })
      .click();
    await page.getByLabel("Applicant declaration", { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, `cms-${viewport.width}.png`),
      fullPage: true,
    });
    role = "staff";
    record.status = "SUBMITTED";
    await page.goto(base + "/app/staff?sysparm_object_id=requests");
    await page
      .getByRole("heading", { name: "E-service requests", exact: true })
      .waitFor();
    await page
      .getByRole("link", { name: record.request_number, exact: true })
      .click();
    await page
      .getByRole("button", { name: "Documents", exact: true })
      .waitFor();
    await page.screenshot({
      path: path.join(output, `staff-${viewport.width}.png`),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    assert.equal(
      overflow,
      false,
      `Staff horizontal page overflow at ${viewport.width}`,
    );
    assert.deepEqual(errors, [], `Browser errors at ${viewport.width}`);
    await context.close();
    console.log(
      `Desktop/mobile ${viewport.width}px: service, draft, sections, billing unavailable, CMS editor and staff direct links passed.`,
    );
  }
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      await page.screenshot({
        path: path.join(output, "failure.png"),
        fullPage: true,
      });
      console.error((await page.locator("body").innerText()).slice(-1800));
    }
  throw error;
} finally {
  await browser.close();
}


