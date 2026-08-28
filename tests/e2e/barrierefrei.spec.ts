import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { SUCH_URL, fahrt, mockApis, seedStorage } from './mocks'

/**
 * Prüfung auf grobe Barrieren mit axe.
 *
 * Geprüft wird nur, was sich maschinell entscheiden lässt: fehlende Namen an
 * Knöpfen, zu schwacher Kontrast, kaputte Beschriftungen. Das ersetzt keine
 * Prüfung mit einem Vorleseprogramm, fängt aber genau die Fehler, die beim
 * Umbauen der Oberfläche wieder hineinrutschen.
 *
 * Ernst genommen werden `serious` und `critical`. Alles darunter wäre in einer
 * gewachsenen Oberfläche eine Dauerbaustelle und würde die Probe nur
 * abstumpfen.
 */
async function verstoesse(page: import('@playwright/test').Page) {
  // Mitten in der Einblendung steht die Etappenliste auf halber Deckkraft —
  // dann fällt jeder Kontrast durch, auch weiße Schrift auf Petrol. Erst die
  // laufenden Bewegungen auslaufen lassen, dann messen.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined))),
  )

  const ergebnis = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Die Karte ist ein Canvas von MapLibre: deren Bedienelemente gehören uns
    // nicht, und ohne Karte lässt sich die Seite trotzdem vollständig nutzen.
    .exclude('.maplibregl-map')
    .analyze()

  return ergebnis.violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => `${v.id} (${v.impact}): ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)
}

test.beforeEach(async ({ page }) => {
  await mockApis(page)
  await seedStorage(page, { 'radl.onboarding': 'ja' })
})

test('Suchmaske ohne grobe Barrieren', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder(/Start|von/i).first()).toBeVisible()

  expect(await verstoesse(page)).toEqual([])
})

test('Ergebnisliste ohne grobe Barrieren', async ({ page }) => {
  await page.goto(SUCH_URL)
  await expect(page.locator('.results-list .route').first()).toBeVisible({ timeout: 20_000 })

  expect(await verstoesse(page)).toEqual([])
})

test('Fahrtenbuch ohne grobe Barrieren', async ({ page }) => {
  await seedStorage(page, { 'radl.trips': JSON.stringify([fahrt('t-1', 1)]) })
  await page.goto('/')

  await expect(async () => {
    await page.locator('nav').getByRole('button', { name: 'Fahrten' }).click()
    await expect(page.locator('.hist-list')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })

  expect(await verstoesse(page)).toEqual([])
})
