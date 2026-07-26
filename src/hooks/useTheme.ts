import { useEffect, useState } from 'react'
import type { ThemeMode } from '../mapStyle'

const KEY = 'radl.theme'

/** In der Android-Hülle die native Statusleiste mitfärben — dort greift
 *  `meta[name=theme-color]` nicht, deshalb blieb die Leiste hell. */
function paintNativeStatusBar(theme: ThemeMode): void {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (!cap?.isNativePlatform?.()) return
  import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) => {
      const dark = theme === 'dark'
      StatusBar.setBackgroundColor({ color: dark ? '#1b1917' : '#f4f1ea' }).catch(() => {})
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
