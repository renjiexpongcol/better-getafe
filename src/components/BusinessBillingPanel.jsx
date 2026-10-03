import { useState } from "react";
import {
  esApi,
  useEservice,
  Feedback,
  OrderView,
  money,
  date,
} from "./EserviceUI";
import {
  PAYMENT_METHODS,
  billingStatus,
} from "../data/businessBillingWorkflow";

export default function BusinessBillingPanel({
  request,
  onRefresh,
  onApplication,
}) {
  const state = useEservice(
    () => esApi(`/requests/${request.id}/business-billing`),
    [request.id, request.version],
  );
  const [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [method, setMethod] = useState(""),
    [reference, setReference] = useState(""),
    [amount, setAmount] = useState("");
  const selected = state.data?.selected_order_id;
  const order = useEservice(
    () =>
      selected ? esApi(`/payment-orders/${selected}`) : Promise.resolve(null),
    [selected, request.version],
  );
  const pending = order.data?.attempts?.find((a) => a.status === "PENDING");
  const paid = order.data?.status === "PAID";
  const act = async (path, data) => {
    setBusy(true);
    state.setError("");
    try {
      await esApi(path, "POST", data, crypto.randomUUID());
      await state.refresh();
      await order.refresh();
      await onRefresh();
    } catch (error) {
      state.setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const business = state.data?.business;
  return (
    <section className="es-business-flow">
      <h2>Assessment and payment</h2>
      <Feedback error={state.error || order.error} loading={state.loading} />
      {business && (
        <>
          <h2>{business.business_name}</h2>
          <dl className="es-metadata">
            <div>
              <dt>Business account</dt>
              <dd>{business.business_reference}</dd>
            </div>
            <div>
              <dt>Registered owner</dt>
              <dd>{business.owner_name}</dd>
            </div>
            <div>
              <dt>Business type</dt>
              <dd>{business.ownership_type || "Not recorded"}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>
                {Object.values(business.address || {})
                  .filter((v) => typeof v === "string")
                  .join(", ") || "Not recorded"}
              </dd>
            </div>
          </dl>
        </>
      )}
      {!selected && (
        <section className="es-section">
          <h2>Outstanding billing</h2>
          {state.data?.orders.filter((o) =>
            ["UNPAID", "ISSUED", "PARTIALLY_PAID"].includes(o.status),
          ).length ? (
            <div className="es-table-wrap">
              <table className="es-table">
                <thead>
                  <tr>
                    <th>Assessment</th>
                    <th>Period</th>
                    <th>Due</th>
                    <th>Balance</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.orders
                    .filter((o) =>
                      ["UNPAID", "ISSUED", "PARTIALLY_PAID"].includes(o.status),
                    )
                    .map((o) => (
                      <tr key={o.id}>
                        <td>{o.order_number}</td>
                        <td>{o.period || "As assessed"}</td>
                        <td>{date(o.due_at || o.expires_at)}</td>
                        <td>{money(o.balance)}</td>
                        <td>
                          <button
                            disabled={busy || request.status !== "SUBMITTED"}
                            onClick={() =>
                              act(`/requests/${request.id}/select-assessment`, {
                                version: request.version,
                                order_id: o.id,
                              })
                            }
                          >
                            Review assessment
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No payable assessment is currently available.</p>
          )}
          {request.status === "DRAFT" ? (
            <>
              <p>
                Confirm your transaction details and any required documents to
                retrieve or request an assessment.
              </p>
              <button onClick={onApplication}>
                Request assessment / continue
              </button>
            </>
          ) : (
            <p>
              {billingStatus(request)}. The municipal office will prepare your
              assessment here. You can return to this transaction at any time.
            </p>
          )}
        </section>
      )}
      {order.data && (
        <>
          {paid && (
            <section className="es-section" role="status">
              <h2>Payment successful</h2>
              <p>
                {request.request_number} · {business?.business_name} ·{" "}
                {order.data.order_number}
              </p>
              <p>
                {request.status === "COMPLETED"
                  ? "Transaction completed."
                  : "Payment verified. Treasury will issue your official receipt before completion."}
              </p>
              <button className="es-secondary" onClick={() => window.print()}>
                Print confirmation
              </button>
            </section>
          )}
          <OrderView order={order.data} />
          {!paid && !state.data.reviewed && (
            <section className="es-section">
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm that I have reviewed the assessment.
              </label>
              <button
                disabled={
                  !confirmed || busy || request.status !== "AWAITING_PAYMENT"
                }
                onClick={() =>
                  act(`/requests/${request.id}/review-assessment`, {
                    order_id: selected,
                    confirmed: true,
                  })
                }
              >
                Continue to payment
              </button>
            </section>
          )}
          {!paid && state.data.reviewed && (
            <section className="es-section">
              <h2>Payment</h2>
              <p>{state.data.payment_instructions}</p>
              {state.data.payment_provider && !pending && (
                <>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const result = await esApi(
                          `/payment-orders/${selected}/checkout`,
                          "POST",
                          {},
                          crypto.randomUUID(),
                        );
                        if (result.url) window.location.assign(result.url);
                        else {
                          await order.refresh();
                          await onRefresh();
                        }
                      } catch (error) {
                        state.setError(error.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {order.data.gateway_pending
                      ? "Resume online payment"
                      : "Pay online"}
                  </button>
                  <p>
                    Payment is confirmed after the provider verifies the
                    transaction.
                  </p>
                </>
              )}
              {order.data.gateway_pending ? (
                <p role="status">
                  Online payment pending. Refresh after payment to check
                  verification.
                </p>
              ) : pending ? (
                <p role="status">
                  <strong>Pending payment verification</strong> ·{" "}
                  {pending.reference}. Treasury is checking your{" "}
                  {money(pending.amount)} payment. You do not need to submit it
                  again.
                </p>
              ) : (
                <form
                  className="es-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(`/payment-orders/${selected}/payment-submissions`, {
                      method,
                      reference,
                      amount,
                    });
                  }}
                >
                  <label htmlFor="business-payment-method">
                    Payment method
                  </label>
                  <select
                    id="business-payment-method"
                    required
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="">Choose a payment method</option>
                    {state.data.payment_methods.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHODS[m]}
                      </option>
                    ))}
                  </select>
                  <label>
                    Amount paid
                    <input
                      required
                      inputMode="decimal"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Bank, wallet or cashier reference
                    <input
                      required
                      maxLength={200}
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </label>
                  <p>
                    Submit these details after paying through the selected
                    method. Your balance changes only after verification.
                  </p>
                  <button disabled={busy || !state.data.payment_methods.length}>
                    Submit for verification
                  </button>
                </form>
              )}
            </section>
          )}
        </>
      )}
      <button
        className="es-secondary"
        disabled={busy}
        onClick={async () => {
          await state.refresh();
          await order.refresh();
          await onRefresh();
        }}
      >
        Refresh transaction
      </button>
      {!!request.billing_actions?.length && (
        <section className="es-section">
          <h2>Payment activity</h2>
          <ol className="es-timeline">
            {request.billing_actions.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.action === "receipt.issued"
                    ? "Official receipt issued"
                    : "Payment submitted"}
                </strong>
                <p>
                  {event.metadata.official_number || event.metadata.reference}
                </p>
                <time>{date(event.created_at)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
