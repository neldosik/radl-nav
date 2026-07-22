import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages сервит из /radl-nav/
  base: '/radl-nav/',
  plugins: [react()],
})
