import { expect, test } from '@playwright/test'
import { SUCH_URL, fahrt, mockApis, seedStorage } from './mocks'

/**
 * Rauchprobe: die Wege, deren Bruch niemand übersehen dürfte.
 *
 * Die Modultests decken Rechenregeln ab — was sie nicht sehen, ist eine App,
 * die gar nicht erst startet: ein fehlender dynamischer Teil, ein Fehler beim
 * ersten Rendern, eine kaputte `base`-Adresse im gebauten Bündel. Genau das
 * fängt diese Datei ab, absichtlich knapp gehalten.
 */

test.beforeEach(async ({ page }) => {
  await mockApis(page)
  // Die Einführung legt sich sonst über alles und die Standortabfrage hängt.
  await seedStorage(page, { 'radl.onboarding': 'ja' })
})

test('startet und zeigt die Suchmaske', async ({ page }) => {
  const fehler: string[] = []
  page.on('pageerror', e => fehler.push(e.message))

  await page.goto('/')

  await expect(page.getByPlaceholder(/Start|von/i).first()).toBeVisible()
  expect(fehler).toEqual([])
})

test('findet aus einem geteilten Verweis eine Route', async ({ page }) => {
  await page.goto(SUCH_URL)

  const karte = page.locator('.results-list .route').first()
  await expect(karte).toBeVisible({ timeout: 20_000 })
  await expect(karte).toContainText('S1')
})

test('meldet Störungen der gefahrenen Linie', async ({ page }) => {
  await page.goto(SUCH_URL)

  const karte = page.locator('.results-list .route').first()
  await expect(karte).toBeVisible({ timeout: 20_000 })
  await expect(karte.locator('.badge-highlight.stoerung')).toContainText('1 Störung')
  await expect(karte.locator('.stoerung-titel')).toContainText('S1: Verspätungen')
  await expect(karte.locator('.stoerung-text')).toContainText('Signalstörung')
})

test('behält die Suche in der Adresszeile', async ({ page }) => {
  await page.goto(SUCH_URL)
  await expect(page.locator('.results-list .route').first()).toBeVisible({ timeout: 20_000 })

  const adresse = page.url()
  expect(adresse).toContain('von=48.13743')
  await page.goto(adresse)
  await expect(page).toHaveURL(/von=48\.13743/)
  await expect(page).toHaveURL(/nach=48\.12722/)
  await expect(page.locator('.results-list .route').first()).toBeVisible({ timeout: 20_000 })
})

test('zeigt das Fahrtenbuch und erlaubt die Sicherung', async ({ page }) => {
  await seedStorage(page, {
    'radl.trips': JSON.stringify([fahrt('t-1', 1), fahrt('t-2', 3)]),
  })
  await page.goto('/')

  // Der erste Druck auf den Reiter kann ins Leere gehen, solange React die
  // Ereignisse noch nicht angehängt hat — deshalb wiederholen statt warten.
  await expect(async () => {
    await page.locator('nav').getByRole('button', { name: 'Fahrten' }).click()
    await expect(page.locator('.hist-list')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })

  await expect(page.locator('.hist-route').first()).toContainText('Ostbahnhof')
  const sichern = page.getByRole('button', { name: 'Sichern' })
  await expect(sichern).toBeEnabled()

  const download = page.waitForEvent('download')
  await sichern.click()
  expect((await download).suggestedFilename()).toMatch(/^radl-fahrten-\d{4}-\d{2}-\d{2}\.json$/)
})

/**
 * maplibre 6 lädt seinen Arbeiter als eigene Datei nach. Fehlt sie im Bündel,
 * bleibt die Karte weiß und meldet nichts — der Fehler steht nur als 404 im
 * Netzprotokoll. Genau danach wird hier gesehen.
 */
test('lädt die Karte samt ihrem Arbeiter', async ({ page }, testInfo) => {
  const eigen = new URL(testInfo.project.use.baseURL ?? 'http://localhost').origin
  const kaputt: string[] = []
  page.on('response', r => {
    if (r.url().startsWith(eigen) && !r.ok()) kaputt.push(`${r.status()} ${r.url()}`)
  })
  page.on('requestfailed', r => {
    if (r.url().startsWith(eigen)) kaputt.push(`${r.failure()?.errorText} ${r.url()}`)
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Räder', exact: true }).click()

  await expect(page.locator('canvas').first()).toBeVisible()
  expect(kaputt).toEqual([])
})

/**
 * Die Wetterplakette gehört in die untere rechte Ecke der Übersichtskarte.
 * Eine zweite `.weather`-Regel hatte ihr `position: absolute` überschrieben —
 * damit rutschte sie unter die Karte, links, und wurde vom `overflow: hidden`
 * des Kartenfelds fast vollständig abgeschnitten.
 */
test('hält die Wetterplakette in der Karte', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto(SUCH_URL)

  const karte = page.locator('.results-map')
  const plakette = page.locator('.weather')
  await expect(plakette).toBeVisible({ timeout: 20_000 })

  const k = (await karte.boundingBox())!
  const p = (await plakette.boundingBox())!
  expect(p.x).toBeGreaterThanOrEqual(k.x)
  expect(p.x + p.width).toBeLessThanOrEqual(k.x + k.width + 1)
  expect(p.y + p.height).toBeLessThanOrEqual(k.y + k.height + 1)
  // rechte Ecke, nicht linke
  expect(p.x).toBeGreaterThan(k.x + k.width / 2)
})

test('wechselt die Stadt und fragt dort keine Münchner Meldungen ab', async ({ page }) => {
  const mvg: string[] = []
  page.on('request', r => {
    if (r.url().includes('mvg.de')) mvg.push(r.url())
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Hauptmenü' }).click()
  await page.getByRole('button', { name: 'Stadt: München' }).click()

  await expect(page.locator('.app-footer')).toContainText('Berlin')
  await expect(page.locator('.app-footer')).toContainText('nextbike Berlin')
  expect(mvg).toEqual([])
})

test('lädt beim Stadtwechsel neu und lässt keine fremde Suche stehen', async ({ page }) => {
  await page.goto(SUCH_URL)
  await expect(page.locator('.route').first()).toBeVisible()

  await page.getByRole('button', { name: 'Hauptmenü' }).click()
  await page.getByRole('button', { name: 'Stadt: München' }).click()

  // Die Treffer gehören zur alten Stadt — nach dem Wechsel darf keiner davon
  // stehen bleiben, und die Suche muss aus der Adresszeile verschwinden.
  await expect(page.locator('.route')).toHaveCount(0)
  expect(new URL(page.url()).search).toBe('')
  await expect(page.locator('.app-footer')).toContainText('nextbike Berlin')
})

test('schaltet die Sprache auf Englisch um', async ({ page }) => {
  await seedStorage(page, { 'radl.lang': 'en' })
  await page.goto('/')

  await expect(page.getByPlaceholder(/from|start/i).first()).toBeVisible()
})
