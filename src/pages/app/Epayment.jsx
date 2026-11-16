import { useParams, Link } from "react-router-dom";
import AppPage from "./AppPage";
import {
  esApi,
  useEservice,
  Feedback,
  OrderView,
} from "../../components/EserviceUI";
export default function Epayment() {
  const { id } = useParams(),
    state = useEservice((signal) => esApi(`/payment-orders/${id}`, "GET", undefined, undefined, {signal}), [id]);
  return (
    <AppPage title="Payment order">
      <section className="es-workspace">
        <Link to="/app/e-billing/all">My payments</Link>
        <Feedback loading={state.loading} error={state.error} />
        {state.data && <OrderView order={state.data} />}
      </section>
    </AppPage>
  );
}
