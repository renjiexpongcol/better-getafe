import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import AppPage from "./AppPage";
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
        ]).then(([accounts, orders, businesses]) => ({
          accounts: accounts.items,
          orders: orders.items,
          businesses: businesses.items,
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
        <h1>{kind === "all" ? "My billing" : label(kind)}</h1>
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
