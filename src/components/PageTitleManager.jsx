import { useEffect, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { routeTitles } from '../routes';
import { usePublicConfig } from '../context/PublicConfig';

export default function PageTitleManager() {
  const { pathname } = useLocation();
  const settings = usePublicConfig();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const privatePage = /^\/(auth|app|admin)(\/|$)/.test(pathname);
    const setMeta = (attribute, key, value) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = value;
    };
    setMeta('name', 'robots', privatePage ? 'noindex, nofollow' : 'index, follow');
    if (pathname !== '/') return undefined;
    document.head.querySelectorAll('[data-homepage-metadata]').forEach(element => element.remove());
    let origin = window.location.origin;
    try { const configured = new URL(settings['general.url']); if (['https:', 'http:'].includes(configured.protocol) && !configured.username && !configured.password) origin = configured.origin; } catch { /* Use the current public origin. */ }
    const title = `${settings['general.company'] || settings['general.name'] || 'Municipal portal'} | Services & Information`;
    const description = 'Find Getafe municipal services, requirements, office contacts, public advisories, news, and upcoming events.';
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:url', origin + '/');
    setMeta('property', 'og:image', origin + '/assets/Getafe_Bohol_1.jpg');
    setMeta('name', 'twitter:card', 'summary_large_image');
    const canonical = document.createElement('link'); canonical.rel = 'canonical'; canonical.href = origin + '/'; document.head.appendChild(canonical);
    const structured = document.createElement('script'); structured.type = 'application/ld+json';
    structured.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'GovernmentOrganization', name: settings['general.company'] || settings['general.name'], url: origin + '/', telephone: settings['contact.phone'] || undefined, email: settings['contact.email'] || settings['general.supportEmail'] || undefined, address: { '@type': 'PostalAddress', streetAddress: settings['contact.address'] || undefined,  } });
    document.head.appendChild(structured);
    return () => { canonical.remove(); structured.remove(); document.head.querySelectorAll('meta[property^="og:"],meta[name="twitter:card"]').forEach(element => element.remove()); };
  }, [pathname, settings]);

  useEffect(() => {
    // Error views own their title because resource errors can occur on valid
    // routes that otherwise have a different page title.
    if (document.querySelector('.route-status-page h1')) return;
    const dynamicTitle = Object.entries(routeTitles).find(([pattern]) => pattern.includes(':') && matchPath({ path: pattern, end: true }, pathname))?.[1];
    const title = routeTitles[pathname] || dynamicTitle || 'Page not found';
    document.title = pathname === '/' ? `${settings['general.company'] || settings['general.name'] || 'Municipal portal'} | Services & Information` : `${settings['general.name'] || 'Getafe'} | ${title}`;
    setAnnouncement(title);
  }, [pathname, settings['general.name']]);

  return <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>;
}
