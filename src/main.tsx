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
import { lueckeBeobachten } from './luecke'

if ('serviceWorker' in navigator) {
  /**
   * Ein neuer Service Worker übernimmt zwar sofort (skipWaiting + claim), die
   * bereits geladene Seite läuft aber weiter mit dem alten JavaScript. Auf dem
   * Telefon blieb dadurch nach einem Deployment der alte Stand stehen, bis man
   * von Hand mit geleertem Puffer neu lud.
   *
   * `controllerchange` feuert genau dann, wenn der neue Worker das Ruder
   * übernimmt — dann einmal neu laden. Das Flag verhindert eine Schleife, und
   * beim allerersten Start (vorher gab es gar keinen Controller) wird nicht
   * geladen, denn da ist der Stand ohnehin frisch.
   */
  let neuGeladen = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen || !navigator.serviceWorker.controller) return
    neuGeladen = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    // Absolut '/sw.js' zeigte auf die Domainwurzel — unter /radl-nav/ war das
    // eine 404, der Worker war nie registriert. BASE_URL trifft beide Fälle
    // (GitHub Pages im Unterordner und die Capacitor-WebView).
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(reg => {
        // Beim Start und beim Zurückkehren zur App nach einer Aktualisierung
        // sehen — sonst merkt eine dauerhaft geöffnete PWA ein Deployment nie.
        reg.update().catch(() => {})
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch(() => {})
  })
}

lueckeBeobachten()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
