import { defineConfig } from 'vite'

/**
 * Eigene Konfiguration für die Vertragsprüfungen: sie gehen ins Netz und
 * dürfen deshalb nicht in `npm test` landen — dort wäre jeder Ausfall bei
 * Transitous oder nextbike ein roter Lauf auf einem Pull Request, der damit
 * nichts zu tun hat.
 *
 * Nacheinander statt parallel: nextbike und Transitous bekommen sonst ein
 * Dutzend Anfragen gleichzeitig, nur damit die Prüfung eine Sekunde früher
 * fertig ist.
 */
export default defineConfig({
  test: {
    include: ['tests/vertrag/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    retry: 1,
  },
})
