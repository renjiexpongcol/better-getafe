import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";

// Real Express/PostgreSQL domain routes in the disposable test schema. Only the
// session boundary and unrelated shell data are fixtures; no municipal data is used.
export async function billingBrowser({
  engine,
  call,
  resident,
  processor,
  cashier,
}) {
  const [service] = await engine.read(
    "SELECT * FROM services WHERE name='Business billing test'",
  );
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const origin = process.env.UI_TEST_URL || "http://127.0.0.1:5173";
  await fs.mkdir("artifacts/business-billing", { recursive: true });
  try {
    for (const width of [1440, 390]) {
      let actor = resident;
      const errors = [];
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
      });
      await context.route("**/api/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        let body = {};
        if (path === "/api/auth/me")
          body = {
            user: {
              ...actor,
              name:
                actor === resident
                  ? "Test business owner"
                  : "Treasury employee",
              email: "test@example.invalid",
              role: actor === resident ? "resident" : "staff",
              setupRequired: false,
            },
          };
        else if (
          /^\/api\/(services|requests|businesses|payment-orders|billing|staff\/eservices)(\/|$)/.test(
            path,
          )
        ) {
          const response = await call(
            actor,
            path + url.search,
            req.method(),
            req.postData() ? req.postDataJSON() : undefined,
            req.headers()["idempotency-key"],
          );
          return route.fulfill({
            status: response.status,
            json: response.body,
          });
        } else if (path === "/api/public/config")
          body = { "general.name": "Municipality of Getafe" };
        else if (path === "/api/citizen/dashboard")
          body = {
            profile: { full_name: "Test business owner" },
            applications: [],
            appointments: [],
            documents: [],
            payments: [],
            notifications: [],
            counts: {},
          };
        else if (path.includes("preferences")) body = { preferences: {} };
        else if (path === "/api/news") body = { items: [] };
        else if (path.includes("/notifications"))
          body = { items: [], notifications: [], unread: 0 };
        else if (path.includes("/staff/"))
          body = { items: [], applications: [], requests: [], departments: [] };
        return route.fulfill({ json: body });
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${origin}/app/services/${service.slug}`);
      await page
        .getByLabel("Registered business")
        .selectOption({ label: 'Test business · Active' });
      await page
        .getByRole("button", { name: "Start application", exact: true })
        .click();
      await page.waitForURL("**/app/e-requests/*");
      const requestUrl = page.url(),
        requestId = requestUrl.split("/").pop();
      await page
        .getByText("No payable assessment is currently available.", {
          exact: true,
        })
        .waitFor();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('heading', { name: 'Review', exact: true }).waitFor();
      await page.locator('.es-declaration input[type=checkbox]').check();
      await page
        .getByRole("button", {
          name: "Submit application",
          exact: true,
        })
        .click();
      await page
        .getByText("Submitted. The municipal office", { exact: false })
        .waitFor();
      await page.reload();
      await page
        .getByRole("heading", { name: "Test business", exact: true })
        .waitFor();
      assert.equal(
        (await engine.detail(resident, requestId)).status,
        "SUBMITTED",
      );
      actor = processor;
      await page.goto(`${origin}/app/staff/e-requests/${requestId}`);
      await page.getByLabel("Next status").selectOption("FOR_ASSESSMENT");
      await page
        .getByRole("button", { name: "Update status", exact: true })
        .click();
      await page.getByText("Request updated.", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Assessment & payment", exact: true })
        .click();
      await page.getByLabel("Business tax Q4 2026", { exact: false }).check();
      await page.getByLabel("Permit charge", { exact: false }).check();
      await page
        .getByRole("button", {
          name: "Issue assessment and payment order",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: /PO-.*Unpaid/ }).waitFor();
      actor = resident;
      await page.goto(requestUrl);
      await page
        .getByLabel("I confirm that I have reviewed the assessment.")
        .check();
      await page
        .getByRole("button", { name: "Continue to payment", exact: true })
        .click();
      await page
        .getByLabel("Payment method", { exact: true })
        .selectOption("TREASURY");
      await page.getByLabel("Amount paid", { exact: true }).fill("4750.00");
      await page
        .getByLabel("Bank, wallet or cashier reference", { exact: true })
        .fill(`UI-TEST-${width}`);
      await page
        .getByRole("button", { name: "Submit for verification", exact: true })
        .click();
      await page
        .getByText("Pending payment verification", { exact: true })
        .waitFor();
      await page.reload();
      await page
        .getByText("Pending payment verification", { exact: true })
        .waitFor();
      await page.screenshot({
        path: `artifacts/business-billing/resident-${width}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Resident overflow",
      );
      actor = cashier;
      await page.goto(`${origin}/app/staff/e-requests/${requestId}`);
      await page
        .getByRole("button", { name: "Assessment & payment", exact: true })
        .click();
      await page.getByRole("button", { name: /PO-.*Unpaid/ }).click();
      await page
        .getByRole("button", { name: "Confirm verified payment", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "Record issued official receipt",
          exact: true,
        })
        .waitFor();
      await page
        .getByLabel("Verified payment", { exact: true })
        .selectOption({ index: 1 });
      await page
        .getByLabel("Official receipt number", { exact: true })
        .fill(`OR-UI-${width}`);
      await page
        .getByRole("button", { name: "Record official receipt", exact: true })
        .click();
      await page
        .getByText(`Official receipt OR-UI-${width}`, { exact: false })
        .first()
        .waitFor();
      await page.screenshot({
        path: `artifacts/business-billing/staff-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Application", exact: true })
        .click();
      await page.getByLabel("Next status").selectOption("COMPLETED");
      await page
        .getByRole("button", { name: "Update status", exact: true })
        .click();
      await page.getByText("Request updated.", { exact: true }).waitFor();
      actor = resident;
      await page.goto(`${origin}/app/e-billing/business`);
      await page
        .getByRole("link", { name: "Open transaction", exact: true })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "Payment successful", exact: true })
        .waitFor();
      await page.getByText("Transaction completed.", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "View receipt", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: `Official receipt OR-UI-${width}`,
          exact: true,
        })
        .waitFor();
      await page.screenshot({
        path: `artifacts/business-billing/confirmation-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
  } catch (error) {
    for (const context of browser.contexts())
      for (const page of context.pages()) {
        await page.screenshot({
          path: "artifacts/business-billing/failure.png",
          fullPage: true,
        });
        console.error(
          "Billing browser failure:",
          page.url(),
          await page.locator("body").innerText(),
        );
      }
    throw error;
  } finally {
    await browser.close();
  }
}
