import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Register Emergency PWA Service Worker with secure context validation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
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
        '⚠️ [PWA] Service Worker requires secure context (HTTPS or localhost). On mobile phones over LAN IP, enable chrome://flags/#unsafely-treat-insecure-origin-as-secure to test offline PWA boot.'
      );
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

