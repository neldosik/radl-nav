import { useCallback, useEffect, useState } from 'react'
import type { ThemeMode } from '../mapStyle'

/**
 * Helle oder dunkle Oberfläche — und ohne eigene Wahl das, was das Gerät sagt.
 *
 * Bisher: „Standard ist hell, Dark nur nach expliziter Wahl." Die dunkle
 * Fassung war vollständig da und funktionierte, fragte das Gerät aber nie.
 * Wer sein Telefon abends auf Dunkel stellt, bekam trotzdem eine cremeweiße
 * Fläche ins Gesicht — auf dem Rad, im Dunkeln, mit dauerhaft wachem Schirm.
 *
 * Drei Zustände statt zwei, wie beim Schriftgrad im selben Menü:
 *
 * - `system` — dem Gerät folgen, auch im laufenden Betrieb. Die automatische
 *   Umstellung am Abend kommt damit auch bei geöffneter App an.
 * - `light` / `dark` — eigene Wahl, die bleibt.
 *
 * Zwei Zustände reichen hier nicht: mit „hell" als bloßem Rückfall ließe sich
 * ein bewusstes „ich will hell, obwohl das Telefon dunkel ist" nicht ablegen —
 * es wäre nicht von „nie gewählt" zu unterscheiden und beim nächsten Start
 * wieder weg. Genau daran krankte der alte Stand, der bei jedem Start
 * ungefragt „light" schrieb.
 *
 * Der alte Schlüssel wird einmalig übernommen: ein dort abgelegtes „dark"
 * kann nur aus einem bewussten Griff zum Schalter stammen. Ein „light" stand
 * bei allen anderen auch, es zählt deshalb als „nie gewählt".
 */

/** Neuer Schlüssel mit drei Zuständen; der alte wird einmalig gelesen. */
const KEY = 'radl.theme.mode'
const ALT_KEY = 'radl.theme'

export type ThemeChoice = 'system' | ThemeMode

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

const dunkelAbfrage = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

/** Was das Gerät gerade sagt. Ohne Angabe: hell. */
export function systemTheme(): ThemeMode {
  return dunkelAbfrage()?.matches ? 'dark' : 'light'
}

/** Gespeicherte Wahl, mit Übernahme des alten Schlüssels. */
export function ladeThemeWahl(): ThemeChoice {
  const neu = localStorage.getItem(KEY)
  if (neu === 'light' || neu === 'dark' || neu === 'system') return neu
  return localStorage.getItem(ALT_KEY) === 'dark' ? 'dark' : 'system'
}

/** In der Android-Hülle die Statusleiste behandeln — dort greift
 *  `meta[name=theme-color]` nicht. Die Leiste liegt durchsichtig über dem
 *  Inhalt (edge-to-edge), damit die Karte bis unter die Uhr läuft; lesbar
 *  bleibt sie durch den Verlauf `.picker-map::before` / `.journey::before`
 *  und die Abstände aus `env(safe-area-inset-top)`. */
function paintNativeStatusBar(theme: ThemeMode): void {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return
  import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => {
      const dark = theme === 'dark'
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {})
      StatusBar.setBackgroundColor({ color: '#00000000' }).catch(() => {})
      // Style.Light = heller Hintergrund mit dunklen Symbolen
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
    })
    .catch(() => {})
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(ladeThemeWahl)
  const [system, setSystem] = useState<ThemeMode>(systemTheme)

  // Dem Gerät auch im laufenden Betrieb folgen — iOS und Android stellen
  // abends von selbst um, und die App ist dann oft offen.
  useEffect(() => {
    const mq = dunkelAbfrage()
    if (!mq) return
    const beiWechsel = () => setSystem(mq.matches ? 'dark' : 'light')
    beiWechsel()
    mq.addEventListener?.('change', beiWechsel)
    return () => mq.removeEventListener?.('change', beiWechsel)
  }, [])

  const theme: ThemeMode = choice === 'system' ? system : choice

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light-theme', 'dark-theme')
    root.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme')
    // Systemleiste des Telefons mitfärben — sonst bleibt sie im Dunkelmodus hell
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1b1917' : '#f4f1ea')
    paintNativeStatusBar(theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(KEY, choice)
    // Der alte Schlüssel ist übernommen und würde sonst beim nächsten Start
    // noch einmal gelesen — er darf die neue Wahl nicht überstimmen.
    localStorage.removeItem(ALT_KEY)
  }, [choice])

  /** Durch System → Hell → Dunkel schalten. */
  const cycleTheme = useCallback(() => {
    setChoice(c => THEME_CHOICES[(THEME_CHOICES.indexOf(c) + 1) % THEME_CHOICES.length])
  }, [])

  return { theme, themeChoice: choice, cycleTheme }
}
