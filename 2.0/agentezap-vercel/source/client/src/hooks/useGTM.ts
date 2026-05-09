import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { initGTM, trackPageView } from '@/lib/gtm';

export function useGTM() {
  const [location] = useLocation();

  // Initialize GTM on mount
  useEffect(() => {
    initGTM();
  }, []);

  // Track page views on route change
  useEffect(() => {
    trackPageView(location);
  }, [location]);
}
