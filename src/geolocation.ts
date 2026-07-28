/**
 * Standortquelle — nativ in der App-Hülle, sonst der Browser.
 *
 * In der Android-Hülle liefert `@capacitor/geolocation` den Weg über die
 * Google-Play-Dienste statt der Browser-Schnittstelle. Das bringt drei Dinge,
 * die im Web nicht zu haben sind: eine eigene Taktung der Aktualisierungen,
 * eine verlässliche Blickrichtung und den Rückfall auf den `LocationManager`,
 * falls die Play-Dienste fehlen.
 *
 * Was auch nativ nicht geht: Standort im Hintergrund (dafür bräuchte es einen
 * Vordergrunddienst) und Koppelnavigation über die Bewegungssensoren — der
 * Anbieter gibt fertige Koordinaten heraus, keine Rohdaten.
 */

export interface Fix {
  lat: number
  lon: number
  accuracy?: number
  /** Blickrichtung in Grad, 0 = Norden. Im Web meist leer. */
  heading?: number
  /** Geschwindigkeit in m/s, falls das Gerät sie liefert. */
  speed?: number
  at: number
}

type Fehler = 'denied' | 'lost'

/**
 * Letzter Fehlertext der Ortung — die Diagnose zeigt ihn an.
 *
 * Ohne das blieb von jedem Fehlschlag nur „lost" übrig. Auf einem fremden
 * Gerät ist damit nicht zu unterscheiden, ob die Berechtigung fehlt, die
 * Ortungsdienste aus sind oder das Plugin gar nicht erst geladen hat.
 */
let letzterFehler = ''

function merkeFehler(text: string): void {
  letzterFehler = text
}

export function ortungsFehler(): string {
  return letzterFehler
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
}

/** Läuft die App in der nativen Hülle? */
export function istNativ(): boolean {
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/** Modul der Hülle nachladen; im Web wird es nie angefasst. */
async function nativesPlugin() {
  const mod = await import('@capacitor/geolocation')
  return mod.Geolocation
}

export interface Watch {
  stop: () => void
}

/**
 * Standort verfolgen. Ruft `onFix` bei jeder Messung, `onError` bei Ausfall.
 *
 * Die Rückgabe steht sofort — die native Anmeldung läuft asynchron nach und
 * wird beim Beenden mit abgeräumt, auch wenn sie da noch gar nicht stand.
 */
export function watchPosition(
  onFix: (f: Fix) => void,
  onError: (e: Fehler) => void,
  opts: { highAccuracy?: boolean; minIntervalMs?: number } = {},
): Watch {
  const { highAccuracy = true, minIntervalMs = 1000 } = opts

  if (!istNativ()) {
    if (!navigator.geolocation) {
      onError('lost')
      return { stop: () => {} }
    }
    const id = navigator.geolocation.watchPosition(
      p =>
        onFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy ?? undefined,
          heading: p.coords.heading ?? undefined,
          speed: p.coords.speed ?? undefined,
          at: Date.now(),
        }),
      err => {
        merkeFehler(`web ${err.code}: ${err.message}`)
        onError(err.code === err.PERMISSION_DENIED ? 'denied' : 'lost')
      },
      // maximumAge 0: im Fahrbetrieb ist ein drei Sekunden alter Fix wertlos.
      { enableHighAccuracy: highAccuracy, maximumAge: 0, timeout: 15000 },
    )
    return { stop: () => navigator.geolocation.clearWatch(id) }
  }

  let watchId: string | null = null
  let beendet = false

  ;(async () => {
    try {
      const Geolocation = await nativesPlugin()
      // Das vorgeschaltete Fragen darf den Rest nicht aufhalten. Die
      // Android-Seite des Plugins schickt `requestPermissions` durch eine
      // Prüfung der Ortungsdienste und weist es ab, sobald die am Gerät aus
      // sind — mit `await` ohne eigenen Fang endete hier der ganze Vorgang,
      // ohne dass je ein Dialog erschien. `watchPosition` fragt selbst nach,
      // wenn nötig; dieser Aufruf holt den Dialog nur früher.
      try {
        const erlaubnis = await Geolocation.requestPermissions()
        if (erlaubnis.location === 'denied' && erlaubnis.coarseLocation === 'denied') {
          merkeFehler('Berechtigung abgelehnt')
          onError('denied')
          return
        }
      } catch (e) {
        merkeFehler(`requestPermissions: ${(e as Error)?.message ?? e}`)
      }
      if (beendet) return
      watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: highAccuracy, minimumUpdateInterval: minIntervalMs, timeout: 15000 },
        (pos, err) => {
          if (err || !pos) {
            merkeFehler(`watch: ${err?.message ?? 'ohne Position'}`)
            onError('lost')
            return
          }
          onFix({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? undefined,
            heading: pos.coords.trueHeading ?? pos.coords.magneticHeading ?? pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
            at: pos.timestamp ?? Date.now(),
          })
        },
      )
      // Zwischen `await` und hier kann bereits gestoppt worden sein
      if (beendet && watchId) {
        const G = await nativesPlugin()
        G.clearWatch({ id: watchId }).catch(() => {})
      }
    } catch (e) {
      merkeFehler(`watchPosition: ${(e as Error)?.message ?? e}`)
      onError('lost')
    }
  })()

  return {
    stop: () => {
      beendet = true
      if (!watchId) return
      const id = watchId
      watchId = null
      nativesPlugin()
        .then(G => G.clearWatch({ id }))
        .catch(() => {})
    },
  }
}

/** Einmalige Ortung. */
export async function currentPosition(): Promise<{ lat: number; lon: number }> {
  if (istNativ()) {
    try {
      const Geolocation = await nativesPlugin()
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      return { lat: pos.coords.latitude, lon: pos.coords.longitude }
    } catch (e) {
      merkeFehler(`getCurrentPosition: ${(e as Error)?.message ?? e}`)
      throw e
    }
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocation unavailable'))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}
