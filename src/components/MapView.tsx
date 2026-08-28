import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { legKind } from '../format'
import { legPath } from '../routing'
import { bearing, bearingDelta, haversine, nachziehAnteil, nachziehen, planPickup, projectOnPath, smoothBearing } from '../geo'
import { kompassStarten } from '../kompass'
import { addCycleLayer, addRouteLayers, mapStyleUrl, routeColors } from '../mapStyle'
import type { ThemeMode } from '../mapStyle'
import type { ItineraryView, Leg } from '../types'

/** Bis zu diesem Abstand gilt der Standort als „auf der Route" und wird auf
 *  die Linie gezogen. Darüber bleibt der rohe Fix stehen — wer wirklich falsch
 *  abgebogen ist, soll das sehen und nicht auf die Route gebeamt werden. */
const SNAP_MAX_M = 40

// Linienfarbe der Etappe — je nach Theme, damit sie auf dunkler Karte sichtbar bleibt
function legColor(leg: Leg, theme: ThemeMode): string {
  const c = routeColors(theme)
  const k = legKind(leg)
  if (k === 'bike') return c.bike
  if (k === 'walk') return c.walk
  return c.transit
}

/**
 * Kamera-Nachführung im Los-Modus. GPS auf dem Rad rauscht: im Stand springt
 * die Position um 5–15 m. Vorher löste jeder Fix ein `easeTo` aus, das die
 * laufende Animation abbrach und neu startete — das war das gemeldete Zucken.
 * Jetzt: Totband, höchstens eine Kamerafahrt zur Zeit, harter Sprung bei
 * großen Abständen (Tunnelausfahrt, erster Fix).
 */
const CAM_JUMP_M = 300

/**
 * Zwischenschritte zwischen zwei Messungen.
 *
 * Der Standort kommt etwa im Sekundentakt. Wer ihn direkt setzt, versetzt den
 * Punkt einmal je Sekunde um mehrere Meter — das war das gemeldete Springen.
 * Kartendienste zeigen stattdessen eine *nachlaufende* Position, die sich Bild
 * für Bild auf die zuletzt gemessene zubewegt; dadurch gleitet der Punkt.
 *
 * Die Zeitkonstante ist die Dauer, in der rund zwei Drittel des Rückstands
 * abgebaut werden. Deutlich kürzer als der Messtakt wirkt wieder ruckelig,
 * deutlich länger läuft der Punkt der Wirklichkeit hinterher.
 */
const POS_TAU_MS = 420
const KURS_TAU_MS = 500
/** Unter diesem Rest gilt die Nachführung als angekommen und pausiert. */
const RUHE_M = 0.3
const RUHE_GRAD = 0.3
/** Ab so vielen Metern taugen zwei Messungen als Richtungsgeber. */
const KURS_MIN_MOVE_M = 8
/** Wie stark ein neuer Kurs durchschlägt — kleiner heißt ruhiger. */
const KURS_ANTEIL = 0.3

interface Props {
  view: ItineraryView | null
  activeLeg?: number | null
  userPos?: { lat: number; lon: number; accuracy?: number; heading?: number; speed?: number } | null
  bikesNeeded?: number
  theme?: ThemeMode
  /** Radwege-Ebene einblenden */
  cycleLayer?: boolean
  /** Kamera folgt dem Standort (Los-Modus) */
  follow?: boolean
  /** Karte in Fahrtrichtung drehen statt genordet lassen */
  headUp?: boolean
  /** Nutzer hat die Karte selbst verschoben — Folgen aussetzen */
  onUserPan?: () => void
}

