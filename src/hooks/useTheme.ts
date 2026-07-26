import { useEffect, useState } from 'react'
import type { ThemeMode } from '../mapStyle'

const KEY = 'radl.theme'

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

/** Theme-Umschalter; Standard ist hell, Dark nur nach expliziter Wahl. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    localStorage.setItem(KEY, theme)
    const root = document.documentElement
    root.classList.remove('light-theme', 'dark-theme')
    root.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme')
    // Systemleiste des Telefons mitfärben — sonst bleibt sie im Dunkelmodus hell
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#1b1917' : '#f4f1ea')
    paintNativeStatusBar(theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggleTheme }
}
