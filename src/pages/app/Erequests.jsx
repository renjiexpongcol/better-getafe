import { statusPresentation } from '../../services/statusPresentation';
import RecordNavigation from '../../components/RecordNavigation';
import { Button, EmptyState, Field, Pagination, StatusBadge } from '../../components/ui/Primitives';
import { Link } from "react-router-dom";
import AppPage from "./AppPage";
import {
  esApi,
  useEservice,
  Feedback,
  date,
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
    <AppPage title="Your service requests" actions={<Button to="/app/services">Browse services</Button>}>
      <div className="es-workspace"><RecordNavigation/>
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
          {state.data && <span role="status">{state.data.total} {state.data.total === 1 ? 'request' : 'requests'}</span>}
        </div>
        <Feedback error={state.error} loading={state.loading} />
        {state.data && (
          <>
            {state.data.items.length ? <ul className="es-resident-requests">
              {state.data.items.map(request => <li key={request.id}>
                <div><small>{request.request_number}</small><h2>{request.service_name}</h2>
                  {request.business_name && <p>{request.business_name}</p>}
                  {request.submitted_at && <p>Submitted {date(request.submitted_at)}</p>}
                </div>
                <div className="es-request-actions"><StatusBadge value={request.status} audience="resident"/>
                  <Link to={`/app/e-requests/${request.id}`}>{({ DRAFT: 'Continue draft', NEEDS_INFORMATION: 'Review requested information', AWAITING_PAYMENT: 'Review payment details' })[request.status] || 'View request'}</Link>
                </div>
              </li>)}
            </ul> : <EmptyState title={status ? 'No requests with this status' : 'No service requests yet'} action={status ? <Button variant="outline" onClick={() => {setStatus(''); setPage(1)}}>Show all requests</Button> : <Button to="/app/services">Find a service</Button>}/>}
            {state.data.total > 20 && <Pagination page={page} totalPages={Math.ceil(state.data.total / 20)} onChange={setPage}/>}
          </>
        )}
      </div>
    </AppPage>
  );
}