export default function MapView({
  view,
  activeLeg = null,
  userPos = null,
  bikesNeeded = 1,
  theme = 'light',
  cycleLayer = false,
  follow = true,
  headUp = false,
  onUserPan,
}: Props) {
  const div = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const userPosRef = useRef<{ lat: number; lon: number } | null>(null)
  const prevCamPosRef = useRef<{ lat: number; lon: number } | null>(null)
  /** Zuletzt gemessene Position — dorthin läuft die Anzeige. */
  const zielPosRef = useRef<{ lat: number; lon: number } | null>(null)
  /** Gerade angezeigte Position — sie gleitet dem Ziel nach. */
  const zeigePosRef = useRef<{ lat: number; lon: number } | null>(null)
  const zeigeKursRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const rafZeitRef = useRef(0)
  /** Blickrichtung aus dem Magnetfeldsensor, falls das Gerät sie liefert. */
  const sensorKursRef = useRef<number | null>(null)
  /** Geschwindigkeit der letzten Messung — entscheidet Kurs oder Sensor. */
  const tempoRef = useRef(0)
  /** Zuletzt gezeigter Kurs — von dort wird sanft weitergedreht. */
  const kursRef = useRef<number | null>(null)
  /** Letzte Position, aus der ein Kurs abgeleitet wurde. */
  const kursVonRef = useRef<{ lat: number; lon: number } | null>(null)
  const headUpRef = useRef(false)
  headUpRef.current = headUp
  const ready = useRef(false)
  const viewRef = useRef<ItineraryView | null>(null)
  const activeLegRef = useRef<number | null>(null)
  const followRef = useRef(true)
  followRef.current = follow
  const onUserPanRef = useRef(onUserPan)
  onUserPanRef.current = onUserPan
  const bikesRef = useRef(bikesNeeded)
  bikesRef.current = bikesNeeded
  const cycleRef = useRef(cycleLayer)
  cycleRef.current = cycleLayer
  const themeRef = useRef(theme)
  themeRef.current = theme

  function clear() {
    const m = map.current
    if (!m) return
    ;(m.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [],
    })
    markers.current.forEach(mk => mk.remove())
    markers.current = []
  }

  function draw(v: ItineraryView, active: number | null) {
    const m = map.current
    if (!m) return

    const features = v.it.legs.map((leg, idx) => {
      // Eine Quelle für Zeichnen, Fangen und Restzeit — inklusive des letzten
      // Stücks zur Rückgabestation (siehe legPath).
      const coords: [number, number][] = legPath(v, idx).map(p => [p.lon, p.lat])
      return {
        type: 'Feature' as const,
        properties: {
          color: legColor(leg, themeRef.current),
          dash: leg.mode === 'WALK',
          dim: active != null && idx !== active,
        },
        geometry: { type: 'LineString' as const, coordinates: coords },
      }
    })
    ;(m.getSource('route') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    })

    markers.current.forEach(mk => mk.remove())
    markers.current = []
    const add = (lon: number, lat: number, html: string, cls: string) => {
      const el = document.createElement('div')
      el.className = `mk ${cls}`
      el.innerHTML = html
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(m))
    }
    const legs = v.it.legs
    add(legs[0].from.lon, legs[0].from.lat, 'A', 'mk-a')
    add(legs[legs.length - 1].to.lon, legs[legs.length - 1].to.lat, 'B', 'mk-b')
    for (const [i, info] of v.bikeLegs) {
      const leg = legs[i]
      if (bikesRef.current > 1) {
        // Gruppe: Zeige, wie viele Räder wo geholt werden
        const pk = planPickup(info.nearby, info.electric, bikesRef.current)
        for (const p of pk.picks) add(p.station.lon, p.station.lat, `${p.take}`, 'mk-bike')
      } else if (info.startStation) {
        add(leg.from.lon, leg.from.lat, `${info.startStation.bikes}`, 'mk-bike')
      }
      // „P" gehört an die Station, nicht an den MOTIS-Abstellpunkt — der lag
      // bei freistehenden Rädern bis zu 300 m daneben.
      if (info.endStation) {
        add(info.endStation.lon, info.endStation.lat, 'P', 'mk-bike')
      }
    }

    if (active != null) {
      // Navigation: Straßen-Zoom, Zentrierung auf Benutzer (oder Etappenstart, falls noch kein GPS)
      const leg = v.it.legs[active]
      const center: [number, number] = userPosRef.current
        ? [userPosRef.current.lon, userPosRef.current.lat]
        : [leg.from.lon, leg.from.lat]
      // Beim Etappenwechsel den selbst gewählten Zoom behalten; nur aus der
      // Übersicht heraus auf Straßenniveau gehen.
      const zoom = m.getZoom() < 15 ? 16.5 : m.getZoom()
      m.easeTo({ center, zoom, duration: 500, essential: true })
      prevCamPosRef.current = userPosRef.current ?? { lat: leg.from.lat, lon: leg.from.lon }
    } else {
      // Übersicht der Route. Die Vorschaukarte ist nur ~150 px hoch — mit großem
      // Rand bliebe fast nichts übrig und die Karte zoomte auf ganz München heraus.
      const bounds = new maplibregl.LngLatBounds()
      for (const f of features) for (const c of f.geometry.coordinates) bounds.extend(c)
      const pad = Math.max(12, Math.min(40, Math.round(m.getContainer().clientHeight * 0.12)))
      if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: pad, maxZoom: 16.5, duration: 500 })
    }
  }

  useEffect(() => {
    if (!div.current || map.current) return
    const m = new maplibregl.Map({
      container: div.current,
      style: mapStyleUrl(themeRef.current),
      center: [11.575, 48.137],
      zoom: 11.5,
      attributionControl: { compact: true },
    })
    m.on('load', () => {
      addRouteLayers(m, themeRef.current)
      addCycleLayer(m, cycleRef.current)
      ready.current = true
      if (viewRef.current) draw(viewRef.current, activeLegRef.current)
    })
    // Eigenes Ziehen/Zoomen erkennen (nicht die programmierten Kamerafahrten)
    const handPan = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && activeLegRef.current != null && followRef.current) onUserPanRef.current?.()
    }
    m.on('dragstart', handPan)
    m.on('zoomstart', handPan)
    map.current = m

    // Aufräumen ist hier keine Kür: Eine maplibre-Karte hält einen
    // WebGL-Kontext, Worker, Kachelpuffer und Fenster-Listener fest. App.tsx
    // gibt je nach Ansicht völlig verschiedene Bäume zurück (Los-Modus,
    // Reiter Räder, Reiter Fahrten, Trefferliste), MapView wird also bei jedem
    // Wechsel ausgehängt und neu eingehängt — nicht bloß neu gerendert.
    // Ohne dieses `remove()` blieb jede alte Karte samt Kontext liegen; ein
    // Browser gibt nur eine Handvoll WebGL-Kontexte her, danach bleibt die
    // Karte leer. BikeMap und MapPicker machen es seit jeher richtig.
    return () => {
      markers.current.forEach(mk => mk.remove())
      markers.current = []
      userMarker.current?.remove()
      userMarker.current = null
      m.off('dragstart', handPan)
      m.off('zoomstart', handPan)
      m.remove()
      map.current = null
      ready.current = false
      prevCamPosRef.current = null
      zeigePosRef.current = null
      zielPosRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Theme-Wechsel: Kartenstil tauschen und eigene Layer neu anlegen
  // (setStyle entfernt sie), danach Route erneut zeichnen.
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    m.setStyle(mapStyleUrl(theme))
    m.once('styledata', () => {
      addRouteLayers(m, theme)
      addCycleLayer(m, cycleRef.current)
      if (viewRef.current) draw(viewRef.current, activeLegRef.current)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  useEffect(() => {
    viewRef.current = view
    activeLegRef.current = activeLeg
    if (!ready.current) return
    if (view) draw(view, activeLeg)
    else clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeLeg])

  /**
   * Pfeil im Standortpunkt ausrichten.
   *
   * Gezeigt wird die Blickrichtung *abzüglich* der Kartendrehung. Auf der
   * genordeten Karte ist das die Himmelsrichtung, auf der mitdrehenden steht
   * der Pfeil dadurch von selbst aufrecht — ohne Sonderfall für beide Modi.
   *
   * Vorrang hat der Sensor: nur er ändert sich, wenn man das Telefon in der
   * Hand dreht, ohne zu fahren.
   */
  function pfeilDrehen() {
    const el = userMarker.current?.getElement()
    if (!el) return
    const kopf = sensorKursRef.current ?? kursRef.current
    if (kopf == null) return
    const karte = map.current?.getBearing() ?? 0
    el.style.setProperty('--kurs', `${(((kopf - karte) % 360) + 360) % 360}deg`)
    el.classList.add('hat-kurs')
  }

  /** Welche Richtung die Karte oben zeigen soll. */
  function zielKurs(): number | null {
    // In Fahrt führt der Kurs über Grund: er ist ruhiger und lässt sich von
    // Metall am Lenker nicht stören. Im Stand gibt es ihn nicht — dann zählt
    // der Sensor, und nur so wirkt sich das Drehen des Telefons aus.
    const faehrt = tempoRef.current >= 1.5
    if (faehrt && kursRef.current != null) return kursRef.current
    return sensorKursRef.current ?? kursRef.current
  }

  /**
   * Ein Bild der Nachführung: Anzeigeposition und Kartendrehung rücken ein
   * Stück auf ihre Ziele zu.
   *
   * Die Schleife hält sich selbst an, sobald nichts mehr nachzuziehen ist, und
   * wird von der nächsten Messung wieder angestoßen — ein Dauerlauf über die
   * ganze Fahrt wäre unnötiger Stromverbrauch.
   */
  function schritt(jetzt: number) {
    rafRef.current = null
    const m = map.current
    if (!m) return
    const dt = Math.min(120, jetzt - rafZeitRef.current || 16)
    rafZeitRef.current = jetzt

    let weiter = false

    const ziel = zielPosRef.current
    let zeige = zeigePosRef.current
    if (ziel) {
      if (!zeige || haversine(zeige, ziel) > CAM_JUMP_M) {
        // Erster Fix oder echter Sprung (Tunnelausfahrt): nicht hingleiten.
        zeige = { ...ziel }
      } else {
        zeige = nachziehen(zeige, ziel, nachziehAnteil(dt, POS_TAU_MS))
        if (haversine(zeige, ziel) > RUHE_M) weiter = true
        else zeige = { ...ziel }
      }
      zeigePosRef.current = zeige
      userMarker.current?.setLngLat([zeige.lon, zeige.lat])
      if (activeLegRef.current != null && followRef.current) m.setCenter([zeige.lon, zeige.lat])
    }

    if (headUpRef.current) {
      const kz = zielKurs()
      if (kz != null) {
        const alt = zeigeKursRef.current
        const neu = smoothBearing(alt, kz, nachziehAnteil(dt, KURS_TAU_MS))
        zeigeKursRef.current = neu
        m.setBearing(neu)
        pfeilDrehen()
        if (alt == null || Math.abs(bearingDelta(neu, kz)) > RUHE_GRAD) weiter = true
      }
    }

    if (weiter) rafRef.current = requestAnimationFrame(schritt)
  }

  /** Nachführung anstoßen, falls sie gerade ruht. */
  function nachfuehren() {
    if (rafRef.current != null) return
    rafZeitRef.current = performance.now()
    rafRef.current = requestAnimationFrame(schritt)
  }

  /**
   * „Zentrieren" gedrückt: ohne Umweg hin. Die gleitende Nachführung wäre hier
   * falsch — wer den Knopf drückt, will sofort etwas sehen.
   */
  function followUser(pos: { lat: number; lon: number }) {
    const m = map.current
    if (!m) return
    prevCamPosRef.current = pos
    zeigePosRef.current = { ...pos }
    userMarker.current?.setLngLat([pos.lon, pos.lat])
    const kurs = headUpRef.current ? zielKurs() : null
    m.easeTo({
      center: [pos.lon, pos.lat],
      ...(kurs != null ? { bearing: kurs } : {}),
      duration: 400,
      essential: true,
    })
    if (kurs != null) zeigeKursRef.current = kurs
  }

  /**
   * Fahrtrichtung bestimmen.
   *
   * Der Standortanbieter liefert `heading` nur, solange man sich bewegt, und
   * im Web meist gar nicht. Fehlt sie, wird sie aus zwei Messungen berechnet —
   * aber erst ab einem Stück Weg, sonst dreht das GPS-Rauschen im Stand die
   * Karte im Kreis. Das Ergebnis wird nachgezogen statt gesetzt.
   */
  function kursAktualisieren(pos: { lat: number; lon: number; heading?: number; speed?: number }) {
    const inBewegung = (pos.speed ?? 0) >= 0.8
    let roh: number | null = null

    if (pos.heading != null && Number.isFinite(pos.heading) && inBewegung) {
      roh = pos.heading
    } else {
      const von = kursVonRef.current
      if (!von) {
        // Erster Fix: nur merken. Ohne diese Zeile bleibt der Bezugspunkt für
        // immer leer und es entsteht nie ein Kurs.
        kursVonRef.current = { lat: pos.lat, lon: pos.lon }
        return
      }
      if (haversine(von, pos) < KURS_MIN_MOVE_M) return
      roh = bearing(von, pos)
    }

    if (roh == null) return
    kursVonRef.current = { lat: pos.lat, lon: pos.lon }
    kursRef.current = smoothBearing(kursRef.current, roh, KURS_ANTEIL)
    tempoRef.current = pos.speed ?? 0
    // Der Pfeil zeigt den Kurs auf einer genordeten Karte; dreht die Karte
    // selbst mit, zeigt er immer nach oben.
    pfeilDrehen()
  }

  useEffect(() => {
    const m = map.current
    // Kartenabgleich: den rohen Fix auf die Linie der laufenden Etappe ziehen.
    // Ohne das wandert der Punkt sichtbar neben den Weg — genau der Eindruck
    // von „ungenauem GPS". Nur solange man plausibel auf der Route ist; wer
    // wirklich abgebogen ist, soll das auch sehen.
    const gezogen = (() => {
      if (!userPos || activeLegRef.current == null) return userPos
      const v = viewRef.current
      if (!v) return userPos
      const pfad = legPath(v, activeLegRef.current)
      if (pfad.length < 2) return userPos
      const pr = projectOnPath(pfad, userPos)
      if (!pr || pr.dist > SNAP_MAX_M) return userPos
      return { ...userPos, lat: pr.point.lat, lon: pr.point.lon }
    })()

    userPosRef.current = gezogen
    if (!m) return
    if (!userPos) {
      userMarker.current?.remove()
      userMarker.current = null
      prevCamPosRef.current = null
      zielPosRef.current = null
      zeigePosRef.current = null
      kursRef.current = null
      kursVonRef.current = null
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }
    if (!userMarker.current) {
      const el = document.createElement('div')
      el.className = 'mk-user'
      // Der Pfeil steckt im Marker und wird per CSS-Variable gedreht.
      el.innerHTML = '<span class="mk-user-pfeil"></span>'
      userMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([gezogen!.lon, gezogen!.lat])
        .addTo(m)
      zeigePosRef.current = { lat: gezogen!.lat, lon: gezogen!.lon }
    }
    // Nicht direkt setzen: die Schleife zieht den Punkt dorthin nach.
    zielPosRef.current = { lat: gezogen!.lat, lon: gezogen!.lon }
    // Richtung aus dem *rohen* Fix, nicht aus dem auf die Linie gezogenen:
    // das Ziehen verschiebt den Punkt quer zur Fahrt und würde den Kurs
    // verfälschen.
    kursAktualisieren(userPos)
    // Los-Modus: Kamera folgt dem Benutzer — außer er schaut sich gerade
    // selbst auf der Karte um (dann übernimmt der Folgen-Knopf).
    nachfuehren()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  /**
   * Magnetfeldsensor anmelden.
   *
   * Ohne ihn bewegt sich nichts, solange man steht: der Kurs über Grund
   * entsteht erst aus zurückgelegtem Weg. Die Freigabe holt auf iOS der
   * Knopf für „in Fahrtrichtung" — von dort aus ist es eine Bedienhandlung,
   * und nur so nimmt iOS die Anfrage überhaupt an.
   */
  useEffect(() => {
    const k = kompassStarten(grad => {
      sensorKursRef.current = grad
      pfeilDrehen()
      if (headUpRef.current) nachfuehren()
    })
    return () => {
      k.stop()
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Radwege an/aus, ohne den Kartenstil neu zu laden
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    addCycleLayer(m, cycleLayer)
  }, [cycleLayer])

  // „Zentrieren" gedrückt: sofort hinspringen. Vorher passierte bis zum
  // nächsten GPS-Fix nichts — der Knopf wirkte kaputt.
  useEffect(() => {
    if (!follow || activeLegRef.current == null) return
    const pos = userPosRef.current
    if (pos) followUser(pos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow])

  // Umschalten zwischen „genordet" und „in Fahrtrichtung": sofort drehen,
  // nicht erst beim nächsten GPS-Fix.
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current) return
    const ziel = headUp ? (zielKurs() ?? m.getBearing()) : 0
    zeigeKursRef.current = headUp ? ziel : null
    m.easeTo({ bearing: ziel, duration: 400, essential: true })
    m.once('moveend', pfeilDrehen)
    pfeilDrehen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headUp])

  return <div ref={div} className="map" />
}
