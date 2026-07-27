import { useEffect, useRef } from 'react'

/**
 * Zurück-Geste und Zurück-Taste sollen *innerhalb* der App zurückführen,
 * nicht die App verlassen.
 *
 * Jede Ansicht, die man schließen kann — Reiter, Los-Modus, Blätter,
 * Vollbildkarten — meldet sich hier an. Solange sie offen ist, liegt ein
 * eigener History-Eintrag darüber; ein Zurück nimmt diesen Eintrag und
 * schließt die Ansicht, statt die Seite zu verlassen. Mehrere Ansichten
 * übereinander stapeln sich entsprechend und werden in umgekehrter
 * Reihenfolge abgeräumt.
 */

/**
 * Ein von uns selbst ausgelöster Rücksprung — das folgende `popstate` gehört
 * nicht dem Nutzer.
 *
 * Steht bewusst hier und nicht in den Komponenten: vorher hatte jede Datei
 * ihre eigene Variable, obwohl der Fall genau zwischen zwei Ansichten
 * auftritt — Ansicht A nimmt beim Schließen ihren Eintrag zurück, und Ansicht
 * B hätte das als Zurück-Druck missverstanden.
 */
let eigenerRuecksprung = false

export function useBackGuard(active: boolean, onBack: () => void): void {
  const zurueck = useRef(onBack)
  zurueck.current = onBack
  /** Wurde der Eintrag schon durch ein echtes Zurück verbraucht? */
  const verbraucht = useRef(false)

  useEffect(() => {
    if (!active) return
    verbraucht.current = false
    window.history.pushState({ radlGuard: true }, '')

    const onPop = () => {
      // `history.back()` wirkt verzögert. Im Entwicklungsmodus ruft React jeden
      // Effekt doppelt auf; ohne diese Weiche fing der neu angemeldete Zuhörer
      // das eigene popstate ab und schloss die Ansicht sofort wieder.
      if (eigenerRuecksprung) {
        eigenerRuecksprung = false
        return
      }
      verbraucht.current = true
      zurueck.current()
    }
    window.addEventListener('popstate', onPop)

    return () => {
      window.removeEventListener('popstate', onPop)
      // Regulär geschlossen (Kreuz, Auswahl, Reiterwechsel): den eigenen
      // Eintrag zurücknehmen, sonst verpufft der nächste Zurück-Druck.
      if (!verbraucht.current) {
        eigenerRuecksprung = true
        window.history.back()
      }
    }
  }, [active])
}
