import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  // Relativer Pfad './' für Capacitor WebView & lokale Builds
  base: './',
  plugins: [react()],
  define: {
    __STAND__: JSON.stringify(stand()),
    __GEBAUT__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
})
