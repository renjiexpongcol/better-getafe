import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import AppPage from "./AppPage";
import { billingStatus } from "../../data/businessBillingWorkflow";
import {
  esApi,
  useEservice,
  Feedback,
  label,
  money,
  date,
} from "../../components/EserviceUI";
export default function Ebilling() {
  const { kind = "all" } = useParams(),
    state = useEservice(
      () =>
        Promise.all([
          esApi("/billing/accounts"),
          esApi("/payment-orders"),
          esApi("/businesses"),
          esApi("/requests?business=true&limit=100"),
        ]).then(([accounts, orders, businesses, transactions]) => ({
          accounts: accounts.items,
          orders: orders.items,
          businesses: businesses.items,
          transactions: transactions.items,
        })),
      [kind],
    );
  const [statements, setStatements] = useState(null);
  const view = async (id) => {
    try {
      setStatements(await esApi(`/billing/accounts/${id}/statements`));
    } catch (e) {
      state.setError(e.message);
    }
  };
  return (
    <AppPage title="Billing and payment">
      <main className="es-workspace">
        <h1>
          {kind === "business"
            ? "My Business Transactions"
            : kind === "all"
              ? "My billing"
              : label(kind)}
        </h1>
        <nav className="es-toolbar">
          {["all", "business", "real_property", "water", "payment_order"].map(
            (type) => (
              <Link key={type} to={`/app/e-billing/${type}`}>
                {label(type)}
              </Link>
            ),
          )}
        </nav>
        <Feedback error={state.error} loading={state.loading} />
        {state.data && (
          <>
            {(kind === "business" || kind === "all") && (
              <section className="es-section">
                <h2>Business transactions</h2>
                <Link to="/app/services/business-billing">
                  Start a business transaction
                </Link>
                {state.data.transactions.length ? (
                  <div className="es-table-wrap">
                    <table className="es-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Business</th>
                          <th>Service</th>
                          <th>Amount</th>
                          <th>Submitted</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.data.transactions.map((t) => (
                          <tr key={t.id}>
                            <td>{t.request_number}</td>
                            <td>{t.business_name}</td>
                            <td>{t.service_name}</td>
                            <td>
                              {t.amount == null
                                ? "Awaiting assessment"
                                : money(t.amount)}
                            </td>
                            <td>{date(t.submitted_at)}</td>
                            <td>{billingStatus(t)}</td>
                            <td>
                              <Link to={`/app/e-requests/${t.id}`}>
                                Open transaction
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>No business transactions yet.</p>
                )}
              </section>
            )}
            <h2>Accounts</h2>
            {state.data.accounts
              .filter(
                (a) => kind === "all" || a.account_type.toLowerCase() === kind,
              )
              .map((account) => (
                <section className="es-section" key={account.id}>
                  <strong>
                    {label(account.account_type)} · {account.account_number}
                  </strong>
                  <p>{account.property_identifier}</p>
                  <button onClick={() => view(account.id)}>
                    View statements
                  </button>
                </section>
              ))}
            {!state.data.accounts.some(
              (a) => kind === "all" || a.account_type.toLowerCase() === kind,
            ) && (
              <p>
                {kind === "real_property"
                  ? "Online real property billing is not yet available for this account."
                  : kind === "water"
                    ? "Online water billing is not yet available for this account."
                    : "No billing accounts are linked to your profile."}
              </p>
            )}
            {statements && (
              <section>
                <h2>Statements</h2>
                {statements.items.map((statement) => (
                  <p key={statement.id}>
                    {statement.period} · {money(statement.total)} · Balance{" "}
                    {money(statement.balance)} · Due {date(statement.due_at)}
                  </p>
                ))}
              </section>
            )}
            {kind === "business" && (
              <>
                <h2>My businesses</h2>
                {state.data.businesses.map((b) => (
                  <p key={b.id}>
                    {b.business_name} · {label(b.status)}
                  </p>
                ))}
              </>
            )}
            <h2>Payment orders</h2>
            <ul className="es-links">
              {state.data.orders
                .filter(
                  (order) =>
                    kind === "all" ||
                    kind === "payment_order" ||
                    order.account_type?.toLowerCase() === kind,
                )
                .map((order) => (
                  <li key={order.id}>
                    <Link to={`/app/e-payment/${order.id}`}>
                      {order.order_number}
                    </Link>{" "}
                    · {money(order.amount)} · {label(order.status)}
                  </li>
                ))}
            </ul>
            {!state.data.orders.length && (
              <p>No payment orders have been issued.</p>
            )}
          </>
        )}
      </main>
    </AppPage>
  );
}
