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

test('schaltet die Sprache auf Englisch um', async ({ page }) => {
  await seedStorage(page, { 'radl.lang': 'en' })
  await page.goto('/')

  await expect(page.getByPlaceholder(/from|start/i).first()).toBeVisible()
})
