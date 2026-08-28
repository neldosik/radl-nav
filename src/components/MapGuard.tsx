import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { t } from '../i18n'
import type { Language } from '../i18n'
import { hasWebGL } from '../webgl'

/**
 * Schutz um jede Karte.
 *
 * maplibre-gl braucht WebGL. Fehlt es — altes Android, abgeschaltete
 * Hardwarebeschleunigung, Firmenrichtlinie, manche Energiesparmodi —, wirft
 * `new maplibregl.Map()` im Effekt. React fängt so etwas nicht von selbst ab:
 * es hängt den gesamten Baum aus, und statt der App bleibt eine weiße Seite.
 * Gemessen in einem Browser ohne GPU: `document.body.innerText` war leer.
 *
 * Alles außer der Karte hängt nicht an WebGL — Verbindungen, Abfahrtszeiten,
 * Stationsbestand, der ganze Los-Modus mit Ausnahme des Kartenbilds. Das soll
 * weiterlaufen, auch wenn die Karte nicht kann.
 *
 * Die Prüfung selbst steht in `src/webgl.ts` — hier hätte sie den Fast Refresh
 * der Komponente gekostet.
 */

function Hinweis({ lang }: { lang: Language }) {
  return (
    <div className="map-fallback">
      <b>{t('mapUnavailable', lang)}</b>
      <span>{t('mapUnavailableHint', lang)}</span>
    </div>
  )
}

interface Props {
  children: ReactNode
  lang?: Language
}

interface State {
  kaputt: boolean
}

export default class MapGuard extends Component<Props, State> {
  state: State = { kaputt: false }

  static getDerivedStateFromError(): State {
    return { kaputt: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nicht verschlucken: in der Konsole soll nachvollziehbar bleiben, warum
    // statt der Karte ein Hinweis steht.
    console.warn('Karte konnte nicht dargestellt werden:', error?.message, info.componentStack)
  }

  render() {
    const lang = this.props.lang ?? 'de'
    if (this.state.kaputt || !hasWebGL()) return <Hinweis lang={lang} />
    return this.props.children
  }
}
