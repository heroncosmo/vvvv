// Google Tag Manager integration
export const GTM_ID = 'GTM-5XXK4FSL';

// Initialize GTM dataLayer
export const initGTM = () => {
  if (typeof window === 'undefined') return;

  // Initialize dataLayer if it doesn't exist
  window.dataLayer = window.dataLayer || [];
  
  // Push GTM initialization
  window.dataLayer.push({
    'gtm.start': new Date().getTime(),
    event: 'gtm.js'
  });

  // Load GTM script
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  
  const firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode?.insertBefore(script, firstScript);
};

// Push custom events to GTM
export const pushGTMEvent = (event: string, data?: Record<string, any>) => {
  if (typeof window === 'undefined' || !window.dataLayer) return;
  
  window.dataLayer.push({
    event,
    ...data
  });
};

// Track page views
export const trackPageView = (url: string) => {
  pushGTMEvent('pageview', {
    page: url,
    timestamp: new Date().toISOString()
  });
};

// Extend Window interface to include dataLayer
declare global {
  interface Window {
    dataLayer: any[];
  }
}
