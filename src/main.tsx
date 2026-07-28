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
import { vollbildBeobachten } from './luecke'
import { istNativ } from './geolocation'

/**
 * In der Android-Hülle darf kein Service Worker laufen.
 *
 * Capacitor reicht die Seite über einen eigenen lokalen Server aus und setzt
 * dabei die Brücke zur Hülle in das HTML ein — daher kommt `window.Capacitor`
 * und damit jedes Plugin. Ein Service Worker legt sich vor genau diese
 * Auslieferung: ab dem zweiten Start beantwortet er den Seitenaufruf aus
 * seinem Puffer, und in dieser gepufferten Fassung fehlt die eingesetzte
 * Brücke.
 *
 * Die Folge sah aus wie ein Rechteproblem: `istNativ()` meldete falsch, die
 * App nahm den Browserweg, das Ortungs-Plugin wurde nie angesprochen und es
 * erschien auch kein Dialog — obwohl die Berechtigung am Gerät längst erteilt
 * war. Nutzen bringt der Puffer hier ohnehin keinen, die Dateien liegen im
 * APK.
 *
 * Ein früher registrierter Worker überlebt die Aktualisierung der App,
 * deshalb wird er hier auch aktiv abgemeldet und sein Puffer geleert.
 *
 * Und zwar ohne `istNativ()` zu fragen. Der erste Anlauf hing genau daran:
 * die Abmeldung sollte nur in der Hülle laufen, erkannt an `window.Capacitor`
 * — das ist aber gerade das, was fehlt, solange der Worker die Seite ohne
 * Brücke ausliefert. Die Bedingung war damit nie erfüllt, der Worker blieb
 * liegen und lieferte weiter aus. Erkannt wird die Hülle deshalb an ihrer
 * Herkunft, die auch ohne Brücke stimmt: `https://localhost` ohne Port
 * (androidScheme in capacitor.config.ts) oder `capacitor:`.
 *
 * Nach dem Abmelden einmal neu laden — erst dieser Aufruf geht wieder an den
 * lokalen Server der Hülle und bekommt die Brücke eingesetzt. Ohne das müsste
 * man die App von Hand neu starten. Die Marke in der Sitzung verhindert eine
 * Schleife, falls das Abmelden nicht greift.
 */

/** Hülle auch dann erkennen, wenn die Brücke fehlt. */
function inHuelle(): boolean {
  if (istNativ()) return true
  const { protocol, hostname, port } = window.location
  if (protocol === 'capacitor:') return true
  return protocol === 'https:' && hostname === 'localhost' && port === ''
}

if (inHuelle() && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then(async regs => {
      if (!regs.length) return
      await Promise.all(regs.map(r => r.unregister()))
      const namen = (await caches?.keys()) ?? []
      await Promise.all(namen.map(n => caches.delete(n)))
      if (sessionStorage.getItem('huelle-entpuffert')) return
      sessionStorage.setItem('huelle-entpuffert', '1')
      window.location.reload()
    })
    .catch(() => {})
} else if ('serviceWorker' in navigator) {
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

vollbildBeobachten()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
