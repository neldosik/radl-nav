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

/** Gewünschter Takt der Standortmeldungen in der Hülle. */
const WUNSCH_TAKT_MS = 1000

/**
 * Beobachteter Abstand zwischen zwei Messungen — die Diagnose zeigt ihn.
 *
 * Der angeforderte Takt sagt nichts darüber, was das Gerät tatsächlich
 * liefert; genau daran hing der Fehler mit den 15 Sekunden, und ohne diese
 * Zahl war er von außen nicht zu sehen.
 */
const taktProben: number[] = []
let letzteMessungAt = 0

function taktMerken(): void {
  const jetzt = Date.now()
  if (letzteMessungAt) {
    taktProben.push(jetzt - letzteMessungAt)
    if (taktProben.length > 20) taktProben.shift()
  }
  letzteMessungAt = jetzt
}

export function ortungsTakt(): string {
  if (!taktProben.length) return letzteMessungAt ? 'erst eine Messung' : 'noch keine Messung'
  const mittel = taktProben.reduce((a, b) => a + b, 0) / taktProben.length
  const kleinste = Math.min(...taktProben)
  return `${(mittel / 1000).toFixed(1)} s im Mittel, schnellste ${(kleinste / 1000).toFixed(1)} s (${taktProben.length + 1} Messungen)`
}

/**
 * Protokoll der Ortungsversuche — die Diagnose zeigt es an.
 *
 * Vorher stand hier nur der *letzte Fehlertext*. Wenn ein Aufruf aber gar
 * nicht zurückkommt, wird auch nie ein Fehler geschrieben: auf dem Gerät blieb
 * das Feld leer, und aus „leer" ließ sich nicht ablesen, ob die Berechtigung
 * fehlt, die Ortungsdienste aus sind oder der Anbieter einfach schweigt.
 *
 * Jetzt wird jeder Schritt festgehalten, bevor er beginnt. Bleibt einer hängen,
 * steht er als letzter im Protokoll — und genau der ist dann der Schuldige.
 */
const protokoll: string[] = []

function notiere(text: string): void {
  const zeit = new Date().toLocaleTimeString('de-DE', { hour12: false })
  protokoll.push(`${zeit} ${text}`)
  // Nur die jüngsten Einträge behalten, sonst wächst es über eine Fahrt hinweg.
  if (protokoll.length > 12) protokoll.shift()
}

function merkeFehler(text: string): void {
  notiere(text)
}

export function ortungsFehler(): string {
  return protokoll.length ? protokoll[protokoll.length - 1] : ''
}

/** Vollständiges Protokoll für die Diagnose. */
export function ortungsProtokoll(): string[] {
  return [...protokoll]
}

/** Stand der Ortungsberechtigung — für die Diagnose. */
export async function berechtigungsStand(): Promise<string> {
  if (!istNativ()) {
    try {
      const st = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      return `web ${st?.state ?? 'unbekannt'}`
    } catch {
      return 'web unbekannt'
    }
  }
  try {
    const Geolocation = await nativesPlugin()
    const st = await mitFrist(Geolocation.checkPermissions(), 5000, 'checkPermissions')
    return `location=${st.location} coarse=${st.coarseLocation}`
  } catch (e) {
    return `Abfrage fehlgeschlagen: ${(e as Error)?.message ?? e}`
  }
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  Plugins?: Record<string, unknown>
}

/** Läuft die App in der nativen Hülle? */
export function istNativ(): boolean {
  const cap = (window as { Capacitor?: CapacitorGlobal }).Capacitor
  return !!cap?.isNativePlatform?.()
}

type GeoPlugin = typeof import('@capacitor/geolocation')['Geolocation']

/**
 * Zugang zum Ortungs-Plugin.
 *
 * **Zuerst das, was schon im Fenster hängt.** Die Hülle registriert ihre
 * Plugins unter `Capacitor.Plugins`, bevor die Seite überhaupt lädt — die
 * Diagnose listet „Geolocation" ja auch auf. Der npm-Import derselben Sache
 * ist dagegen ein eigener nachzuladender Brocken (`esm-*.js`), und genau der
 * war der Hänger: `await nativesPlugin()` steht vor allen Fristen, also wurde
 * bei einem stockenden Nachladen nie ein Fehler geschrieben. Auf dem Gerät sah
 * man deshalb 35 Sekunden Stille und ein leeres Fehlerfeld.
 *
 * Der Import bleibt als zweiter Weg — mit Frist, damit auch er sich meldet.
 */
