import { useEffect, useState } from 'react'
import { currentPosition, istNativ, ortungsFehler } from '../geolocation'

/**
 * Messwerte des Geräts, damit Layoutfehler nicht aus Bildschirmfotos geraten
 * werden müssen.
 *
 * Anlass: auf einem iPhone 13 Pro stand unter der Reiterleiste ein leerer
 * Streifen, auf anderen Geräten nicht. Aus einem Foto lässt sich nicht
 * ablesen, ob der Streifen noch zur Seite gehört oder schon zum Gerät —
 * dafür braucht es die Zahlen, die der Browser selbst nennt.
 *
 * „Diagnose" heißt in beiden Oberflächensprachen gleich, deshalb hier ohne
 * Wörterbuch.
 */

/** Einen CSS-Ausdruck ausmessen, den man nicht direkt abfragen kann. */
function messe(wert: string): number {
  const probe = document.createElement('div')
  probe.style.cssText = `position:absolute;visibility:hidden;height:${wert};`
  document.body.appendChild(probe)
  const h = probe.getBoundingClientRect().height
  probe.remove()
  return Math.round(h * 100) / 100
}

function zeilen(): string[] {
  const vv = window.visualViewport
  const app = document.querySelector('.app')?.getBoundingClientRect()
  const bar = document.querySelector('.tabbar')?.getBoundingClientRect()
  const wurzel = document.getElementById('root')?.getBoundingClientRect()
  const stand =
    (window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser') +
    ((navigator as { standalone?: boolean }).standalone ? ' / apple' : '')

  return [
    `stand      ${__STAND__}  ${__GEBAUT__}`,
    `fehlt unten ${messe('calc(100lvh - 100dvh)')}`,
    `vollbild   ${document.documentElement.classList.contains('hat-luecke') ? 'an' : 'aus'}`,
    `innen      ${innerWidth} x ${innerHeight}`,
    `schirm     ${screen.width} x ${screen.height}  dpr ${devicePixelRatio}`,
    `sicht      ${vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)}  oben ${Math.round(vv.offsetTop)}` : '-'}`,
    `modus      ${stand}`,
    `dvh/svh/lvh ${messe('100dvh')} / ${messe('100svh')} / ${messe('100lvh')}`,
    `html/body  ${document.documentElement.clientHeight} / ${document.body.clientHeight}`,
    `root       ${wurzel ? `${Math.round(wurzel.top)}..${Math.round(wurzel.bottom)}` : '-'}`,
    `app        ${app ? `${Math.round(app.top)}..${Math.round(app.bottom)}  h ${Math.round(app.height)}` : '-'}`,
    `tabbar     ${bar ? `${Math.round(bar.top)}..${Math.round(bar.bottom)}  h ${Math.round(bar.height)}` : 'keine'}`,
    `inset o/u  ${messe('env(safe-area-inset-top, 0px)')} / ${messe('env(safe-area-inset-bottom, 0px)')}`,
    `inset l/r  ${messe('env(safe-area-inset-left, 0px)')} / ${messe('env(safe-area-inset-right, 0px)')}`,
    `huelle     ${istNativ() ? 'nativ' : 'web'}  plugins: ${plugins()}`,
    `ortfehler  ${ortungsFehler() || '-'}`,
    `sw         ${navigator.serviceWorker?.controller ? 'steuert die Seite' : 'frei'}`,
  ]
}

/** Welche Hüllen-Bausteine im Fenster hängen. Fehlt „Geolocation", ist das
 *  Plugin gar nicht geladen und jede Ortung scheitert schon davor. */
function plugins(): string {
  const cap = (window as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
  const namen = Object.keys(cap?.Plugins ?? {})
  return namen.length ? namen.join(',') : 'keine'
}

export default function Diag({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string[]>([])
  const [ort, setOrt] = useState('noch nicht geprüft')

  /** Einmal wirklich orten — der Text sagt dann, woran es hängt. */
  async function ortPruefen() {
    setOrt('frage …')
    const start = Date.now()
    try {
      const p = await currentPosition()
      setOrt(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} nach ${Date.now() - start} ms`)
    } catch (e) {
      setOrt(`Fehler nach ${Date.now() - start} ms: ${(e as Error)?.message ?? e}`)
    }
  }

  useEffect(() => {
    // Der Effekt läuft nach dem Einhängen ins Dokument, die Rechtecke stehen
    // also schon. Kein `requestAnimationFrame`: das wartet auf ein Bild, und
    // in manchen eingebetteten Ansichten kommt nie eines.
    setText(zeilen())
  }, [])

  return (
    <div className="diag" onClick={onClose}>
      <div className="diag-box" onClick={e => e.stopPropagation()}>
        <pre>{text.join('\n')}</pre>
        <button className="diag-btn" onClick={ortPruefen}>
          Ortung testen
        </button>
        <pre className="diag-ort">{ort}</pre>
      </div>
    </div>
  )
}
