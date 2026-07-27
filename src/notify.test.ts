import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelReturnReminders, scheduleReturnReminders } from './notify'

/**
 * Der Zeitplan der Rückgabe-Erinnerung — genau die Sorte Fehler, die man
 * unterwegs nicht sieht: eine Meldung zu spät, doppelt oder gar nicht.
 * Geprüft wird der Browser-Pfad (kein Capacitor im Test).
 */

const gezeigt: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  gezeigt.length = 0
  // Weder Service Worker noch Notification im Test — beides nachbilden.
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, 'navigator', {
    value: { serviceWorker: { getRegistration: async () => null } },
    configurable: true,
  })
  class FakeNotification {
    constructor(title: string) {
      gezeigt.push(title)
    }
    static permission = 'granted'
  }
  Object.defineProperty(globalThis, 'Notification', { value: FakeNotification, configurable: true })
})

afterEach(async () => {
  await cancelReturnReminders()
  vi.useRealTimers()
})

describe('scheduleReturnReminders', () => {
  it('warnt fünf Minuten vorher und meldet sich zum Ablauf', async () => {
    await scheduleReturnReminders({ secondsLeft: 28 * 60 })

    // 28 Freiminuten, Vorwarnung fünf Minuten davor => bei Minute 23
    await vi.advanceTimersByTimeAsync(23 * 60 * 1000 - 1000)
    expect(gezeigt).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1000)
    expect(gezeigt).toEqual(['Noch 5 Minuten frei'])

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(gezeigt).toEqual(['Noch 5 Minuten frei', 'Freiminuten sind um'])
  })

  it('nennt die Rückgabestation im Text', async () => {
    const meldungen: string[] = []
    Object.defineProperty(globalThis, 'Notification', {
      value: class {
        constructor(_t: string, o?: { body?: string }) {
          meldungen.push(o?.body ?? '')
        }
        static permission = 'granted'
      },
      configurable: true,
    })
    await scheduleReturnReminders({ secondsLeft: 60, stationName: 'Balanstraße' })
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(meldungen[0]).toContain('Balanstraße')
  })

  it('ersetzt alte Alarme statt sie zu sammeln', async () => {
    // Etappenwechsel hin und her: sonst feuert es mehrfach.
    await scheduleReturnReminders({ secondsLeft: 600 })
    await scheduleReturnReminders({ secondsLeft: 600 })
    await scheduleReturnReminders({ secondsLeft: 600 })
    await vi.advanceTimersByTimeAsync(600 * 1000)
    expect(gezeigt).toEqual(['Noch 5 Minuten frei', 'Freiminuten sind um'])
  })

  it('lässt die Vorwarnung weg, wenn ohnehin weniger Zeit bleibt', async () => {
    await scheduleReturnReminders({ secondsLeft: 120 })
    await vi.advanceTimersByTimeAsync(120 * 1000)
    expect(gezeigt).toEqual(['Freiminuten sind um'])
  })

  it('plant nichts, wenn das Fenster schon abgelaufen ist', async () => {
    await scheduleReturnReminders({ secondsLeft: 0 })
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    expect(gezeigt).toHaveLength(0)
  })
})

describe('cancelReturnReminders', () => {
  it('räumt geplante Alarme ab — Etappe vorbei, Rad zurückgegeben', async () => {
    await scheduleReturnReminders({ secondsLeft: 600 })
    await cancelReturnReminders()
    await vi.advanceTimersByTimeAsync(600 * 1000)
    expect(gezeigt).toHaveLength(0)
  })
})
