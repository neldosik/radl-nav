/**
 * Ausgleich für die Lücke, die iOS im Startbildschirm-Modus unten lässt.
 *
 * Gemessen auf einem iPhone 13 Pro: Bildschirm 844 hoch, Seite aber nur 797 —
 * genau die 47 px der Statusleiste, die oben als Sicherheitsabstand ohnehin
 * schon angerechnet werden. Unten blieb dadurch ein Streifen, in dem die
 * Reiterleiste fehlte.
 *
 * `lvh` nennt in diesem Fall die vollen 844, `dvh` die 797. Die Differenz
 * legen wir als `--fehlt` ab; das Stylesheet zieht die Seite darum länger und
 * setzt die Reiterleiste aus der festen Verankerung in den normalen Fluss, wo
 * sie am unteren Rand der Seite sitzt statt am unteren Rand des Sichtfelds.
 *
 * Nur im Startbildschirm-Modus. Im Browser gehen `lvh` und `dvh`
 * regelmäßig auseinander, sobald die Adressleiste ein- und ausfährt — dort
 * wäre derselbe Ausgleich falsch und würde die Leiste aus dem Bild schieben.
 */

/** Läuft die Seite als abgelegte App ohne Browserbedienung? */
function alsApp(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return !!(navigator as { standalone?: boolean }).standalone
}

/** Eine CSS-Höhe ausmessen, die sich nicht direkt abfragen lässt. */
function hoehe(probe: HTMLElement, wert: string): number {
  probe.style.height = wert
  return probe.getBoundingClientRect().height
}

export function lueckeAusgleichen(): void {
  const wurzel = document.documentElement
  const zuruecksetzen = () => {
    wurzel.style.removeProperty('--fehlt')
    wurzel.classList.remove('hat-luecke')
  }

  if (!alsApp()) return zuruecksetzen()

  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;top:0;left:0;width:1px;'
  document.body.appendChild(probe)
  const lvh = hoehe(probe, '100lvh')
  const dvh = hoehe(probe, '100dvh')
  probe.remove()

  // Ein Pixel Spielraum: die Werte kommen als Bruchzahlen zurück (843.98
  // gegen 797), gleich große Viewports weichen dabei minimal voneinander ab.
  const fehlt = Math.round((lvh - dvh) * 100) / 100
  if (fehlt <= 1) return zuruecksetzen()

  wurzel.style.setProperty('--fehlt', `${fehlt}px`)
  wurzel.classList.add('hat-luecke')
}

/** Einmal jetzt und danach bei jeder Größenänderung. */
export function lueckeBeobachten(): void {
  lueckeAusgleichen()
  window.addEventListener('resize', lueckeAusgleichen)
  window.addEventListener('orientationchange', lueckeAusgleichen)
}
