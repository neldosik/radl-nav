import { istNativ } from './geolocation'

/**
 * Kartenpuffer für die Android-Hülle.
 *
 * Im Browser puffert der Service Worker die Kacheln (siehe `public/sw.js`).
 * In der Hülle darf kein Service Worker laufen — er liefert die Seite ohne
 * die eingesetzte Capacitor-Brücke aus, siehe `main.tsx`. Damit stand
 * ausgerechnet die App, die man unterwegs dabeihat, ohne Netz vor einer
 * weißen Karte: die Stationsliste liegt gepuffert vor, der Untergrund nicht.
 *
 * Ohne Service Worker bleibt der Weg über maplibre selbst: `transformRequest`
 * hängt ein eigenes Schema vor jede Kartenadresse, und der dazu angemeldete
 * Protokoll-Zuhörer beantwortet sie aus der Cache Storage — die gibt es auch
 * ohne Worker.
 */

/** Version im Namen: ein neues Puffermuster wirft das alte weg. */
export const KACHEL_PUFFER = 'radl-huelle-kacheln-v1'

/** Eigenes Schema, das maplibre an uns statt ans Netz gibt. */
export const SCHEMA = 'radlpuffer'

/**
 * Grenzen wie im Service Worker, nur knapper: die Hülle puffert zusätzlich
 * nichts anderes, das APK liegt ohnehin auf dem Gerät.
 */
const MAX_EINTRAEGE = 500
const MAX_BYTES = 50 * 1024 * 1024
/** `cache.keys()` ist teuer — nicht nach jeder Kachel aufräumen. */
const PRUEF_INTERVALL = 40

let seitPruefung = 0
let angemeldet = false

/** Puffern lohnt nur in der Hülle; im Browser macht das der Service Worker. */
export function kachelpufferAktiv(): boolean {
  return istNativ() && typeof caches !== 'undefined'
}

/** Adressen, die zur Karte gehören und sich zu puffern lohnen. */
export function istKartenAdresse(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
  if (u.origin === window.location.origin) return false
  return (
    u.hostname.includes('openfreemap') ||
    u.hostname.includes('openstreetmap') ||
    u.pathname.includes('/tiles/') ||
    u.pathname.endsWith('.pbf') ||
    u.pathname.endsWith('.png') ||
    u.pathname.endsWith('.json')
  )
}

/**
 * Für `new maplibregl.Map({ transformRequest })`: Kartenadressen auf das
 * eigene Schema umbiegen, alles andere unverändert lassen.
 */
export function kartenAnfrage(url: string): { url: string } | undefined {
  if (!kachelpufferAktiv() || !istKartenAdresse(url)) return undefined
  return { url: `${SCHEMA}://${url}` }
}

/** Die echte Adresse aus `radlpuffer://https://…` zurückholen. */
export function echteAdresse(url: string): string {
  return url.startsWith(`${SCHEMA}://`) ? url.slice(SCHEMA.length + 3) : url
}

type Antwortart = 'json' | 'arrayBuffer' | 'image' | 'string' | undefined

async function ausAntwort(res: Response, art: Antwortart): Promise<unknown> {
  if (art === 'json') return res.json()
  if (art === 'string') return res.text()
  if (art === 'image') return createImageBitmap(await res.blob())
  return res.arrayBuffer()
}

/**
 * Älteste Einträge wegwerfen, sobald Anzahl oder Größe über der Grenze liegen.
 * Cache Storage liefert die Schlüssel in Ablagereihenfolge.
 */
async function aufraeumen(cache: Cache): Promise<void> {
  if (++seitPruefung < PRUEF_INTERVALL) return
  seitPruefung = 0
  const keys = await cache.keys()
  if (keys.length > MAX_EINTRAEGE) {
    await Promise.all(keys.slice(0, keys.length - MAX_EINTRAEGE).map(k => cache.delete(k)))
    return
  }
  let summe = 0
  const groessen: number[] = []
  for (const k of keys) {
    const r = await cache.match(k)
    const n = Number(r?.headers.get('content-length') ?? 0)
    groessen.push(n)
    summe += n
  }
  for (let i = 0; i < keys.length && summe > MAX_BYTES; i++) {
    await cache.delete(keys[i])
    summe -= groessen[i]
  }
}

/**
 * Puffer zuerst, Netz danach — und bei fehlendem Netz der Puffer als Rettung.
 *
 * Frisch aufgefrischt wird nur, was noch nicht im Puffer liegt: Kartenkacheln
 * ändern sich in Monaten, und unterwegs ist jede vermiedene Anfrage Akku und
 * Datenvolumen. Der Stil kommt bei jedem Start neu aus dem Netz, solange es
 * eines gibt (`no-store` greift nicht, deshalb erst Netz für JSON).
 */
export async function ladeMitPuffer(
  url: string,
  art: Antwortart,
  netz: typeof fetch = (...a) => fetch(...a),
  puffer: () => Promise<Cache> = () => caches.open(KACHEL_PUFFER),
): Promise<{ data: unknown }> {
  const echt = echteAdresse(url)
  const cache = await puffer()
  const gepuffert = await cache.match(echt)
  const netzZuerst = art === 'json'

  if (gepuffert && !netzZuerst) return { data: await ausAntwort(gepuffert.clone(), art) }

  try {
    const res = await netz(echt)
    if (res.ok) {
      await cache.put(echt, res.clone())
      await aufraeumen(cache)
      return { data: await ausAntwort(res, art) }
    }
    if (gepuffert) return { data: await ausAntwort(gepuffert.clone(), art) }
    throw new Error(`${res.status} für ${echt}`)
  } catch (e) {
    if (gepuffert) return { data: await ausAntwort(gepuffert.clone(), art) }
    throw e
  }
}

type Anmelden = (
  schema: string,
  lader: (p: { url: string; type?: string }) => Promise<{ data: unknown }>,
) => void

/**
 * Einmalig das eigene Schema bei maplibre anmelden. `addProtocol` wird
 * übergeben statt importiert, damit dieses Modul nicht den ganzen
 * Kartenbrocken in den Einstieg zieht.
 */
export function kachelpufferEinrichten(anmelden: Anmelden): void {
  if (angemeldet || !kachelpufferAktiv()) return
  angemeldet = true
  anmelden(SCHEMA, p => ladeMitPuffer(p.url, p.type as Antwortart))
}

/** Nur für Tests: den Anmeldezustand zurücksetzen. */
export function kachelpufferZuruecksetzen(): void {
  angemeldet = false
  seitPruefung = 0
}
