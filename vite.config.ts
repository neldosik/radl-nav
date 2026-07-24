import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relativer Pfad './' für Capacitor WebView & lokale Builds
  base: './',
  plugins: [react()],
})
