import type { TurnKind } from './turns'
import type { Language } from './i18n'

/**
 * Gesprochene Abbiegehinweise.
 *
 * Auf dem Rad lässt sich nicht alle paar Sekunden auf den Bildschirm sehen —
 * bisher gab es nur einen Warnton, der zwar meldet „gleich etwas", aber nicht
 * *was*. Der Browser bringt die Stimme selbst mit, `speechSynthesis` ist in
 * Safari und Chrome seit Jahren da; es braucht also weder Dienst noch Netz.
 *
 * Grenzen: Die Stimmen kommen vom Betriebssystem, Klang und Verfügbarkeit
 * lassen sich nicht wählen. Fehlt eine deutsche Stimme, spricht das Gerät den
 * deutschen Satz mit englischer Aussprache — unschön, aber verständlicher als
 * Schweigen. Und iOS gibt Ton nur her, wenn der Nutzer die Seite schon einmal
 * berührt hat; der Druck auf „Los" genügt dafür.
 */

/** Kann dieses Gerät sprechen? */
export function sprachAusgabeMoeglich(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

const worte: Record<Language, Record<TurnKind, string>> = {
  de: {
    left: 'links abbiegen',
    right: 'rechts abbiegen',
    'slight-left': 'leicht links halten',
    'slight-right': 'leicht rechts halten',
    'sharp-left': 'scharf links abbiegen',
    'sharp-right': 'scharf rechts abbiegen',
  },
  en: {
    left: 'turn left',
    right: 'turn right',
    'slight-left': 'keep slightly left',
    'slight-right': 'keep slightly right',
    'sharp-left': 'turn sharp left',
    'sharp-right': 'turn sharp right',
  },
}

/**
 * Satz zu einer Abbiegung.
 *
 * Die Entfernung wird auf zehn Meter gerundet: „in siebenundachtzig Metern"
 * klingt nach Messgerät und ist beim Fahren ohnehin nicht zu verwerten.
 * Steht die Abbiegung unmittelbar bevor, entfällt die Entfernung ganz.
 */
export function abbiegeSatz(kind: TurnKind, inM: number, lang: Language): string {
  const was = worte[lang][kind]
  if (inM <= 30) return lang === 'de' ? `Jetzt ${was}` : `Now ${was}`
  const m = Math.round(inM / 10) * 10
  return lang === 'de' ? `In ${m} Metern ${was}` : `In ${m} meters, ${was}`
}

/**
 * Aussprechen. Eine laufende Ansage wird abgebrochen — beim Fahren zählt die
 * neueste Anweisung, eine Warteschlange spräche noch die vorletzte, wenn die
 * Kreuzung längst hinter einem liegt.
 */
export function sprechen(text: string, lang: Language): void {
  if (!sprachAusgabeMoeglich()) return
  try {
    const s = new SpeechSynthesisUtterance(text)
    s.lang = lang === 'de' ? 'de-DE' : 'en-US'
    s.rate = 1.05
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(s)
  } catch {
    // Kein Grund, die Fahrt daran scheitern zu lassen.
  }
}

/** Sofort still sein — beim Verlassen des Los-Modus oder beim Abschalten des Tons. */
export function schweigen(): void {
  if (!sprachAusgabeMoeglich()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // s. o.
  }
}
