import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { routeTitles } from '../routes';
import { usePublicConfig } from '../context/PublicConfig';

export default function PageTitleManager() {
  const { pathname } = useLocation();
  const settings = usePublicConfig();

  useEffect(() => {
    // Error views own their title because resource errors can occur on valid
    // routes that otherwise have a different page title.
    if (document.querySelector('.route-status-page h1')) return;
    const dynamicTitle = Object.entries(routeTitles).find(([pattern]) => pattern.includes(':') && matchPath({ path: pattern, end: true }, pathname))?.[1];
    document.title = `${settings['general.name'] || 'Getafe'} | ${routeTitles[pathname] || dynamicTitle || 'Page not found'}`;
  }, [pathname, settings['general.name']]);

  useEffect(() => {
    // We map '/' to 'home' and others directly to their path without slash
    const sectionId = pathname === '/' ? 'home' : pathname.substring(1);
    const element = document.getElementById(sectionId);

    if (element) {
      // Delay slightly to ensure component has fully mounted
      const scrollTimer = setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return () => clearTimeout(scrollTimer);
    } else if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pathname]);

  return null;
}
