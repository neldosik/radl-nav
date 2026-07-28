// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBackGuard } from './useBackGuard'

/**
 * Die Zurück-Geste hat in diesem Projekt schon zweimal Ärger gemacht: einmal
 * schloss ein selbst ausgelöster Rücksprung sofort die nächste Ansicht, einmal
 * stapelten sich Einträge, bis zehn Drücke nötig waren. Beides fiel erst am
 * Gerät auf. Genau dafür gibt es diese Prüfungen — der Verlauf lässt sich hier
 * vollständig nachstellen.
 */

function Ansicht({ aktiv, onBack }: { aktiv: boolean; onBack: () => void }) {
  useBackGuard(aktiv, onBack)
  return null
}

/**
 * Ein echtes Zurück des Nutzers.
 *
 * jsdom wickelt eine Verlaufsbewegung über die Aufgabenschlange ab, `popstate`
 * kommt also erst einige Ticks später. Mit null Millisekunden Wartezeit war die
 * Prüfung schneller als das Ereignis.
 */
async function zurueck() {
  await act(async () => {
    window.history.back()
    await new Promise(r => setTimeout(r, 50))
  })
}

/**
 * Eine angestoßene Verlaufsbewegung läuft in jsdom über die Aufgabenschlange
 * und kann in die nächste Prüfung hineinreichen. Genau das ist hier einmal
 * passiert: ein nachgereichtes `popstate` verbrauchte die Weiche für den
 * eigenen Rücksprung, und die folgende Prüfung sah einen Zurück-Druck, den es
 * nie gab. Deshalb vor jedem Aufräumen erst auslaufen lassen.
 */
afterEach(async () => {
  // `@testing-library` räumt von selbst nur auf, wenn vitest seine Funktionen
  // global bereitstellt — hier werden sie eingeführt, also von Hand. Ohne das
  // blieben die Ansichten früherer Prüfungen angemeldet und fingen das
  // `popstate` der laufenden ab, bevor die eigentlich gemeinte es sah.
  cleanup()
  await new Promise(r => setTimeout(r, 60))
  window.history.replaceState(null, '', '/')
})

describe('useBackGuard', () => {
  it('fängt das Zurück ab, statt die Seite zu verlassen', async () => {
    const zu = vi.fn()
    render(<Ansicht aktiv onBack={zu} />)
    await zurueck()
    expect(zu).toHaveBeenCalledTimes(1)
  })

  it('legt keinen Eintrag an, solange die Ansicht zu ist', async () => {
    const zu = vi.fn()
    const schub = vi.spyOn(window.history, 'pushState')
    render(<Ansicht aktiv={false} onBack={zu} />)
    expect(schub).not.toHaveBeenCalled()
    schub.mockRestore()
    await zurueck()
    expect(zu).not.toHaveBeenCalled()
  })

  it('legt bei wiederholtem Zeichnen keine weiteren Einträge an', async () => {
    // Der ursprüngliche Fehler: der Effekt hing an der Rückruffunktion, die
    // in App.tsx inline übergeben wird. Jede Uhr-Aktualisierung schob damit
    // einen weiteren Eintrag nach — nach fünf Minuten brauchte es zehn Drücke.
    //
    // Gezählt wird der Aufruf selbst, nicht `history.length`: der Wert wächst
    // nach einem Rücksprung nicht mehr zuverlässig und taugt nicht als Maß.
    const zu = vi.fn()
    const schub = vi.spyOn(window.history, 'pushState')
    const { rerender } = render(<Ansicht aktiv onBack={zu} />)
    expect(schub).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 5; i++) rerender(<Ansicht aktiv onBack={() => zu()} />)
    expect(schub).toHaveBeenCalledTimes(1)
    schub.mockRestore()
  })

  it('nimmt den eigenen Eintrag zurück, wenn regulär geschlossen wird', async () => {
    // Sonst verpufft der nächste Zurück-Druck: er verbraucht nur den
    // liegengebliebenen Eintrag und schließt nichts.
    const zu = vi.fn()
    const { unmount } = render(<Ansicht aktiv onBack={zu} />)
    expect((window.history.state as { radlGuard?: boolean } | null)?.radlGuard).toBe(true)
    const rueck = vi.spyOn(window.history, 'back')
    await act(async () => {
      unmount()
      await new Promise(r => setTimeout(r, 50))
    })
    expect(rueck).toHaveBeenCalledTimes(1)
    rueck.mockRestore()
    // Und ohne den Rückruf auszulösen — geschlossen wurde ja schon.
    expect(zu).not.toHaveBeenCalled()
  })

  it('schließt beim Schließen einer Ansicht nicht gleich die darunter', async () => {
    // Der zweite alte Fehler: das eigene `history.back()` beim Aufräumen wurde
    // vom gerade angemeldeten Zuhörer der anderen Ansicht als Zurück-Druck
    // des Nutzers gedeutet — der Reiter schloss sich sofort wieder.
    const unten = vi.fn()
    const oben = vi.fn()
    render(<Ansicht aktiv onBack={unten} />)
    const { unmount } = render(<Ansicht aktiv onBack={oben} />)
    await act(async () => {
      unmount()
      await new Promise(r => setTimeout(r, 50))
    })
    expect(unten).not.toHaveBeenCalled()
    expect(oben).not.toHaveBeenCalled()
  })
})
