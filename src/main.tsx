import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// maplibre-gl.css wandert mit der Karte in den nachgeladenen Teil (MapView,
// BikeMap, MapPicker) — der Startbildschirm braucht sie nicht.
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Absolut '/sw.js' zeigte auf die Domainwurzel — unter /radl-nav/ war das
    // eine 404, der Worker war nie registriert. BASE_URL trifft beide Fälle
    // (GitHub Pages im Unterordner und die Capacitor-WebView).
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
