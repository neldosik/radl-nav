import { useEffect, useState } from 'react'

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
  ]
}

export default function Diag({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string[]>([])

  useEffect(() => {
    // Der Effekt läuft nach dem Einhängen ins Dokument, die Rechtecke stehen
    // also schon. Kein `requestAnimationFrame`: das wartet auf ein Bild, und
    // in manchen eingebetteten Ansichten kommt nie eines.
    setText(zeilen())
  }, [])

  return (
    <div className="diag" onClick={onClose}>
      <pre className="diag-box" onClick={e => e.stopPropagation()}>
        {text.join('\n')}
      </pre>
    </div>
  )
}
