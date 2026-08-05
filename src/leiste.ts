/**
 * Die tatsächliche Höhe der Reiterleiste in `--tabbar-h` schreiben.
 *
 * Bisher stand die Höhe als Konstante im Blatt: `calc(63px + var(--tabbar-pb))`
 * — 6 oben, 56 Knopf, 1 Linie, unten der Sicherheitsabstand. Solange die
 * Rechnung stimmte, stimmte auch der Platz, den `.app.with-tabs` unten frei
 * hält. Nur ist es eine zweite Fassung derselben Zahl, und zwei Fassungen
 * laufen irgendwann auseinander: auf einem Gerät mit 24 Punkt
 * Sicherheitsabstand reservierte die Formel einmal 97 Punkte gegenüber 79
 * Punkten Leiste — die Differenz stand als leerer Streifen unter „Räder" und
 * „Fahrten". Gefunden wurde das erst am Telefon, und der einzige Weg dorthin
 * war Nachrechnen.
 *
 * Deshalb keine Rechnung mehr, sondern eine Messung. Der Beobachter meldet
 * jede Änderung — Drehung, Sicherheitsabstand, größere Schrift — und der Wert
 * ist danach per Definition der richtige. Das ist auch die Voraussetzung
 * dafür, dass die Schrift überhaupt wachsen darf: eine höhere Leiste schiebt
 * sich sonst über den Inhalt, statt sich Platz zu nehmen.
 *
 * Steht kein Wert (JavaScript aus, `ResizeObserver` fehlt), bleibt die alte
 * Formel im Blatt als Rückfall stehen — sie ist nicht falsch, nur eben starr.
 *
 * Im abgelegten Modus (`.hat-luecke`) liegt die Leiste im Fluss und der Platz
 * unten ist 0; die Größe wird trotzdem geschrieben, sie schadet dort nicht.
 */

let beobachtet: HTMLElement | null = null
let beobachter: ResizeObserver | null = null

function schreiben(hoehe: number): void {
  if (hoehe > 0) document.documentElement.style.setProperty('--tabbar-h', `${Math.round(hoehe)}px`)
}

/**
 * Als Callback-Ref an die `<nav class="tabbar">` hängen. React ruft die
 * Funktion beim Einhängen mit dem Element und beim Aushängen mit `null` auf;
 * beides ist hier gültig.
 */
export function leisteMessen(el: HTMLElement | null): void {
  if (el === beobachtet) return
  beobachter?.disconnect()
  beobachter = null
  beobachtet = el

  if (!el) {
    document.documentElement.style.removeProperty('--tabbar-h')
    return
  }

  const messen = () => schreiben(el.getBoundingClientRect().height)
  messen()

  if (typeof ResizeObserver === 'undefined') return
  beobachter = new ResizeObserver(messen)
  beobachter.observe(el)
}
