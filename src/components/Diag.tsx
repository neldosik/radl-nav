import { useEffect, useState } from 'react'
import {
  berechtigungsStand,
  currentPosition,
  istNativ,
  ortungsFehler,
  ortungsProtokoll,
  ortungsTakt,
} from '../geolocation'
import { aktualisierungBericht } from '../aktualisierung'

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

function zeilen(rechte: string): string[] {
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
    `ortrechte  ${rechte}`,
    `orttakt    ${ortungsTakt()}`,
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
  const [rechte, setRechte] = useState('wird geprüft …')
  const [stand, setStand] = useState('noch nicht geprüft')

  /**
   * Selbstaktualisierung prüfen — erzwungen, ohne die Stundenpause.
   *
   * „Bei mir hat sich nichts geändert" hat drei mögliche Ursachen: das Paket
   * ist nicht angekommen, es liegt und wartet auf den Neustart, oder es läuft
   * längst. Von außen sehen alle drei gleich aus.
   */
  async function standPruefen() {
    setStand('prüfe …')
    try {
      setStand(await aktualisierungBericht())
    } catch (e) {
      setStand(`Fehler: ${(e as Error)?.message ?? e}`)
    }
  }

  /**
   * Einmal wirklich orten — der Text sagt dann, woran es hängt.
   *
   * Mit eigener Frist: der erste Versuch blieb auf dem Gerät bei „frage …"
   * stehen. Ob die Anfrage noch läuft oder hängt, war daran nicht zu
   * erkennen, und ohne Ergebnis war der Knopf wertlos. Die Frist liegt über
   * der des Plugins, damit dessen eigene Meldung Vorrang hat.
   */
  async function ortPruefen() {
    const start = Date.now()
    let laeuft = true
    const ticker = window.setInterval(() => {
      if (laeuft) setOrt(`frage … ${Math.round((Date.now() - start) / 1000)} s`)
    }, 500)
    const frist = new Promise<never>((_, ab) =>
      setTimeout(() => ab(new Error('keine Antwort binnen 35 s')), 35000),
    )
    try {
      const p = (await Promise.race([currentPosition(), frist])) as { lat: number; lon: number }
      setOrt(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} nach ${Date.now() - start} ms

${ortungsProtokoll().join('\n')}`)
    } catch (e) {
      // Das ganze Protokoll, nicht nur der letzte Eintrag: bleibt ein Schritt
      // hängen, steht er als letzter da — und genau der ist der Schuldige.
      setOrt(`Fehler nach ${Date.now() - start} ms:
${(e as Error)?.message ?? e}

${ortungsProtokoll().join('\n') || '(kein einziger Schritt begonnen)'}`)
    } finally {
      laeuft = false
      window.clearInterval(ticker)
    }
  }

  useEffect(() => {
    // Der Effekt läuft nach dem Einhängen ins Dokument, die Rechtecke stehen
    // also schon. Kein `requestAnimationFrame`: das wartet auf ein Bild, und
    // in manchen eingebetteten Ansichten kommt nie eines.
    setText(zeilen(rechte))
  }, [rechte])

  // Der Stand der Berechtigung ist die erste Frage bei jedem Ortungsproblem —
  // ohne ihn ist eine Absage von einem Hänger nicht zu unterscheiden.
  useEffect(() => {
    let lebt = true
    berechtigungsStand()
      .then(r => lebt && setRechte(r))
      .catch(e => lebt && setRechte(`Fehler: ${(e as Error)?.message ?? e}`))
    return () => {
      lebt = false
    }
  }, [])

  return (
    <div className="diag" onClick={onClose}>
      <div className="diag-box" onClick={e => e.stopPropagation()}>
        <pre>{text.join('\n')}</pre>
        <button className="diag-btn" onClick={ortPruefen}>
          Ortung testen
        </button>
        <pre className="diag-ort">{ort}</pre>
        <button className="diag-btn" onClick={standPruefen}>
          Aktualisierung prüfen
        </button>
        <pre className="diag-ort">{stand}</pre>
      </div>
    </div>
  )
}
