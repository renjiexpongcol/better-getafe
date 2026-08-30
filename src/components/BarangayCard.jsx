export default function BarangayCard({ barangay, onClick }) {
  return (
    <article 
      className="barangay-card" 
      onClick={() => onClick(barangay)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(barangay);
        }
      }}
      aria-label={`View details for Barangay ${barangay.name}`}
    >
      <div className="barangay-card-main">
        <h3>{barangay.name}</h3>
        <p className="barangay-captain">
          <span>Punong Barangay</span>
          <strong>{barangay.captain}</strong>
        </p>
      </div>
      <div className="card-indicator">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14"></path>
          <path d="m12 5 7 7-7 7"></path>
        </svg>
      </div>
    </article>
  );
}
