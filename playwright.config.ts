import { defineConfig, devices } from '@playwright/test'

/**
 * Rauchprobe der gebauten App.
 *
 * Getestet wird gegen `vite preview`, nicht gegen den Entwicklungsserver: was
 * hier durchfällt, wäre auch auf GitHub Pages kaputt — Hot-Reload und
 * ungebündelte Module verdecken sonst Fehler, die erst im Bündel auftreten
 * (falsche `base`, fehlende dynamische Teile, Service Worker).
 *
 * Alle fremden Adressen werden in `tests/e2e/mocks.ts` abgefangen. Ohne das
 * hinge die Prüfung an Transitous, nextbike und Open-Meteo — ein Ausfall dort
 * wäre ein roter Lauf hier, und die Fahrpläne ändern sich ohnehin täglich.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
