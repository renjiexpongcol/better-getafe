import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { routeTitles } from '../routes';
import { usePublicConfig } from '../context/PublicConfig';

export default function PageTitleManager() {
  const { pathname } = useLocation();
  const settings = usePublicConfig();

  useEffect(() => {
    document.title = `${settings['general.name'] || 'Getafe'} | ${routeTitles[pathname] || "Official Portal"}`;
    
    // We map '/' to 'home' and others directly to their path without slash
    const sectionId = pathname === '/' ? 'home' : pathname.substring(1);
    const element = document.getElementById(sectionId);
    
    if (element) {
      // Delay slightly to ensure component has fully mounted
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    } else if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pathname, settings]);

  return null;
}
