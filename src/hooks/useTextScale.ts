import { useCallback, useEffect, useState } from 'react'

/**
 * Schriftgröße — der Systemeinstellung folgen, ohne die Vermessung der App
 * aufzugeben.
 *
 * ## Warum nicht einfach `rem`
 *
 * Die übliche Antwort auf „unterstütze große Schrift" ist: Wurzelgröße setzen,
 * alles in `rem`. Auf dem iPhone bringt das nichts. Safari kennt keine
 * einstellbare Standardschriftgröße, an der `rem` hängen könnte; was iOS unter
 * Einstellungen → Anzeige → Textgröße anbietet, erreicht eine Webseite nur
 * über die Textstil-Schlüsselwörter. Gemessen im echten WebKit:
 *
 *     font: -apple-system-body      →  UICTFontTextStyleBody, 13px
 *     font: -apple-system-caption1  →  10px
 *
 * Der Wert löst also auf, aber er ist unbegrenzt: 17px als Standard auf dem
 * Telefon, mit „Größerer Text" bis 53px. Hängt die ganze Oberfläche daran,
 * multipliziert eine fremde Einstellung die gesamte Vermessung mit bis zu 3 —
 * und die Reiterleiste, die Knopfhöhen und die Kartenausschnitte sind dafür
 * nicht gebaut.
 *
 * ## Was hier stattdessen passiert
 *
 * Der Systemwert wird abgefragt, aber nicht angewandt, sondern in einen
 * begrenzten Faktor umgerechnet: `--ts`. Nur Schriftgrößen hängen daran, die
 * Vermessung nicht. Zwei Eigenschaften sind dabei wichtig:
 *
 * 1. **Bei Standardeinstellungen ist der Faktor genau 1.** 17/17 — die App
 *    rendert Pixel für Pixel wie bisher. Wer nichts umgestellt hat, merkt von
 *    dieser Änderung nichts.
 * 2. **Nach oben ist bei 1.45 Schluss.** Wer 3× braucht, bekommt 1.45 statt
 *    einer zerfallenen Oberfläche. Das ist eine Einschränkung, keine Lösung —
 *    aber die ehrlichere von beiden.
 *
 * Nach unten wird nichts skaliert. Auf Nicht-Apple-Geräten und im Kopflos-Bau
 * löst `-apple-system-body` kleiner auf als 17; daraus dürfte keine kleinere
 * Schrift werden.
 *
 * ## Erkennung
 *
 * Ohne Unterstützung ist die Kurzschreibweise `font:` ungültig und das Element
 * behält seine geerbte Größe — dann melden beide Sonden dasselbe. Genau daran
 * wird es erkannt, ohne auf den Namen `UICTFontTextStyleBody` zu bauen; das
 * ist ein Interna von WebKit und kann sich ändern.
 */

const KEY = 'radl.textscale'

/** Körpertext-Größe von iOS bei unveränderter Einstellung. */
const IOS_BODY_STANDARD = 17
/** Weiter als das hält die Vermessung der App nicht durch. */
const MAX_SKALA = 1.45

export type TextScaleMode = 'system' | 'large' | 'xlarge'

/** Fester Faktor der beiden Handstufen. */
const HAND: Record<Exclude<TextScaleMode, 'system'>, number> = {
  large: 1.2,
  xlarge: 1.4,
}

export const TEXT_SCALE_MODES: TextScaleMode[] = ['system', 'large', 'xlarge']

function begrenzen(f: number): number {
  if (!Number.isFinite(f)) return 1
  return Math.min(MAX_SKALA, Math.max(1, Math.round(f * 100) / 100))
}

/** Größe eines Textstils in Pixel; 0, wenn nicht messbar. */
function stilGroesse(stil: string): number {
  const el = document.createElement('span')
  // `all: initial` löst das Element von der geerbten Größe der App, damit
  // beide Sonden von derselben Grundlage aus melden.
  el.style.cssText = `all: initial; position: absolute; visibility: hidden; font: ${stil}`
  document.body.appendChild(el)
  const px = parseFloat(getComputedStyle(el).fontSize)
  el.remove()
  return Number.isFinite(px) ? px : 0
}

/** Faktor aus der Systemeinstellung — 1, wenn das Gerät keine anbietet. */
export function systemTextScale(): number {
  if (typeof document === 'undefined' || !document.body) return 1
  const body = stilGroesse('-apple-system-body')
  const caption = stilGroesse('-apple-system-caption1')
  // Gleich groß heißt: die Schlüsselwörter greifen nicht.
  if (!body || !caption || Math.abs(body - caption) < 0.5) return 1
  return begrenzen(body / IOS_BODY_STANDARD)
}

function ladeModus(): TextScaleMode {
  const gespeichert = localStorage.getItem(KEY)
  return gespeichert === 'large' || gespeichert === 'xlarge' ? gespeichert : 'system'
}

export function useTextScale() {
  const [mode, setMode] = useState<TextScaleMode>(ladeModus)
  const [systemSkala, setSystemSkala] = useState(1)

  // Einmal messen, sobald die Seite steht — und erneut bei der Rückkehr zur
  // App. Für eine geänderte Systemschriftgröße gibt es kein Ereignis; wer sie
  // umstellt, war dafür in den Einstellungen und kommt zurück.
  useEffect(() => {
    const messen = () => setSystemSkala(systemTextScale())
    messen()
    const beiRueckkehr = () => {
      if (document.visibilityState === 'visible') messen()
    }
    document.addEventListener('visibilitychange', beiRueckkehr)
    return () => document.removeEventListener('visibilitychange', beiRueckkehr)
  }, [])

  const skala = mode === 'system' ? systemSkala : HAND[mode]

  useEffect(() => {
    localStorage.setItem(KEY, mode)
    // Bei 1 keine Eigenschaft setzen — dann gilt der Standard aus dem Blatt
    // und in den Entwicklerwerkzeugen steht kein irreführendes `calc(… * 1)`.
    if (skala === 1) document.documentElement.style.removeProperty('--ts')
    else document.documentElement.style.setProperty('--ts', String(skala))
  }, [mode, skala])

  /** Durch die drei Stufen schalten. */
  const cycleTextScale = useCallback(() => {
    setMode(m => TEXT_SCALE_MODES[(TEXT_SCALE_MODES.indexOf(m) + 1) % TEXT_SCALE_MODES.length])
  }, [])

  return { textScaleMode: mode, textScale: skala, cycleTextScale }
}
