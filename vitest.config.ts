import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Testlauf getrennt von der Build-Konfiguration halten
export default defineConfig({
  // Für Prüfungen an Komponenten und Haken: ohne das Plugin scheitert schon
  // das Übersetzen von JSX in den Testdateien.
  plugins: [react()],
  test: {
    // `.tsx` mit aufnehmen — reine Logik liegt in `.ts`, alles mit Oberfläche
    // braucht JSX und damit die andere Endung.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Voreinstellung bleibt `node`: die vorhandenen Prüfungen sind reine
    // Rechnerei und laufen dort schneller. Wer ein Dokument braucht, setzt
    // `// @vitest-environment jsdom` in die erste Zeile seiner Datei.
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
  },
})
