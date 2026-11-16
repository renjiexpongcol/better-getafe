import './StartupScreen.css'

export default function StartupScreen({ setup = false }) {
  return <main className="configuration-loader" aria-busy="true" aria-labelledby="startup-title">
    <section className="configuration-loader-card">
      <img className="configuration-loader-seal" src="/assets/getafe-seal.png" alt="Municipality of Getafe" width="64" height="64"/>
      <h1 id="startup-title">{setup ? 'Preparing your account' : 'Loading your page'}</h1>
      <p role="status" aria-live="polite">{setup ? 'Your account setup will be ready shortly.' : 'Please wait while we get things ready.'}</p>
      <span className="page-loader-spinner" aria-hidden="true"/>
    </section>
  </main>
}
