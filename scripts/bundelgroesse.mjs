/**
 * Wächter über die Größe des Bündels.
 *
 * Zwei Zahlen entscheiden, wie schnell die App am Handy im Netz startet: was
 * der Browser laden *muss*, bevor irgendetwas zu sehen ist (der Einstieg samt
 * vorgeladener Geschwister), und wie dick der größte nachgeladene Brocken ist.
 * Der Kartenteil ist mit rund 270 kB gzip der schwerste — er hängt heute an
 * `import()` und darf nicht versehentlich in den Einstieg rutschen, etwa durch
 * einen beiläufigen `import { … } from 'maplibre-gl'` in einer Datei, die von
 * App.tsx aus erreichbar ist. Genau das fällt in keiner Prüfung auf, es wird
 * nur alles langsamer.
 *
 * Gemessen wird gzip, weil das ankommt, was über die Leitung geht.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(WURZEL, 'dist')

/** Grenzen in kB (gzip). Sie liegen bewusst knapp über dem Ist-Stand: eine
 *  Überschreitung soll auffallen, nicht erst, wenn es schon weh tut. */
const GRENZEN = {
  /** Alles, was das HTML sofort anfordert — Einstieg, Vorlade-Verweise, CSS. */
  einstieg: 125,
  /** Der größte einzeln nachgeladene Teil (heute der Kartenstil). */
  groessterTeil: 320,
  /**
   * Summe über alles Gebaute.
   *
   * Seit maplibre 6 steckt der Kartenarbeiter in einer eigenen Datei statt
   * im Hauptbündel. Er bringt denselben Unterbau (`maplibre-gl-shared`) ein
   * zweites Mal mit — anders geht es nicht, ein Worker kann sich nichts aus
   * dem Fenster ausleihen. Rund 130 kB gzip, die erst beim Öffnen der Karte
   * geladen und danach gepuffert werden; der Einstieg bleibt unberührt.
   */
  gesamt: 560,
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10
const gzip = (pfad) => gzipSync(readFileSync(pfad)).length

function dateienAusHtml() {
  const html = readFileSync(join(DIST, 'index.html'), 'utf8')
  const treffer = [...html.matchAll(/(?:src|href)="\.\/([^"]+\.(?:js|css))"/g)]
  return [...new Set(treffer.map(m => m[1]))]
}

function alleDateien() {
  const eintraege = readFileSync(join(DIST, 'precache-manifest.json'), 'utf8')
  return JSON.parse(eintraege).filter(n => /\.(js|css)$/.test(n))
}

function main() {
  if (!statSync(DIST, { throwIfNoEntry: false })) {
    console.error('dist/ fehlt — erst `npm run build` laufen lassen.')
    process.exit(2)
  }

  const einstiegDateien = dateienAusHtml()
  const alle = alleDateien()

  const einstieg = einstiegDateien.reduce((n, d) => n + gzip(join(DIST, d)), 0)
  const teile = alle
    .filter(d => !einstiegDateien.includes(d))
    .map(d => ({ d, size: gzip(join(DIST, d)) }))
    .sort((a, b) => b.size - a.size)
  const gesamt = alle.reduce((n, d) => n + gzip(join(DIST, d)), 0)
  const groessterTeil = teile[0]?.size ?? 0

  const zeilen = [
    ['Einstieg (sofort geladen)', kb(einstieg), GRENZEN.einstieg],
    ['Größter nachgeladener Teil', kb(groessterTeil), GRENZEN.groessterTeil],
    ['Gesamt', kb(gesamt), GRENZEN.gesamt],
  ]

  let ueber = false
  for (const [name, ist, grenze] of zeilen) {
    const schlecht = ist > grenze
    ueber ||= schlecht
    console.log(`${schlecht ? '✗' : '✓'} ${name}: ${ist} kB gzip (Grenze ${grenze} kB)`)
  }

  console.log('\nNachgeladene Teile:')
  for (const { d, size } of teile.slice(0, 5)) console.log(`  ${kb(size)} kB  ${d}`)

  if (ueber) {
    console.error(
      '\nZu groß. Entweder ist etwas Schweres in den Einstieg gerutscht (dann gehört es\n' +
        'hinter ein `import()`), oder die Grenze in scripts/bundelgroesse.mjs muss\n' +
        'bewusst angehoben werden.',
    )
    process.exit(1)
  }
}

main()
