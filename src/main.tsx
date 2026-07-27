import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// maplibre-gl.css bleibt bewusst hier und wandert NICHT in den nachgeladenen
// Kartenteil. Dort landet sie sonst nach index.css im Kaskadenverlauf, und
// `.maplibregl-map { position: relative }` schlägt `.picker-canvas
// { position: absolute; inset: 0 }` — die Karte fällt auf Höhe 0 zusammen.
// Der eigentliche Gewinn liegt ohnehin beim JavaScript (maplibre-gl ~1 MB);
// diese Datei sind 10 kB gzip.
import 'maplibre-gl/dist/maplibre-gl.css'
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