async function nativesPlugin(): Promise<GeoPlugin> {
  const ausFenster = (window as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins?.Geolocation
  if (ausFenster) {
    notiere('Plugin aus Capacitor.Plugins')
    return ausFenster as GeoPlugin
  }
  notiere('Plugin wird nachgeladen …')
  const mod = await mitFrist(import('@capacitor/geolocation'), 8000, 'import(@capacitor/geolocation)')
  notiere('Plugin nachgeladen')
  return mod.Geolocation
}

export interface Watch {
  stop: () => void
}

/**
 * Eine Zusage mit eigener Frist versehen.
 *
 * Die `timeout`-Angabe der Ortung wird auf der Android-Seite nicht
 * durchgesetzt: bleibt der Ortungsanbieter stumm, kehrt die Zusage weder
 * zurück noch wirft sie. Ohne eigene Frist wartet die App ewig — und weil kein
 * Fehler entsteht, bleibt auch das Diagnosefeld leer.
 */
function mitFrist<T>(p: Promise<T>, ms: number, was: string): Promise<T> {
  return new Promise<T>((ok, ab) => {
    const id = setTimeout(() => ab(new Error(`${was}: keine Antwort binnen ${Math.round(ms / 1000)} s`)), ms)
    p.then(
      w => {
        clearTimeout(id)
        ok(w)
      },
      e => {
        clearTimeout(id)
        ab(e)
      },
    )
  })
}

/**
 * Ersten Fix aus einer laufenden Verfolgung nehmen und wieder abmelden.
 *
 * Auf Android geht `watchPosition` einen anderen Weg durch den Ortungsanbieter
 * als die einmalige Abfrage und liefert häufig noch eine Messung, wo jene
 * hängen bleibt.
 */
function ersterFixAusWatch(ms: number): Promise<{ lat: number; lon: number }> {
  return new Promise((ok, ab) => {
    let fertig = false
    const w = watchPosition(
      f => {
        if (fertig) return
        fertig = true
        w.stop()
        clearTimeout(id)
        ok({ lat: f.lat, lon: f.lon })
      },
      grund => {
        if (fertig) return
        fertig = true
        w.stop()
        clearTimeout(id)
        ab(new Error(grund))
      },
      { highAccuracy: false, minIntervalMs: 500 },
    )
    const id = setTimeout(() => {
      if (fertig) return
      fertig = true
      w.stop()
      ab(new Error(`keine Antwort binnen ${Math.round(ms / 1000)} s`))
    }, ms)
  })
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
  // Untergrenze bewusst unter dem Wunschtakt: liefert der Anbieter einmal
  // schneller, wird die Messung durchgereicht statt verworfen. Mehr Messungen
  // heißt weniger zu überbrücken für die Glättung in der Karte.
  const { highAccuracy = true, minIntervalMs = 500 } = opts

  if (!istNativ()) {
    if (!navigator.geolocation) {
      onError('lost')
      return { stop: () => {} }
    }
    const id = navigator.geolocation.watchPosition(
      p => (
        taktMerken(),
        onFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy ?? undefined,
          heading: p.coords.heading ?? undefined,
          speed: p.coords.speed ?? undefined,
          at: Date.now(),
        })
      ),
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
  let webWatchId: number | null = null
  let beendet = false
  let kamSchonEinFix = false
  /**
   * Wachhund: bleibt der Anbieter stumm, meldet sich das Plugin weder mit
   * einer Messung noch mit einem Fehler. Die Navigation stand dann ohne
   * Position da und zeigte nichts an, was darauf hingewiesen hätte.
   */
  const wachhund = setTimeout(() => {
    if (beendet || kamSchonEinFix) return
    merkeFehler('keine Messung binnen 25 s — Ortung am Gerät aus?')
    onError('lost')
  }, 25000)

  ;(async () => {
    try {
      // Auch hier mit Frist: bleibt das Plugin aus, fällt die Verfolgung auf
      // den Browserweg zurück, statt still gar nichts zu tun.
      let Geolocation: GeoPlugin
      try {
        Geolocation = await mitFrist(nativesPlugin(), 10000, 'Plugin holen')
      } catch (e) {
        merkeFehler(`Plugin nicht erreichbar: ${(e as Error)?.message ?? e}`)
        if (beendet || !navigator.geolocation) {
          onError('lost')
          return
        }
        notiere('verfolge über die Browser-Ortung')
        const webId = navigator.geolocation.watchPosition(
          pos =>
            onFix({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? undefined,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              at: Date.now(),
            }),
          err => {
            merkeFehler(`web ${err.code}: ${err.message}`)
            onError(err.code === err.PERMISSION_DENIED ? 'denied' : 'lost')
          },
          { enableHighAccuracy: highAccuracy, maximumAge: 0, timeout: 15000 },
        )
        webWatchId = webId
        return
      }
      // Das vorgeschaltete Fragen darf den Rest nicht aufhalten. Die
      // Android-Seite des Plugins schickt `requestPermissions` durch eine
      // Prüfung der Ortungsdienste und weist es ab, sobald die am Gerät aus
      // sind — mit `await` ohne eigenen Fang endete hier der ganze Vorgang,
      // ohne dass je ein Dialog erschien. `watchPosition` fragt selbst nach,
      // wenn nötig; dieser Aufruf holt den Dialog nur früher.
      try {
        // Mit Frist: hängt der Dialog oder antwortet die Hülle nicht, stand
        // die Anmeldung vorher endlos hier fest und die Karte bekam nie eine
        // Position — ohne jede Meldung.
        const erlaubnis = await mitFrist(Geolocation.requestPermissions(), 30000, 'requestPermissions')
        if (erlaubnis.location === 'denied' && erlaubnis.coarseLocation === 'denied') {
          merkeFehler('Berechtigung abgelehnt')
          onError('denied')
          return
        }
      } catch (e) {
        merkeFehler(`requestPermissions: ${(e as Error)?.message ?? e}`)
      }
      if (beendet) return
      type Rueckruf = Parameters<typeof Geolocation.watchPosition>[1]
      const rueckruf: Rueckruf = (pos, err) => {
        if (err || !pos) {
          merkeFehler(`watch: ${err?.message ?? 'ohne Position'}`)
          onError('lost')
          return
        }
        kamSchonEinFix = true
        taktMerken()
        clearTimeout(wachhund)
        onFix({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
          heading: pos.coords.trueHeading ?? pos.coords.magneticHeading ?? pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          at: pos.timestamp ?? Date.now(),
        })
      }

      /**
       * `interval` muss mitgegeben werden.
       *
       * Steht es nicht da, setzt die Android-Seite des Plugins es auf den Wert
       * von `timeout` — bei unseren 15 Sekunden hieß das: von den Play-Diensten
       * wurde eine Messung **alle 15 Sekunden** angefordert. Schneller kam nur
       * etwas, wenn zufällig eine andere App gerade häufiger fragte. Auf dem Rad
       * sind 15 Sekunden rund achtzig Meter — der Punkt konnte gar nicht anders
       * als springen, und keine Glättung der Welt hilft gegen fehlende Messungen.
       *
       * `interval` ist der Wunschtakt, `minimumUpdateInterval` die Sperre nach
       * oben: schneller als diese Grenze wird nichts durchgereicht, auch wenn
       * der Anbieter mehr hätte. Eine Sekunde Wunsch mit einer halben als
       * Untergrenze nimmt mit, was da ist, ohne den Empfänger zu fluten.
       */
      const anmelden = (genau: boolean) =>
        Geolocation.watchPosition(
          {
            enableHighAccuracy: genau,
            interval: WUNSCH_TAKT_MS,
            minimumUpdateInterval: minIntervalMs,
            timeout: 15000,
          },
          rueckruf,
        )

      // Zweiter Anlauf ohne hohe Genauigkeit, falls am Gerät nur der ungefähre
      // Ort freigegeben ist — dieselbe Weiche wie bei der einmaligen Ortung.
      try {
        watchId = await anmelden(highAccuracy)
      } catch (e) {
        merkeFehler(`watchPosition(genau): ${(e as Error)?.message ?? e}`)
        if (!highAccuracy) throw e
        watchId = await anmelden(false)
      }
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
      clearTimeout(wachhund)
      // Beim Ausweichen auf die Browser-Ortung hängt die Verfolgung dort
      if (webWatchId != null) {
        navigator.geolocation.clearWatch(webWatchId)
        webWatchId = null
      }
      if (!watchId) return
      const id = watchId
      watchId = null
      nativesPlugin()
        .then(G => G.clearWatch({ id }))
        .catch(() => {})
    },
  }
}

/**
 * Einmalige Ortung.
 *
 * Nativ in zwei Anläufen, und beide Male mit `maximumAge`. Ohne diesen Wert
 * steht in der Android-Seite des Plugins die 0 aus der Voreinstellung — dann
 * zählt keine vorhandene Messung, es muss eine frische her. In geschlossenen
 * Räumen dauert das lang oder gelingt gar nicht, und der Aufruf lief in die
 * Frist statt eine zwei Minuten alte Messung zu nehmen, die für „wo bin ich"
 * völlig ausreicht.
 *
 * Der zweite Anlauf ohne hohe Genauigkeit ist für den häufigen Fall, dass am
 * Gerät nur der ungefähre Ort freigegeben ist: ab Android 12 wählt das Plugin
 * die Berechtigung nach genau diesem Schalter aus, verlangt mit hoher
 * Genauigkeit die genaue Freigabe — und bekommt eine Absage, obwohl die
 * ungefähre erteilt ist und für den Anfang genügt.
 */
export async function currentPosition(): Promise<{ lat: number; lon: number }> {
  if (istNativ()) {
    notiere('Ortung startet (nativ)')
    let Geolocation: GeoPlugin
    try {
      Geolocation = await mitFrist(nativesPlugin(), 10000, 'Plugin holen')
    } catch (e) {
      merkeFehler(`Plugin nicht erreichbar: ${(e as Error)?.message ?? e}`)
      // Ohne Plugin bleibt der Browserweg — in der WebView klappt der oft.
      notiere('weiche auf die Browser-Ortung aus')
      return webPosition()
    }

    // Erst nachsehen, ob überhaupt gefragt werden darf. Ohne das ist ein
    // Hänger von einer Absage nicht zu unterscheiden.
    try {
      const stand = await mitFrist(Geolocation.checkPermissions(), 4000, 'checkPermissions')
      if (stand.location === 'denied' && stand.coarseLocation === 'denied') {
        try {
          const gefragt = await mitFrist(Geolocation.requestPermissions(), 30000, 'requestPermissions')
          if (gefragt.location === 'denied' && gefragt.coarseLocation === 'denied') {
            merkeFehler('Berechtigung abgelehnt')
            throw new Error('Standort nicht freigegeben')
          }
        } catch (e) {
          merkeFehler(`requestPermissions: ${(e as Error)?.message ?? e}`)
        }
      }
    } catch (e) {
      merkeFehler(`checkPermissions: ${(e as Error)?.message ?? e}`)
    }

    const versuche = [
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 },
    ]
    let letzte: unknown
    for (const opts of versuche) {
      try {
        // Eigene Frist: die `timeout`-Angabe wird auf der Android-Seite des
        // Plugins nicht durchgesetzt. Kommt vom Ortungsanbieter keine
        // Messung — Ortung am Gerät aus, Play-Dienste ohne Fix, Gerät im
        // Gebäude —, kehrt die Zusage nie zurück und wirft auch nichts. Genau
        // das war auf dem Telefon zu sehen: 35 Sekunden Stille, danach ein
        // leeres Fehlerfeld.
        const pos = await mitFrist(
          Geolocation.getCurrentPosition(opts),
          opts.timeout + 3000,
          `getCurrentPosition(genau=${opts.enableHighAccuracy})`,
        )
        return { lat: pos.coords.latitude, lon: pos.coords.longitude }
      } catch (e) {
        letzte = e
        merkeFehler(`getCurrentPosition(genau=${opts.enableHighAccuracy}): ${(e as Error)?.message ?? e}`)
      }
    }

    // Letzter Ausweg: eine laufende Verfolgung liefert auf Android oft eine
    // Messung, wo die einmalige Abfrage hängen bleibt — sie nimmt einen
    // anderen Weg durch den Anbieter. Den ersten Fix nehmen und wieder abmelden.
    try {
      return await ersterFixAusWatch(12000)
    } catch (e) {
      merkeFehler(`watch-Ausweg: ${(e as Error)?.message ?? e}`)
    }
    // Auch nativ noch der Browserweg: in der WebView führt er auf denselben
    // Anbieter, nimmt aber einen anderen Weg durch die Hülle.
    try {
      notiere('nativ erfolglos — versuche die Browser-Ortung')
      return await webPosition()
    } catch (e) {
      merkeFehler(`Browser-Ortung: ${(e as Error)?.message ?? e}`)
    }
    throw letzte ?? new Error('keine Messung')
  }
  return webPosition()
}

/** Ortung über die Browser-Schnittstelle. */
function webPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geolocation unavailable'))
    const frist = setTimeout(() => reject(new Error('web: keine Antwort in 12 s')), 12000)
    navigator.geolocation.getCurrentPosition(
      p => {
        clearTimeout(frist)
        notiere('Browser-Ortung erfolgreich')
        resolve({ lat: p.coords.latitude, lon: p.coords.longitude })
      },
      err => {
        clearTimeout(frist)
        merkeFehler(`web ${err.code}: ${err.message}`)
        reject(err)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}
