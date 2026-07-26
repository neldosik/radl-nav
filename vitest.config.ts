import { defineConfig } from 'vite'

// Testlauf getrennt von der Build-Konfiguration halten
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
