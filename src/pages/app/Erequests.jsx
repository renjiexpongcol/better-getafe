import { statusPresentation } from '../../services/statusPresentation';
import RecordNavigation from '../../components/RecordNavigation';
import { Field, Pagination } from '../../components/ui/Primitives';
import { Link } from "react-router-dom";
import AppPage from "./AppPage";
import {
  esApi,
  useEservice,
  Feedback,
  RequestTable,
} from "../../components/EserviceUI";
import { useState } from "react";
import { PUBLIC_STATUS } from "../../data/serviceApplication";
export default function Erequests() {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("");
  const state = useEservice(
    (signal) => esApi(`/requests?page=${page}&status=${status}`, "GET", undefined, undefined, {signal}),
    [page, status],
  );
  return (
    <AppPage title="Your service requests">
      <div className="es-workspace"><RecordNavigation/>
        <Link to="/app/services">Browse services</Link>
        <div className="es-toolbar">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All requests</option>
              {Object.keys(PUBLIC_STATUS).map(value => (
                <option key={value} value={value}>{({ IN_REVIEW: 'Under review', FOR_ASSESSMENT: 'Fees being assessed', FOR_APPROVAL: 'Awaiting approval' })[value] || statusPresentation(value).label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Feedback error={state.error} loading={state.loading} />
        {state.data && (
          <>
            <RequestTable items={state.data.items} base="/app/e-requests" />
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(state.data.total / 20))} onChange={setPage}/>
          </>
        )}
      </div>
    </AppPage>
  );
}
