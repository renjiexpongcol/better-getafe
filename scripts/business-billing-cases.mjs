import assert from "node:assert/strict";
import crypto from "node:crypto";
export async function businessBillingCases({
  t,
  engine,
  processor,
  cashier,
  resident,
  other,
  business,
  call,
  base,
  gatewaySecret,
}) {
  const key = () => crypto.randomUUID();
  let service;
  await t.test(
    "business billing: saved draft, ownership, staff assessment, review, manual verification, receipt and completion",
    async () => {
      service = await engine.saveService(
        processor,
        {
          name: "Business billing test",
          slug: `billing-${key()}`,
          kind: "BUSINESS",
          department_id: "treasury",
          published: true,
          online_available: true,
          fields: [],
          fees: [
            {
              code: "TAX",
              description: "Business tax Q4 2026",
              amount: "4250.00",
              source: "Isolated test schedule",
            },
            {
              code: "PERMIT",
              description: "Permit charge",
              amount: "500.00",
              source: "Isolated test schedule",
            },
          ],
        },
        null,
      );
      assert.equal(service.payment_required, true);
      assert.equal(service.settings.workflow_type, "ASSESSMENT_PAYMENT");
      await assert.rejects(
        () =>
          engine.createDraft(
            other,
            { service_id: service.id, business_id: business.id },
            key(),
          ),
        { status: 404 },
      );
      let draft = await engine.createDraft(
        resident,
        { service_id: service.id, business_id: business.id },
        key(),
      );
      assert.match(draft.request_number, /^BILL-\d{4}-\d{6}$/);
      assert.equal(
        (await engine.detail(resident, draft.id)).business.id,
        business.id,
      );
      assert.equal(
        (await engine.businessBilling(resident, draft.id)).orders.length,
        0,
      );
      await assert.rejects(() => engine.businessBilling(other, draft.id), {
        status: 404,
      });
      draft = await engine.submit(
        resident,
        draft.id,
        { version: draft.version, declaration: true },
        key(),
      );
      draft = await engine.process(
        processor,
        draft.id,
        "status",
        { version: draft.version, status: "FOR_ASSESSMENT" },
        key(),
      );
      const assessed = await engine.process(
        processor,
        draft.id,
        "assessment",
        {
          version: draft.version,
          fee_codes: ["TAX", "PERMIT"],
          due_at: "2099-01-01T00:00:00Z",
        },
        key(),
      );
      draft = assessed.request;
      const order = assessed.order;
      assert.equal(order.amount, "4750.00");
      const details = {
        amount: "4750.00",
        reference: "TEST-BANK-4750",
        method: "TREASURY",
      };
      await assert.rejects(
        () => engine.submitPaymentAttempt(resident, order.id, details, key()),
        { status: 409 },
      );
      await engine.reviewBillingOrder(
        resident,
        draft.id,
        { order_id: order.id, confirmed: true },
        key(),
      );
      await assert.rejects(
        () =>
          engine.submitPaymentAttempt(
            resident,
            order.id,
            { ...details, method: "BANK" },
            key(),
          ),
        { status: 422 },
      );
      await assert.rejects(
        () =>
          engine.submitPaymentAttempt(
            resident,
            order.id,
            { ...details, amount: "1.00" },
            key(),
          ),
        { status: 422 },
      );
      const operation = key();
      const submitted = await call(
        resident,
        `/api/payment-orders/${order.id}/payment-submissions`,
        "POST",
        details,
        operation,
      );
      assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
      const attempt = submitted.body;
      assert.match(attempt.reference, /^PAY-\d{4}-\d{6}$/);
      assert.equal((await engine.order(resident, order.id)).status, "UNPAID");
      assert.equal((await engine.order(resident, order.id)).payments.length, 0);
      assert.equal(
        (await engine.list(resident, { business: "true" })).items[0]
          .payment_pending,
        true,
      );
      await assert.rejects(
        () => engine.submitPaymentAttempt(resident, order.id, details, key()),
        { code: "23505" },
      );
      await assert.rejects(
        () =>
          engine.adjustAssessment(
            processor,
            draft.id,
            { version: draft.version, reason: "test" },
            key(),
          ),
        { status: 409 },
      );
      await assert.rejects(
        () =>
          engine.confirmPayment(
            cashier,
            order.id,
            {
              amount: "1.00",
              reference: details.reference,
              attempt_id: attempt.id,
            },
            key(),
          ),
        { status: 409 },
      );
      await engine.rejectPaymentAttempt(
        cashier,
        order.id,
        { attempt_id: attempt.id, reason: "Reference needs correction" },
        key(),
      );
      const retry = await engine.submitPaymentAttempt(
        resident,
        order.id,
        { ...details, reference: "TEST-CASH-4750" },
        key(),
      );
      await assert.rejects(
        () =>
          engine.confirmPayment(
            processor,
            order.id,
            {
              amount: retry.amount,
              reference: retry.payer_reference,
              attempt_id: retry.id,
            },
            key(),
          ),
        { status: 403 },
      );
      const payment = await engine.confirmPayment(
        cashier,
        order.id,
        {
          amount: retry.amount,
          reference: retry.payer_reference,
          attempt_id: retry.id,
        },
        key(),
      );
      assert.equal(payment.status, "PAID");
      draft = await engine.detail(resident, draft.id);
      await assert.rejects(
        () =>
          engine.process(
            processor,
            draft.id,
            "status",
            { version: draft.version, status: "COMPLETED" },
            key(),
          ),
        { status: 409 },
      );
      await assert.rejects(() =>
        engine.issueOfficialReceipt(
          other,
          order.id,
          { payment_id: payment.id, official_number: "OR-TEST-1" },
          key(),
        ),
      );
      const receipt = await call(
        cashier,
        `/api/staff/eservices/payment-orders/${order.id}/receipt`,
        "POST",
        { payment_id: payment.id, official_number: "OR-TEST-1" },
      );
      assert.equal(receipt.status, 201, JSON.stringify(receipt.body));
      const completed = await engine.process(
        processor,
        draft.id,
        "status",
        { version: draft.version, status: "COMPLETED" },
        key(),
      );
      assert.equal(completed.status, "COMPLETED");
      assert.equal(
        (await engine.detail(resident, draft.id)).billing_actions.filter(
          (a) => a.action === "receipt.issued",
        ).length,
        1,
      );
      await assert.rejects(
        () =>
          engine.reversePayment(
            processor,
            payment.id,
            { reason: "Completed request" },
            key(),
          ),
        { status: 409 },
      );
      await assert.rejects(() =>
        engine.read(
          "UPDATE payment_attempts SET payer_reference='tampered' WHERE id=?",
          [retry.id],
        ),
      );
    },
  );
  await t.test(
    "business billing: authoritative existing statement, cross-owner rejection, unique selection and linked payment lifecycle",
    async () => {
      const imported = await call(
        processor,
        "/api/staff/eservices/billing",
        "POST",
        {
          account_type: "BUSINESS",
          account_number: "BP-TEST-2026",
          business_id: business.id,
          user_id: resident.id,
          department_id: "treasury",
          source: "Isolated municipal ledger",
          source_reference: "TEST-Q4",
          period: "Q4 2026",
          items: [{ description: "Business tax", amount: "5100.00" }],
        },
      );
      assert.equal(imported.status, 200, JSON.stringify(imported.body));
      const order = imported.body.order;
      const create = async () => {
        let r = await engine.createDraft(
          resident,
          { service_id: service.id, business_id: business.id },
          key(),
        );
        return engine.submit(
          resident,
          r.id,
          { version: r.version, declaration: true },
          key(),
        );
      };
      let request = await create();
      assert(
        (await engine.businessBilling(resident, request.id)).orders.some(
          (o) => o.id === order.id,
        ),
      );
      await assert.rejects(
        () =>
          engine.selectBillingOrder(
            other,
            request.id,
            { version: request.version, order_id: order.id },
            key(),
          ),
        { status: 404 },
      );
      request = await engine.selectBillingOrder(
        resident,
        request.id,
        { version: request.version, order_id: order.id },
        key(),
      );
      assert.equal(request.status, "AWAITING_PAYMENT");
      const duplicate = await create();
      await assert.rejects(
        () =>
          engine.selectBillingOrder(
            resident,
            duplicate.id,
            { version: duplicate.version, order_id: order.id },
            key(),
          ),
        { code: "23505" },
      );
      await engine.reviewBillingOrder(
        resident,
        request.id,
        { order_id: order.id, confirmed: true },
        key(),
      );
      const payment = await engine.confirmPayment(
        cashier,
        order.id,
        { amount: "5100.00", reference: "TEST-LINKED-CASH" },
        key(),
      );
      assert.equal((await engine.detail(resident, request.id)).status, "PAID");
      await engine.reversePayment(
        processor,
        payment.id,
        { reason: "Isolated reconciliation test" },
        key(),
      );
      assert.equal(
        (await engine.detail(resident, request.id)).status,
        "AWAITING_PAYMENT",
      );
      assert.equal(
        (await engine.businessBilling(resident, request.id)).orders.find(
          (o) => o.id === order.id,
        ).balance,
        "5100.00",
      );
    },
  );
  await t.test(
    "business billing: configured credit, durable gateway checkout, exact callback amount and replay",
    async () => {
      const gateway = await engine.saveService(
        processor,
        {
          name: "Gateway and credit test",
          slug: `gateway-${key()}`,
          kind: "BUSINESS",
          department_id: "treasury",
          published: true,
          online_available: true,
          settings: { payment_provider: "TEST_GATEWAY" },
          fees: [
            {
              code: "TAX",
              description: "Business tax",
              amount: "4250.00",
              source: "Isolated schedule",
              fee_type: "TAX",
            },
            {
              code: "CREDIT",
              description: "Authorized credit",
              amount: "100.00",
              source: "Isolated schedule",
              fee_type: "CREDIT",
            },
          ],
        },
        null,
      );
      let r = await engine.createDraft(
        resident,
        { service_id: gateway.id, business_id: business.id },
        key(),
      );
      r = await engine.submit(
        resident,
        r.id,
        { version: r.version, declaration: true },
        key(),
      );
      r = await engine.process(
        processor,
        r.id,
        "status",
        { version: r.version, status: "FOR_ASSESSMENT" },
        key(),
      );
      const assessed = await engine.process(
        processor,
        r.id,
        "assessment",
        {
          version: r.version,
          fee_codes: ["TAX", "CREDIT"],
          billing_period: "Q4 2026",
        },
        key(),
      );
      const order = assessed.order;
      assert.equal(order.amount, "4150.00");
      assert.equal(
        (await engine.order(resident, order.id)).items.find(
          (i) => i.fee_type === "CREDIT",
        ).amount,
        "100.00",
      );
      assert.equal(
        (
          await call(
            resident,
            `/api/payment-orders/${order.id}/checkout`,
            "POST",
            {},
          )
        ).status,
        409,
      );
      await engine.reviewBillingOrder(
        resident,
        r.id,
        { order_id: order.id, confirmed: true },
        key(),
      );
      const operation = key();
      const checkout = await call(
        resident,
        `/api/payment-orders/${order.id}/checkout`,
        "POST",
        {},
        operation,
      );
      assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
      assert.match(
        checkout.body.url,
        /^https:\/\/checkout.example.invalid\/pay\//,
      );
      assert.deepEqual(
        (
          await call(
            resident,
            `/api/payment-orders/${order.id}/checkout`,
            "POST",
            {},
            operation,
          )
        ).body,
        checkout.body,
      );
      assert.equal((await engine.order(resident, order.id)).status, "UNPAID");
      await assert.rejects(
        () =>
          engine.submitPaymentAttempt(
            resident,
            order.id,
            { method: "TREASURY", amount: "4150.00", reference: "DUPLICATE" },
            key(),
          ),
        { status: 409 },
      );
      const callback = async (amount, reference) => {
        const raw = JSON.stringify({
            status: "CONFIRMED",
            currency: "PHP",
            orderId: order.id,
            reference,
            amount,
          }),
          timestamp = String(Math.floor(Date.now() / 1000));
        const signature = crypto
          .createHmac("sha256", gatewaySecret)
          .update(timestamp + ".")
          .update(raw)
          .digest("hex");
        const response = await fetch(
          `${base}/api/eservices/payment-webhooks/TEST_GATEWAY`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Timestamp": timestamp,
              "X-Signature": signature,
            },
            body: raw,
          },
        );
        return { status: response.status, body: await response.json() };
      };
      assert.equal((await callback("1.00", "GATEWAY-MISMATCH")).status, 409);
      const verified = await callback("4150.00", "GATEWAY-BILLING-1");
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.equal(
        (await callback("4150.00", "GATEWAY-BILLING-1")).body.id,
        verified.body.id,
      );
      assert.equal((await engine.detail(resident, r.id)).status, "PAID");
      const detail = await engine.order(resident, order.id);
      assert.equal(detail.gateway_pending, false);
      assert.match(detail.payments[0].payment_reference, /^PAY-\d{4}-\d{6}$/);
    },
  );
}
