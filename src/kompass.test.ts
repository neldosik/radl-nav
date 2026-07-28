import { describe, expect, it } from 'vitest'
import { kursAusEreignis } from './kompass'

/**
 * Der Ausgleich für die Bildschirmdrehung ist die riskante Stelle: falsches
 * Vorzeichen fällt hochkant gar nicht auf und zeigt quer 180° daneben. Im
 * Vorschaufenster gibt es keinen Sensor, geprüft wird deshalb hier.
 *
 * Aufbau aller Fälle: das Gerät wird gedreht, der Betrachter bleibt stehen.
 * Die Oberkante des *Inhalts* zeigt dann weiter nach Norden, denn genau dafür
 * dreht das Betriebssystem den Inhalt mit.
 */
describe('kursAusEreignis — Blickrichtung aus einem Lageereignis', () => {
  const ios = (heading: number, schirmwinkel: number) =>
    kursAusEreignis({ webkitCompassHeading: heading, absolut: false, schirmwinkel })

  it('gibt hochkant die Geräterichtung unverändert weiter', () => {
    expect(ios(0, 0)?.grad).toBe(0)
    expect(ios(90, 0)?.grad).toBe(90)
    expect(ios(275, 0)?.grad).toBe(275)
  })

  it('rechnet alle vier Lagen auf dieselbe Blickrichtung um', () => {
    // Betrachter schaut nach Norden, Inhalt zeigt also immer nach Norden —
    // egal wie das Gerät in der Hand liegt.
    expect(ios(0, 0)?.grad).toBe(0) // hochkant, Oberkante Nord
    expect(ios(90, 270)?.grad).toBe(0) // quer, Gerät im Uhrzeigersinn gedreht
    expect(ios(270, 90)?.grad).toBe(0) // quer, andere Richtung
    expect(ios(180, 180)?.grad).toBe(0) // über Kopf
  })

  it('bleibt beim Drehen in der Hand richtig, wenn der Betrachter mitdreht', () => {
    // Betrachter schaut nach Osten, Gerät quer: Oberkante zeigt nach Süden.
    expect(ios(180, 270)?.grad).toBe(90)
  })

  it('rechnet `alpha` gegen den Uhrzeigersinn in einen Kompass um', () => {
    expect(kursAusEreignis({ alpha: 0, absolut: true, schirmwinkel: 0 })?.grad).toBe(0)
    expect(kursAusEreignis({ alpha: 90, absolut: true, schirmwinkel: 0 })?.grad).toBe(270)
    expect(kursAusEreignis({ alpha: 270, absolut: true, schirmwinkel: 0 })?.grad).toBe(90)
  })

  it('verwirft `alpha` ohne Ausrichtung am Erdmagnetfeld', () => {
    // Ohne `absolute` ist die Nullrichtung auf manchen Geräten willkürlich —
    // als Kompass wäre das schlimmer als gar keine Angabe.
    expect(kursAusEreignis({ alpha: 90, absolut: false, schirmwinkel: 0 })).toBeNull()
  })

  it('nimmt den iOS-Wert auch ohne Ausrichtungskennzeichen', () => {
    // Dort ist er auch dann rechtweisend.
    expect(ios(42, 0)?.grad).toBe(42)
  })

  it('lässt den iOS-Wert vor `alpha` gehen', () => {
    const k = kursAusEreignis({ webkitCompassHeading: 10, alpha: 90, absolut: true, schirmwinkel: 0 })
    expect(k?.grad).toBe(10)
  })

  it('deutet eine negative Angabe als „nicht kalibriert", nicht als null Grad Fehler', () => {
    expect(kursAusEreignis({ webkitCompassHeading: 10, webkitCompassAccuracy: -1, absolut: false, schirmwinkel: 0 })?.unsicherheit).toBeNull()
    expect(kursAusEreignis({ webkitCompassHeading: 10, webkitCompassAccuracy: 15, absolut: false, schirmwinkel: 0 })?.unsicherheit).toBe(15)
  })

  it('liefert immer einen Wert in [0, 360)', () => {
    for (const h of [0, 359.9, 360, 720, -10]) {
      for (const w of [0, 90, 180, 270, -90]) {
        const g = ios(h, w)?.grad
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThan(360)
      }
    }
  })

  it('gibt nichts zurück, wenn das Ereignis keine Richtung enthält', () => {
    expect(kursAusEreignis({ absolut: true, schirmwinkel: 0 })).toBeNull()
    expect(kursAusEreignis({ alpha: null, absolut: true, schirmwinkel: 0 })).toBeNull()
    expect(kursAusEreignis({ alpha: NaN, absolut: true, schirmwinkel: 0 })).toBeNull()
    expect(kursAusEreignis({ webkitCompassHeading: NaN, alpha: null, absolut: true, schirmwinkel: 0 })).toBeNull()
  })

  it('verkraftet einen unbrauchbaren Schirmwinkel', () => {
    expect(ios(90, NaN)?.grad).toBe(90)
  })
})
