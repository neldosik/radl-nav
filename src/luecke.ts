/**
 * Volle Bildschirmhöhe im Startbildschirm-Modus.
 *
 * Auf einem iPhone 13 Pro gab iOS der abgelegten App nur 797 statt 844 Punkte
 * — genau die 47 der Statusleiste, die oben als Sicherheitsabstand ohnehin
 * schon angerechnet werden. Unten blieb dadurch ein Streifen, in dem die
 * Reiterleiste fehlte.
 *
 * Der erste Anlauf hat die Differenz `lvh` minus `dvh` gemessen und
 * aufgeschlagen. Das misst sich selbst: kaum war die Seite länger, gab iOS
 * die vollen 844 heraus, die Differenz fiel auf null — und der Aufschlag lag
 * trotzdem noch obendrauf. Der Rahmen wurde 891 hoch, die Leiste stand 47
 * Punkte unter der Bildschirmkante.
 *
 * Deshalb ohne Messung. `lvh` nennt in beiden Zuständen dieselben 844; als
 * Höhenangabe ist es damit in sich stimmig, egal wie oft es angewendet wird.
 * Und im Startbildschirm-Modus ist es auch das richtige Maß: eine ein- und
 * ausfahrende Bedienleiste, für die `dvh` gedacht ist, gibt es dort nicht.
 *
 * Im Browser bleibt alles beim Alten — dort fährt die Adressleiste, und `lvh`
 * wäre zu viel.
 */

/** Läuft die Seite als abgelegte App ohne Browserbedienung? */
function alsApp(): boolean {
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  return !!(navigator as { standalone?: boolean }).standalone
}

export function vollbildEinrichten(): void {
  const wurzel = document.documentElement
  wurzel.classList.toggle('hat-luecke', alsApp())
}

/** Einmal jetzt; der Modus kann sich im Betrieb noch ändern. */
export function vollbildBeobachten(): void {
  vollbildEinrichten()
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', vollbildEinrichten)
}
