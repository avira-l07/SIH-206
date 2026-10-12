import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register Emergency PWA Service Worker with secure context validation
function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    if (window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('🛡️ [PWA] Emergency Service Worker registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('⚠️ [PWA] Service Worker registration failed:', err);
        });
    } else {
      console.warn(
        '⚠️ [PWA] Service Worker requires secure context (HTTPS or localhost). Use HTTPS when testing on mobile phones.'
      );
    }
  }
}

if (document.readyState === 'complete') {
  registerServiceWorker();
} else {
  window.addEventListener('load', registerServiceWorker);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Optional typography must never block the emergency shell or its module scripts.
requestAnimationFrame(() => {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap';
  document.head.appendChild(fonts);
});

