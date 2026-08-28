import * as maplibregl from 'maplibre-gl'
import arbeiterAdresse from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * Adresse des Kartenarbeiters (Web Worker) festlegen.
 *
 * maplibre 6 rechnet damit, dass neben seinem eigenen Modul die Datei
 * `maplibre-gl-worker.mjs` liegt, und leitet deren Adresse aus
 * `import.meta.url` ab. Nach einem Bündellauf stimmt das nicht mehr: der
 * Kartenteil heißt `assets/mapStyle-<hash>.js`, die Arbeiterdatei liegt
 * überhaupt nicht in `dist/`. Der Aufruf lief also gegen 404 — die Karte
 * bekam ihren Arbeiter nie, blieb leer und meldete dabei keinen Fehler in
 * der Konsole, weil maplibre den fehlgeschlagenen Start nicht nach außen
 * gibt.
 *
 * `?worker&url` lässt Vite die Datei samt ihres Imports als eigenes Bündel
 * bauen und gibt die endgültige Adresse zurück — im Entwicklungsserver wie
 * im Bündel, und mit `base: './'` auch in der Android-Hülle.
 */
let gesetzt = false

export function kartenArbeiterEinrichten(): void {
  if (gesetzt) return
  gesetzt = true
  maplibregl.setWorkerUrl(arbeiterAdresse)
}
