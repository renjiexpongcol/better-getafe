import { usePublicConfig } from '../context/PublicConfig'
export default function AuthBranding() {
  const settings = usePublicConfig()
  const name = settings['general.company'] || settings['general.name'] || 'Municipal portal'
  return <header className="auth-branding">
    <img src={settings['general.logo'] || '/assets/getafe-seal.png'} alt={name} width="48" height="48" />
    <div className="auth-branding-name">{name}</div>
    {settings['general.locationLabel'] && <div className="auth-branding-location">{settings['general.locationLabel']}</div>}
  </header>
}
