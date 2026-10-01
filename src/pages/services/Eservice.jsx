import { Link, useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  esApi,
  useEservice,
  Feedback,
  money,
} from "../../components/EserviceUI";

export default function Eservice() {
  const { slug } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate();
  const state = useEservice(() => esApi(`/services/${slug}`), [slug]);
  const businesses = useEservice(
    () =>
      user?.role === "resident"
        ? esApi("/businesses")
        : Promise.resolve({ items: [] }),
    [user?.id],
  );
  const [businessId, setBusinessId] = useState(""),
    [busy, setBusy] = useState(false);
  const service = state.data;
  const catalog = useEservice(() => esApi("/services"), []);
  const start = async () => {
    if (!user) {
      navigate(
        `/auth/login?returnUrl=${encodeURIComponent(`/services/e-services/${slug}`)}`,
      );
      return;
    }
    setBusy(true);
    try {
      const request = await esApi(
        "/requests",
        "POST",
        {
          service_id: service.id,
          ...(businessId ? { business_id: businessId } : {}),
        },
        crypto.randomUUID(),
      );
      navigate(`/app/e-requests/${request.id}`);
    } catch (e) {
      state.setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="es-workspace">
      <Link to="/services">Municipal services</Link>
      <h1>{service?.name || "E-Services"}</h1>
      <Feedback error={state.error} loading={state.loading} />
      {service && (
        <>
          {service.hero_url && (
            <img
              src={service.hero_url}
              alt={service.name}
              style={{ width: "100%", maxHeight: 280, objectFit: "cover" }}
            />
          )}
          <p>{service.short_description}</p>
          <section className="es-section">
            <p style={{ whiteSpace: "pre-line" }}>{service.description}</p>
            {service.eligibility && (
              <>
                <h2>Who may apply</h2>
                <p>{service.eligibility}</p>
              </>
            )}
            {service.processing_time && (
              <p>Processing time: {service.processing_time}</p>
            )}
            <h2>Requirements</h2>
            {service.requirements.length ? (
              <ul>
                {service.requirements.map((r) => (
                  <li key={r.id}>
                    {r.label}
                    {r.required ? " (required)" : ""} {r.help_text}
                  </li>
                ))}
              </ul>
            ) : (
              <p>The office has not listed document requirements.</p>
            )}
            {service.instructions && (
              <>
                <h2>Instructions</h2>
                <p style={{ whiteSpace: "pre-line" }}>{service.instructions}</p>
              </>
            )}
            {service.fees.length > 0 && (
              <>
                <h2>Configured fees</h2>
                <ul>
                  {service.fees.map((f) => (
                    <li key={f.id}>
                      {f.description}: {money(f.amount)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          {["APPLICATION", "BUSINESS_NEW", "BUSINESS_RENEWAL"].includes(
            service.kind,
          ) ? (
            <section className="es-section">
              {service.kind === "BUSINESS_RENEWAL" && user && (
                <label>
                  Select your existing business
                  <select
                    value={businessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                  >
                    <option value="">Choose a business…</option>
                    {businesses.data?.items.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.business_name}
                      </option>
                    ))}
                  </select>
                  <Feedback error={businesses.error} />
                </label>
              )}
              {service.online_available ? (
                <button
                  disabled={
                    busy ||
                    (user && service.kind === "BUSINESS_RENEWAL" && !businessId)
                  }
                  onClick={start}
                >
                  {user ? "Start application" : "Sign in to apply"}
                </button>
              ) : (
                <p>Online applications are currently unavailable.</p>
              )}
            </section>
          ) : service.kind === "DIRECTORY" ? (
            <ul className="es-links">
              {catalog.data?.items
                .filter((item) =>
                  ["BUSINESS_NEW", "BUSINESS_RENEWAL", "BUSINESS"].includes(
                    item.kind,
                  ),
                )
                .map((item) => (
                  <li key={item.id}>
                    <Link to={`/services/e-services/${item.slug}`}>
                      {item.name}
                    </Link>
                    <p>{item.short_description}</p>
                  </li>
                ))}
            </ul>
          ) : (
            <Link
              className="es-button"
              to={`/app/e-billing/${service.kind.toLowerCase()}`}
            >
              View my billing and payment orders
            </Link>
          )}
          {(service.contact?.email || service.contact?.phone) && (
            <section className="es-section">
              <h2>Contact the office</h2>
              {service.contact.email && (
                <p>
                  <a href={`mailto:${service.contact.email}`}>
                    {service.contact.email}
                  </a>
                </p>
              )}
              {service.contact.phone && <p>{service.contact.phone}</p>}
            </section>
          )}
        </>
      )}
    </main>
  );
}
