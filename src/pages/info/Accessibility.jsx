import { Link } from 'react-router-dom';

export default function Accessibility() {
  return (
    <main id="accessibility">
      <div className="page-header">
        <div className="container page-header-inner">
          <div>
            <p className="history-kicker">Legal &amp; Policies</p>
            <h1 className="page-title">Accessibility Statement</h1>
            <p className="page-subtitle">Municipality of Getafe, Bohol — committed to digital accessibility for everyone.</p>
          </div>
        </div>
      </div>

      <div className="content-page container">
        <p className="legal-intro">
          The Municipality of Getafe is committed to ensuring digital accessibility for people with disabilities.
          We are continually improving the user experience for everyone and applying the relevant accessibility
          standards to guarantee we provide equal access to all of our citizens.
        </p>

        <section className="legal-section">
          <h2>Measures to support accessibility</h2>
          <p>The Municipality of Getafe takes the following measures to ensure accessibility of the Official Web Portal:</p>
          <ul>
            <li>Include accessibility throughout our internal policies.</li>
            <li>Integrate accessibility into our procurement practices.</li>
            <li>Provide continual accessibility training for our staff.</li>
            <li>Assign clear accessibility goals and responsibilities.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>Conformance status</h2>
          <p>
            The Web Content Accessibility Guidelines (WCAG) defines requirements for designers and developers to
            improve accessibility for people with disabilities. It defines three levels of conformance: Level A,
            Level AA, and Level AAA. The Municipality of Getafe Official Web Portal is{' '}
            <strong>partially conformant with WCAG 2.1 level AA</strong>. Partially conformant means that some parts
            of the content do not fully conform to the accessibility standard.
          </p>
        </section>

        <section className="legal-section">
          <h2>Feedback</h2>
          <p>
            We welcome your feedback on the accessibility of the Municipality of Getafe Web Portal. Please let us
            know if you encounter accessibility barriers:
          </p>
          <ul>
            <li>E-mail: <a href="mailto:lgugetafe@yahoo.com">lgugetafe@yahoo.com</a></li>
            <li>Visitor Address: Municipal Hall, Poblacion, Getafe, Bohol</li>
          </ul>
          <p>We try to respond to feedback within 2 business days.</p>
        </section>

        <p className="history-back">
          <Link to="/">Back to Home</Link>
        </p>
      </div>
    </main>
  );
}
