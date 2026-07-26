import { useEffect, useState } from 'react'
import type { ThemeMode } from '../mapStyle'

const KEY = 'radl.theme'

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
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  return { theme, toggleTheme }
}
