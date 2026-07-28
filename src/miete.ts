/**
 * Die laufende Ausleihe überlebt einen Neustart der Seite.
 *
 * Der Zeitpunkt, an dem das Rad genommen wurde, lag bisher nur in einem `ref`
 * im Los-Modus. Jedes Neuladen setzte ihn auf null zurück — und die App zeigte
 * danach „0 Minuten", obwohl von den 30 Freiminuten vielleicht drei übrig
 * waren. Ab der 31. Minute kostet es Geld, der Fehler ist also keiner der
 * Darstellung.
 *
 * Neu geladen wird häufiger, als man denkt: bei jedem Deployment übernimmt ein
 * neuer Service Worker und die Seite lädt sich selbst neu, in der Hülle
 * ebenso nach dem Abmelden des Workers, und iOS wirft eine Webansicht bei
 * Speicherdruck einfach weg.
 *
 * Die Ausleihe hängt bewusst **nicht** an der Route, sondern an der Station.
 * Was zählt, ist das Rad in der Hand: welchen Weg die App gerade anzeigt, ist
 * dafür unerheblich, und nach einem Neustart ist die Route ohnehin weg.
 */

const SCHLUESSEL = 'radl.miete'
/**
 * Älteres wird verworfen. Wer vor Stunden ein Rad nahm, hat es längst
 * zurückgegeben — eine wiederauferstehende Uhr wäre schlimmer als keine.
 */
const MAX_ALTER_MS = 3 * 60 * 60 * 1000

export interface Miete {
  /** Station, an der das Rad genommen wurde. */
  stationId: string
  /** Beginn der Ausleihe. */
  seit: number
}

/** Läuft gerade eine Fahrt? Solange das gilt, darf sich die Seite nicht neu laden. */
let fahrt = false

export function fahrtLaeuft(): boolean {
  return fahrt
}

export function fahrtMelden(laeuft: boolean): void {
  fahrt = laeuft
}

export function mieteMerken(stationId: string, seit: number): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ stationId, seit }))
  } catch {
    // Kein Speicher (privater Modus, volles Kontingent) — dann eben nicht.
  }
}

export function mieteBeenden(): void {
  try {
    localStorage.removeItem(SCHLUESSEL)
  } catch {
    // s. o.
  }
}

/** Gespeicherte Ausleihe lesen und prüfen. `jetzt` ist einsetzbar für Prüfungen. */
export function laufendeMiete(jetzt = Date.now()): Miete | null {
  let roh: string | null = null
  try {
    roh = localStorage.getItem(SCHLUESSEL)
  } catch {
    return null
  }
  if (!roh) return null
  try {
    const m = JSON.parse(roh) as Partial<Miete>
    if (typeof m?.stationId !== 'string' || !m.stationId) return null
    if (typeof m?.seit !== 'number' || !Number.isFinite(m.seit)) return null
    // Ein Beginn in der Zukunft heißt: die Uhr des Geräts wurde verstellt.
    // Damit lässt sich nicht rechnen.
    if (m.seit > jetzt) return null
    if (jetzt - m.seit > MAX_ALTER_MS) return null
    return { stationId: m.stationId, seit: m.seit }
  } catch {
    return null
  }
}

/**
 * Beginn der Ausleihe für eine bestimmte Station — oder `null`.
 *
 * Die Station muss übereinstimmen: sonst liefe nach einem Neustart die Uhr
 * einer alten Ausleihe an einer ganz anderen Station weiter.
 */
export function mieteBeginnFuer(stationId: string | null | undefined, jetzt = Date.now()): number | null {
  if (!stationId) return null
  const m = laufendeMiete(jetzt)
  return m && m.stationId === stationId ? m.seit : null
}
