import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Damit sich auf einem fremden Gerät feststellen lässt, welcher Stand dort
// wirklich läuft — ohne das ist „bei mir hat sich nichts geändert" nicht von
// „die neue Fassung ist noch gar nicht angekommen" zu unterscheiden.
function stand(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unbekannt'
  }
}

/**
 * Liste aller gebauten Dateien für den Service Worker.
 *
 * Der Worker las die vorzupuffernden Dateien bisher aus dem HTML. Dort stehen
 * aber nur der Einstieg und seine Geschwister — die nachgeladenen Teile nicht,
 * allen voran der Kartenbrocken mit rund 1 MB. Der landete deshalb erst im
 * Puffer, wenn ihn jemand angefordert hatte. Nach jedem Deployment hat er
 * einen neuen Namen, der alte im Puffer ist wertlos: wer zuhause aktualisierte
 * und unterwegs ohne Netz auf „Räder" tippte, bekam statt der Karte einen
 * Hinweis. Genau der Fall, für den die Offline-Vorsorge gebaut wurde.
 *
 * Jetzt schreibt der Build die Namen selbst auf, und der Worker liest sie.
 */
function precacheManifest(): Plugin {
  return {
    name: 'precache-manifest',
    generateBundle(_options, bundle) {
      const dateien = Object.keys(bundle)
        .filter(n => /\.(js|css|woff2?)$/.test(n))
        .sort()
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify(dateien),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relativer Pfad './' für Capacitor WebView & lokale Builds
  base: './',
  plugins: [react(), precacheManifest()],
  define: {
    __STAND__: JSON.stringify(stand()),
    __GEBAUT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
})
