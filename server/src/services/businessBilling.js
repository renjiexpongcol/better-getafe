import { fail, uuid, text, cents, decimal } from "./eserviceValidation.js";
import { PAYMENT_METHODS } from "../../../src/data/businessBillingWorkflow.js";

export const businessBillingMethods = {
  async businessBilling(actor, requestId) {
    const request = await this.owned(this.read.bind(this), actor, requestId);
    const [business] = await this.read(
      `SELECT b.*,u.name AS owner_name FROM request_business_billing x
      JOIN businesses b ON b.id=x.business_id JOIN portal_users u ON u.id=?
      WHERE x.request_id=? AND EXISTS(SELECT 1 FROM business_owners o WHERE o.business_id=b.id AND o.user_id=? AND o.effective_until IS NULL)`,
      [actor.id, requestId, actor.id],
    );
    if (!business)
      fail(
        "Business access is no longer available. Contact the municipal office.",
        403,
      );
    const orders = await this.read(
      `SELECT o.*,s.period,s.due_at,s.source_reference,
      GREATEST(o.amount-COALESCE((SELECT sum(p.amount) FROM payments p WHERE p.payment_order_id=o.id AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)),0),0)::text AS balance
      FROM payment_orders o LEFT JOIN billing_statements s ON s.id=o.statement_id LEFT JOIN billing_accounts a ON a.id=s.account_id
      WHERE o.user_id=? AND o.department_id=? AND (o.request_id=? OR (a.business_id=? AND a.account_type='BUSINESS'))
      AND o.status NOT IN ('CANCELLED','EXPIRED') AND NOT EXISTS(SELECT 1 FROM request_business_billing other WHERE other.selected_order_id=o.id AND other.request_id<>?) ORDER BY o.created_at DESC`,
      [actor.id, request.department_id, requestId, business.id, requestId],
    );
    const [link] = await this.read(
      "SELECT * FROM request_business_billing WHERE request_id=?",
      [requestId],
    );
    const active = orders.find(
      (o) => o.id === link.selected_order_id || o.request_id === requestId,
    );
    return {
      business,
      orders,
      selected_order_id: active?.id || null,
      reviewed: Boolean(active && link.reviewed_order_id === active.id),
      payment_provider: request.settings_snapshot?.payment_provider || "",
      payment_methods: request.settings_snapshot?.payment_methods || [
        "TREASURY",
      ],
      payment_instructions:
        request.settings_snapshot?.payment_instructions ||
        "Present your assessment to the Municipal Treasurer. Submit the cashier reference after payment.",
    };
  },
  async selectBillingOrder(actor, requestId, data, key, correlation) {
    return this.idempotent(
      actor,
      `billing-select:${uuid(requestId)}`,
      key,
      data,
      async (db) => {
        const request = await this.owned(db, actor, requestId, true);
        this.stale(request, data.version);
        if (request.status !== "SUBMITTED")
          fail("Submit the transaction before selecting an assessment.", 409);
        const [link] = await db(
          "SELECT * FROM request_business_billing WHERE request_id=? FOR UPDATE",
          [requestId],
        );
        if (!link || link.selected_order_id)
          fail(
            "This transaction already has an assessment or is not a billing transaction.",
            409,
          );
        if (
          !(
            await db(
              "SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL",
              [link.business_id, actor.id],
            )
          ).length
        )
          fail("Business access required.", 403);
        const [order] = await db(
          `SELECT o.* FROM payment_orders o JOIN billing_statements s ON s.id=o.statement_id JOIN billing_accounts a ON a.id=s.account_id
        WHERE o.id=? AND o.user_id=? AND a.business_id=? AND a.account_type='BUSINESS' AND o.department_id=? FOR UPDATE OF o`,
          [
            uuid(data.order_id),
            actor.id,
            link.business_id,
            request.department_id,
          ],
        );
        if (
          !order ||
          !["UNPAID", "ISSUED", "PARTIALLY_PAID"].includes(order.status) ||
          (order.expires_at && new Date(order.expires_at) <= new Date())
        )
          fail("Choose an eligible unpaid assessment.", 409);
        if (
          (
            await db(
              "SELECT 1 FROM payment_orders WHERE request_id=? AND status NOT IN ('CANCELLED','EXPIRED')",
              [requestId],
            )
          ).length
        )
          fail("An assessment has already been prepared.", 409);
        await db(
          "UPDATE request_business_billing SET selected_order_id=? WHERE request_id=?",
          [order.id, requestId],
        );
        return this.change(
          db,
          { ...actor, kind: "resident" },
          request,
          "AWAITING_PAYMENT",
          "Existing municipal assessment retrieved",
          correlation,
          { payment: true },
        );
      },
    );
  },
  async reviewBillingOrder(actor, requestId, data, key, correlation) {
    return this.idempotent(
      actor,
      `billing-review:${uuid(requestId)}`,
      key,
      data,
      async (db) => {
        const request = await this.owned(db, actor, requestId, true);
        if (request.status !== "AWAITING_PAYMENT" || data.confirmed !== true)
          fail("Confirm that you have reviewed the assessment.", 409);
        const [link] = await db(
          "SELECT * FROM request_business_billing WHERE request_id=?",
          [requestId],
        );
        if (!link) fail("Billing transaction not found.", 404);
        if (
          !(
            await db(
              "SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL",
              [link.business_id, actor.id],
            )
          ).length
        )
          fail("Business access required.", 403);
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? AND user_id=? AND (request_id=? OR id=?) AND status IN ('UNPAID','ISSUED','PARTIALLY_PAID')",
          [uuid(data.order_id), actor.id, requestId, link.selected_order_id],
        );
        if (!order)
          fail(
            "Assessment changed. Refresh and review the latest assessment.",
            409,
          );
        await db(
          "UPDATE request_business_billing SET reviewed_order_id=?,reviewed_at=now() WHERE request_id=?",
          [order.id, requestId],
        );
        await this.audit(
          db,
          actor,
          "assessment.reviewed",
          requestId,
          { order_id: order.id, amount: order.amount },
          correlation,
        );
        return { reviewed: true };
      },
    );
  },
  async submitPaymentAttempt(actor, orderId, data, key, correlation) {
    return this.idempotent(
      actor,
      `payment-submit:${uuid(orderId)}`,
      key,
      data,
      async (db) => {
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? AND user_id=? FOR UPDATE",
          [orderId, actor.id],
        );
        if (
          !order ||
          !["UNPAID", "ISSUED", "PARTIALLY_PAID"].includes(order.status) ||
          (order.expires_at && new Date(order.expires_at) <= new Date())
        )
          fail("This assessment is not available for payment.", 409);
        if (
          (
            await db(
              "SELECT 1 FROM payment_gateway_checkouts WHERE payment_order_id=? AND status='PENDING'",
              [orderId],
            )
          ).length
        )
          fail(
            "An online payment is pending. Contact Treasury if it needs reconciliation.",
            409,
          );
        const [request] = await db(
          "SELECT r.*,x.reviewed_order_id,x.business_id FROM service_requests r JOIN request_business_billing x ON x.request_id=r.id WHERE r.id=? OR x.selected_order_id=?",
          [order.request_id, orderId],
        );
        if (
          !request ||
          request.applicant_user_id !== actor.id ||
          request.status !== "AWAITING_PAYMENT" ||
          request.reviewed_order_id !== orderId
        )
          fail(
            "Review the assessment in your business transaction before submitting payment.",
            409,
          );
        if (
          !(
            await db(
              "SELECT 1 FROM business_owners WHERE business_id=? AND user_id=? AND effective_until IS NULL",
              [request.business_id, actor.id],
            )
          ).length
        )
          fail("Business access required.", 403);
        const methods = request.settings_snapshot?.payment_methods || [
          "TREASURY",
        ];
        if (
          !Object.hasOwn(PAYMENT_METHODS, data.method) ||
          !methods.includes(data.method)
        )
          fail("Choose an enabled payment method.");
        const reference = text(data.reference || "", 200);
        if (!reference)
          fail("Enter the bank, wallet or cashier transaction reference.");
        const amount = cents(data.amount);
        const [paid] = await db(
          "SELECT COALESCE(sum(p.amount),0)::text AS total FROM payments p WHERE p.payment_order_id=? AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)",
          [orderId],
        );
        if (amount <= 0n || amount > cents(order.amount) - cents(paid.total))
          fail("Enter an amount within the outstanding balance.");
        if (
          request.settings_snapshot?.allow_partial_payment !== true &&
          amount !== cents(order.amount) - cents(paid.total)
        )
          fail(
            "This service requires payment of the full outstanding balance.",
          );
        const [attempt] = await db(
          "INSERT INTO payment_attempts(payment_order_id,user_id,method,payer_reference,amount) VALUES(?,?,?,?,?) RETURNING *",
          [orderId, actor.id, data.method, reference, decimal(amount)],
        );
        await db(
          "INSERT INTO request_actions(request_id,actor_user_id,action,metadata) VALUES(?,?,'payment.submitted',?::jsonb)",
          [
            request.id,
            actor.id,
            JSON.stringify({
              reference: attempt.reference,
              amount: attempt.amount,
            }),
          ],
        );
        await this.audit(
          db,
          actor,
          "payment.submitted",
          request.id,
          {
            reference: attempt.reference,
            previous_status: request.status,
            new_status: "PAYMENT_VERIFICATION",
          },
          correlation,
        );
        await this.notify(
          db,
          request,
          "Payment pending verification",
          `${attempt.reference} was received for Treasury verification.`,
        );
        return attempt;
      },
    );
  },
  async rejectPaymentAttempt(actor, orderId, data, key, correlation) {
    return this.idempotent(
      actor,
      `payment-reject:${uuid(orderId)}`,
      key,
      data,
      async (db) => {
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? FOR UPDATE",
          [orderId],
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
        const reason = text(data.reason || "", 1000);
        if (!reason)
          fail("Enter a reason so the resident can correct the payment.");
        const [attempt] = await db(
          "UPDATE payment_attempts SET status='REJECTED',reason=?,resolved_by=?,resolved_at=now() WHERE id=? AND payment_order_id=? AND status='PENDING' RETURNING *",
          [reason, actor.id, uuid(data.attempt_id), orderId],
        );
        if (!attempt) fail("Payment submission was already processed.", 409);
        await this.audit(
          db,
          actor,
          "payment.rejected",
          orderId,
          { reference: attempt.reference, reason },
          correlation,
        );
        return attempt;
      },
    );
  },
  async issueOfficialReceipt(actor, orderId, data, key, correlation) {
    return this.idempotent(
      actor,
      `receipt:${uuid(orderId)}`,
      key,
      data,
      async (db) => {
        const [order] = await db(
          "SELECT * FROM payment_orders WHERE id=? FOR UPDATE",
          [orderId],
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
        const [payment] = await db(
          "SELECT * FROM payments p WHERE p.id=? AND p.payment_order_id=? AND p.status='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM payment_adjustments a WHERE a.payment_id=p.id)",
          [text(data.payment_id, 200), orderId],
        );
        if (!payment) fail("Choose a verified payment.", 409);
        if (
          (
            await db(
              "SELECT 1 FROM payment_receipts WHERE payment_id=? AND kind='OFFICIAL'",
              [payment.id],
            )
          ).length
        )
          fail("An official receipt is already recorded.", 409);
        const number = text(data.official_number || "", 100);
        if (!number)
          fail("Enter the official receipt number issued by Treasury.");
        const [receipt] = await db(
          "INSERT INTO payment_receipts(payment_id,kind,official_number) VALUES(?,'OFFICIAL',?) RETURNING *",
          [payment.id, number],
        );
        await this.audit(
          db,
          actor,
          "receipt.issued",
          orderId,
          { official_number: number, payment_id: payment.id },
          correlation,
        );
        const [request] = await db(
          "SELECT r.* FROM service_requests r LEFT JOIN request_business_billing x ON x.request_id=r.id WHERE r.id=? OR x.selected_order_id=?",
          [order.request_id, orderId],
        );
        if (request) {
          await db(
            "INSERT INTO request_actions(request_id,actor_user_id,action,metadata) VALUES(?,?,'receipt.issued',?::jsonb)",
            [request.id, actor.id, JSON.stringify({ official_number: number })],
          );
          await this.notify(
            db,
            request,
            "Official receipt issued",
            `Treasury recorded official receipt ${number}.`,
          );
        }
        return receipt;
      },
    );
  },
};
