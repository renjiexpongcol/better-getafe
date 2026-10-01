import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import AppPage from "./AppPage";
import {
  esApi,
  useEservice,
  Feedback,
  DynamicFields,
  Activity,
  label,
  date,
  money,
  uploadDocument,
} from "../../components/EserviceUI";
export default function Erequest() {
  const { id } = useParams(),
    state = useEservice(() => esApi(`/requests/${id}`), [id]);
  const [values, setValues] = useState({}),
    [busy, setBusy] = useState(false),
    [declaration, setDeclaration] = useState(false),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("Application");
  const request = state.data,
    editable =
      request && ["DRAFT", "NEEDS_INFORMATION"].includes(request.status);
  useEffect(() => {
    if (request) setValues(request.values);
  }, [request]);
  const save = async (final = false) => {
    setBusy(true);
    state.setError("");
    setNotice("");
    try {
      const saved = await esApi(`/requests/${id}/draft`, "PATCH", {
        version: request.version,
        values,
      });
      if (final)
        await esApi(
          `/requests/${id}/${request.status === "DRAFT" ? "submit" : "respond"}`,
          "POST",
          { version: saved.version, declaration },
          crypto.randomUUID(),
        );
      await state.refresh();
      setNotice(
        final ? "Your application has been submitted." : "Draft saved.",
      );
    } catch (e) {
      state.setError(`${e.message} Your last saved draft is preserved.`);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (requirement, file, current) => {
    if (!file) return;
    setBusy(true);
    state.setError("");
    try {
      const saved = await esApi(`/requests/${id}/draft`, "PATCH", {
        version: request.version,
        values,
      });
      await uploadDocument(saved, requirement, file, current?.id);
      await state.refresh();
      setNotice("Document uploaded.");
    } catch (e) {
      state.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppPage title={request?.service?.name || "Application"}>
      <main className="es-workspace">
        <Link to="/app/e-requests">My requests</Link>
        <Feedback error={state.error} notice={notice} loading={state.loading} />
        {request && (
          <>
            <h1>{request.request_number}</h1>
            <dl className="es-metadata">
              <div>
                <dt>Status</dt>
                <dd>{label(request.status)}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{date(request.submitted_at)}</dd>
              </div>
              {request.due_at && (
                <div>
                  <dt>Corrections due</dt>
                  <dd>{date(request.due_at)}</dd>
                </div>
              )}
            </dl>
            <nav className="es-tabs" aria-label="Application sections">
              {[
                "Application",
                "Documents",
                "Payment",
                "Messages",
                "Activity",
              ].map((name) => (
                <button
                  className="es-secondary"
                  key={name}
                  aria-selected={tab === name}
                  onClick={() => setTab(name)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {tab === "Application" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save(true);
                }}
              >
                <DynamicFields
                  fields={request.fields}
                  values={values}
                  setValues={setValues}
                  disabled={!editable || busy}
                />
                {editable && (
                  <section className="es-section">
                    <label>
                      <input
                        type="checkbox"
                        checked={declaration}
                        onChange={(e) => setDeclaration(e.target.checked)}
                      />
                      {request.definition.declaration}
                    </label>
                    <div className="es-toolbar">
                      <button
                        type="button"
                        className="es-secondary"
                        disabled={busy}
                        onClick={() => save()}
                      >
                        Save draft
                      </button>
                      <button disabled={busy || !declaration}>
                        {request.status === "DRAFT"
                          ? "Submit application"
                          : "Submit corrections"}
                      </button>
                    </div>
                  </section>
                )}
              </form>
            )}
            {tab === "Documents" && (
              <section>
                {request.requirements.map((requirement) => {
                  const documents = request.documents.filter(
                      (d) => d.requirement_id === requirement.id,
                    ),
                    current = documents.find(
                      (d) => !documents.some((n) => n.replaces_id === d.id),
                    );
                  return (
                    <section className="es-section" key={requirement.id}>
                      <h2>
                        {requirement.label}
                        {requirement.required ? " *" : ""}
                      </h2>
                      <p>{requirement.help_text}</p>
                      {documents.map((d) => (
                        <p key={d.id}>
                          <a
                            href={`/api/requests/${id}/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {d.original_filename}
                          </a>{" "}
                          · {label(d.status)} · {date(d.uploaded_at)}
                          {d.review_reason && <span> · {d.review_reason}</span>}
                        </p>
                      ))}
                      {editable && (
                        <label>
                          {current ? "Replace document" : "Upload document"}
                          <input
                            type="file"
                            accept="application/pdf,image/png,image/jpeg"
                            disabled={busy}
                            onChange={(e) => {
                              upload(requirement, e.target.files[0], current);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </section>
                  );
                })}
                {!request.requirements.length && (
                  <p>No attachments are required.</p>
                )}
              </section>
            )}
            {tab === "Payment" && (
              <section>
                {request.orders.length ? (
                  request.orders.map((order) => (
                    <p key={order.id}>
                      <Link to={`/app/e-payment/${order.id}`}>
                        {order.order_number}
                      </Link>{" "}
                      · {money(order.amount)} · {label(order.status)}
                    </p>
                  ))
                ) : (
                  <p>No assessment has been issued.</p>
                )}
              </section>
            )}
            {tab === "Messages" && (
              <section>
                {request.notes.length ? (
                  request.notes.map((note) => (
                    <section className="es-section" key={note.id}>
                      <time>{date(note.created_at)}</time>
                      <p>{note.message}</p>
                    </section>
                  ))
                ) : (
                  <p>No messages yet.</p>
                )}
              </section>
            )}
            {tab === "Activity" && <Activity history={request.history} />}
          </>
        )}
      </main>
    </AppPage>
  );
}
