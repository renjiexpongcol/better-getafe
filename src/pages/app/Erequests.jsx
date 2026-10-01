import { Link } from "react-router-dom";
import AppPage from "./AppPage";
import {
  esApi,
  useEservice,
  Feedback,
  RequestTable,
} from "../../components/EserviceUI";
import { useState } from "react";
import { REQUEST_STATUSES } from "../../data/eserviceWorkflow";
export default function Erequests() {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("");
  const state = useEservice(
    () => esApi(`/requests?page=${page}&status=${status}`),
    [page, status],
  );
  return (
    <AppPage title="My e-service requests">
      <div className="es-workspace">
        <Link to="/app/services">Browse services</Link>
        <div className="es-toolbar">
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All requests</option>
              {REQUEST_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <Feedback error={state.error} loading={state.loading} />
        {state.data && (
          <>
            <RequestTable items={state.data.items} base="/app/e-requests" />
            <div className="es-toolbar">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>Page {page}</span>
              <button
                disabled={page * 20 >= state.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </AppPage>
  );
}
