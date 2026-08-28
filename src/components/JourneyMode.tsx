import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ItineraryView, Leg } from '../types'
import { hm, legDelayMin, legKind, legLabel, lineShort, mins, nextbikeLink, pickupText } from '../format'
import {
  BikeIcon,
  BoltIcon,
  CompassIcon,
  ChevronLeft,
  ChevronRight,
  ClockIcon,
  CloseIcon,
  ExternalIcon,
  PinIcon,
  SendIcon,
  TargetIcon,
  TurnIcon,
  WalkIcon,
} from '../icons'
import { fetchTripStatus, stationBestand } from '../api'
import { fahrtMelden, mieteBeenden, mieteBeginnFuer, mieteMerken } from '../miete'
import type { TripStatus } from '../api'
import { abseitsSchwelle, haversine, planPickup, projectOnPath } from '../geo'
import { nextTurn, turnsFromPath } from '../turns'
import { freiLimitSek, legPath } from '../routing'
import { co2Label, euro, viewStats } from '../stats'
import { cancelReturnReminders, scheduleReturnReminders } from '../notify'
import { playWarningSound } from '../audio'
import { abbiegeSatz, schweigen, sprechen } from '../sprache'
import { dict, t } from '../i18n'
import type { Language } from '../i18n'
import { stadt } from '../stadt'
import { stoerungenFuerEtappen } from '../stoerungen'
import type { Stoerung } from '../stoerungen'

/** So viele Messungen hintereinander, bevor der Hinweis kommt. Der Abstand
 *  selbst richtet sich nach der Genauigkeit — siehe `abseitsSchwelle`. */
const OFF_ROUTE_FIXES = 3
/** Ab dieser Entfernung zur Abholstation wird der Bestand neu abgefragt. Ein
 *  paar Minuten Fußweg reichen, damit Räder weg sind — die Zahl aus der
 *  Planung ist dann eine Behauptung. */
const BESTAND_AB_M = 600
/** Nicht öfter als das, auch wenn man langsam näher kommt. */
const BESTAND_TAKT_MS = 45_000
/** Ab wann gewarnt wird: bei einem letzten Rad ist die Fahrt ein Glücksspiel. */
const BESTAND_KNAPP = 1
/** Wie oft der Stand der laufenden ÖPNV-Fahrt nachgefragt wird. Häufiger
 *  lohnt nicht: die Rückmeldungen der Betreiber kommen selten schneller. */
const LIVE_POLL_MS = 60_000
/** Wie oft es erneut versucht wird, solange man abseits der Route bleibt.
 *  Ob wirklich gerechnet wird, entscheidet die Sperrfrist in App. */
const REROUTE_RETRY_MS = 10_000
/** Ab so viel zurückgelegtem Weg auf der Radetappe gilt: das Rad ist geholt.
 *  Wer schon fährt, hat den Knopf offenbar übersehen. */
const AUTO_START_M = 150
/** Rückdatierung beim automatischen Start — die ersten Meter waren schon
 *  Fahrzeit, die Frist lief bereits. */
const AUTO_START_BACKDATE_MS = 60_000

interface Props {
  view: ItineraryView
  legIndex: number
  distToEnd: number | null
  /** Aktueller Standort — für die Restzeit der laufenden Etappe. */
  userPos?: { lat: number; lon: number; speed?: number; accuracy?: number } | null
  /** Kein Standort: Freigabe fehlt oder Signal weg. */
  gpsError?: 'denied' | 'lost' | null
  /** Letzter Fix ist alt — die Entfernung stimmt nicht mehr. */
  posStale?: boolean
  bikesNeeded: number
  now: number
  startedAt: number | null
  arrived: boolean
  soundEnabled: boolean
  /** Meldungen zu den Linien dieser Route (MVG). */
  stoerungen?: Stoerung[]
  lang?: Language
  routeLabel: string
  onPrev: () => void
  onNext: () => void
  /** Direkt auf eine Etappe springen (Chips unten). */
  onGoTo?: (i: number) => void
  onArrive: () => void
  onExit: () => void
  /** Route ab dem aktuellen Standort neu berechnen — wird automatisch
   *  ausgelöst, sobald man von der Linie abkommt. */
  onReroute?: () => void
  /** Läuft die Neuberechnung gerade? */
  rerouting?: boolean
  /** Kamera folgt dem Standort? */
  follow?: boolean
  onToggleFollow?: () => void
  /** Karte dreht sich in Fahrtrichtung */
  /** Rechnet die Anzeige mit ÖPNV-Abo (30 Freiminuten) oder ohne? */
  hatAbo?: boolean
  headUp?: boolean
  onToggleHeadUp?: () => void
  children?: ReactNode // Karte
}

function BigIcon({ leg, lang }: { leg: Leg; lang: Language }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={22} />
  if (k === 'bike') return <BikeIcon size={24} />
  return <>{lineShort(leg, lang)}</>
}

function ChipIcon({ leg, lang }: { leg: Leg; lang: Language }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={13} />
  if (k === 'bike') return <BikeIcon size={13} />
  return <>{lineShort(leg, lang)}</>
}

/** mm:ss, nach einer Stunde h:mm:ss */
function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

export default function JourneyMode({
  view,
  legIndex,
  distToEnd,
  gpsError = null,
  posStale = false,
  userPos = null,
  bikesNeeded,
  now,
  startedAt,
  arrived,
  soundEnabled,
  stoerungen = [],
  lang = 'de',
  routeLabel,
  onPrev,
  onNext,
  onGoTo,
  onArrive,
  onExit,
  follow = true,
  onToggleFollow,
  hatAbo = true,
  headUp = false,
  onToggleHeadUp,
  onReroute,
  rerouting = false,
  children,
}: Props) {
  const legs = view.it.legs
  const leg = legs[legIndex]
  const k = legKind(leg)
  const b = view.bikeLegs.get(legIndex)
  const last = legIndex === legs.length - 1

  const elapsedMs = startedAt ? now - startedAt : 0

  const isBikeLeg = k === 'bike'
  const isTransitLeg = k === 'line'
  const warned5Min = useRef(false)
  const warned2Min = useRef(false)
  const vibratedTransit = useRef(false)
  /** Wie oft hintereinander lag der Standort abseits der Linie? */
  const abseitsZaehler = useRef(0)
  const journeyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Frisch nachgefragter Stand der laufenden ÖPNV-Fahrt. */
  const [liveStatus, setLiveStatus] = useState<TripStatus | null>(null)

  /**
   * Beginn der Ausleihe je Etappe — einmal festgehalten und danach nie wieder
   * überschrieben.
   *
   * Vorher lag hier ein einzelner Ref, der bei jeder Änderung von `legIndex`
   * neu auf `Date.now()` gesetzt wurde. Wer nach 25 Minuten einmal auf
   * „Vorherige" und wieder auf „Nächste" tippte, sah plötzlich wieder volle
   * Freiminuten: die Warnungen waren entwertet und die Systemmeldung lag eine
   * halbe Stunde daneben. Der Zähler hängt jetzt an der Etappe, nicht daran,
   * wann man sie zuletzt angesehen hat.
   */
  const bikeStarts = useRef<Map<number, number>>(new Map())
  /** Erster Standort auf der laufenden Radetappe — Bezug für „fährt schon". */
  const radAnfangsPos = useRef<{ leg: number; lat: number; lon: number } | null>(null)

  /** Nur damit ein Druck auf „Rad genommen" ein Neuzeichnen auslöst. */
  const [radTick, setRadTick] = useState(0)

  useEffect(() => {
    warned5Min.current = false
    warned2Min.current = false
    vibratedTransit.current = false
  }, [legIndex, isBikeLeg])

  // Erst auf Druck. Vorher zeigt die Uhr nichts an, und es wird auch nicht
  // gewarnt — eine Frist, die vor dem Losfahren anfängt, warnt zu früh.
  /**
   * Eine Ausleihe aus einem früheren Leben der Seite wieder aufnehmen.
   *
   * Der Beginn lag bisher nur in diesem `ref`. Ein Neuladen — nach einem
   * Deployment lädt die Seite sich selbst neu, und iOS wirft die Webansicht
   * bei Speicherdruck weg — setzte ihn auf null, und die Uhr begann von vorn.
   * Die 30 Freiminuten schienen dann noch vollständig da zu sein, obwohl sie
   * fast abgelaufen waren; ab der 31. Minute kostet das Geld.
   */
  if (isBikeLeg && !bikeStarts.current.has(legIndex)) {
    const wieder = mieteBeginnFuer(b?.startStation?.id)
    if (wieder != null) bikeStarts.current.set(legIndex, wieder)
  }

  const bikeStartedAt = isBikeLeg ? (bikeStarts.current.get(legIndex) ?? null) : null
  void radTick
  const radGenommen = (rueckdatierenMs = 0) => {
    if (!bikeStarts.current.has(legIndex)) {
      const seit = Date.now() - rueckdatierenMs
      bikeStarts.current.set(legIndex, seit)
      // Nur klassische Räder haben Freiminuten; beim E-Bike zählt die Uhr das
      // Geld, und auch das soll ein Neuladen nicht verschlucken.
      if (b?.startStation?.id) mieteMerken(b.startStation.id, seit)
      setRadTick(x => x + 1)
    }
  }
  const bikeSec = bikeStartedAt ? Math.floor((now - bikeStartedAt) / 1000) : 0

  // Bildschirm wachhalten macht `useJourney` über `useWakeLock` — hier stand
  // ein zweiter Halter, der den ersten überschrieb und nie neu angefordert wurde.

  // Get-off alert vibration when transit leg reaches final ~200m or 1 min
  useEffect(() => {
    if (!isTransitLeg || vibratedTransit.current) return
    if (distToEnd != null && distToEnd <= 250) {
      vibratedTransit.current = true
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    }
  }, [distToEnd, isTransitLeg])

  // Systemmeldung planen, sobald das Rad genommen ist. Die Warnungen unten
  // greifen nur, solange die App im Vordergrund steht — Bildschirm aus, und
  // die Freiminuten liefen bisher unbemerkt ab.
  //
  // Ausschlaggebend ist `bikeStartedAt`, nicht das Öffnen der Etappe: die Uhr
  // startet erst auf Druck von „Rad genommen“. Vorher plante dieser Effekt
  // schon beim Aufschlagen der Etappe — wer den Fußweg zur Station noch vor
  // sich hatte, bekam die Warnung Minuten zu früh und zur eigentlichen Frist
  // gar keine mehr, weil ein späterer Druck den Alarm nicht neu stellte.
  useEffect(() => {
    if (!isBikeLeg || b?.electric || arrived || !bikeStartedAt || freiLimitSek() === 0) {
      cancelReturnReminders()
      return
    }
    // Beim Zurückspringen auf eine laufende Etappe zählt die Restzeit, nicht
    // das volle Fenster.
    const verstrichen = Math.floor((Date.now() - bikeStartedAt) / 1000)
    scheduleReturnReminders({
      secondsLeft: Math.max(0, freiLimitSek() - verstrichen),
      stationName: b?.endStation?.name ?? null,
      lang,
    })
    return () => {
      cancelReturnReminders()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legIndex, isBikeLeg, b?.electric, arrived, bikeStartedAt])

  // Rückgabe-Warnung: 5 Min und 2 Min vor Ende des kostenlosen Fensters
  useEffect(() => {
    if (!isBikeLeg) return
    const grenze = freiLimitSek()
    if (grenze === 0) return
    if (bikeSec >= grenze - 5 * 60 && bikeSec < grenze - 2 * 60 && !warned5Min.current) {
      warned5Min.current = true
      if (soundEnabled) playWarningSound()
      if (navigator.vibrate) navigator.vibrate([300, 100, 300])
    }
    if (bikeSec >= grenze - 2 * 60 && !warned2Min.current) {
      warned2Min.current = true
      if (soundEnabled) playWarningSound()
      if (navigator.vibrate) navigator.vibrate([400, 100, 400])
    }
    // Beide Warnungen hängen an ihrem Ref und feuern genau einmal — der Effekt
    // darf deshalb ruhig noch einmal laufen, wenn der Ton umgeschaltet wird.
  }, [bikeSec, isBikeLeg, soundEnabled])

  // ── Standort auf die Etappenlinie projizieren ──
  // Muss vor dem Ankunftsscreen stehen: darunter kehrt die Komponente früh
  // zurück, und ein Hook dahinter liefe nicht bei jedem Rendern.
  const posVeraltet = posStale || gpsError != null
  // Linie der Etappe nur bei Wechsel neu dekodieren — sie ändert sich nicht,
  // der Standort dagegen im Sekundentakt.
  // Dieselbe Linie wie auf der Karte — mit dem letzten Stück zur
  // Rückgabestation. Ohne das endete die Messung vor dem eigentlichen Ziel.
  const linie = useMemo(() => (leg ? legPath(view, legIndex) : []), [view, legIndex, leg])
  // Abbiegehinweise aus der Geometrie; Transitous liefert praktisch nur
  // „CONTINUE" (siehe turns.ts).
  const abbiegungen = useMemo(() => turnsFromPath(linie), [linie])
  const projektion = userPos && !posVeraltet && linie.length ? projectOnPath(linie, userPos) : null
  const naechsteAbbiegung = projektion ? nextTurn(abbiegungen, projektion.along) : null

  // Restzeit der laufenden Etappe. Ohne brauchbaren Standort bleibt es bei der
  // Gesamtdauer — eine geratene Restzeit wäre schlechter als gar keine.
  const restMin =
    projektion == null || !leg ? null : Math.max(1, Math.round((leg.duration * projektion.share) / 60))
  const zeigtRest = restMin != null && !!leg && restMin < mins(leg.duration)

  // Abseits der Route? Erst nach mehreren Messungen hintereinander, sonst
  // löst ein einzelner GPS-Ausreißer zwischen Häusern schon aus.
  //
  // Der Zähler hing früher im Rumpf der Komponente und zählte damit *Renders*
  // statt Messungen. Im Los-Modus rendert die Ansicht rund zweimal je Sekunde
  // (Sekundentakt der Uhr plus jeder Fix), die Schwelle von drei „Messungen"
  // war nach anderthalb Sekunden erreicht — von einem einzigen Ausreißer.
  // Verschärfend: Fixes mit einer Genauigkeit schlechter als 100 m verwirft
  // `useJourney` ganz. Genau in enger Bebauung fallen sie weg, der Standort
  // bleibt auf dem Ausreißer stehen, und die Uhr zählt weiter hoch — ein
  // Zurücksetzen war gar nicht mehr möglich. Jede Fehlauslösung kostet eine
  // Neuberechnung samt GBFS-Abruf.
  //
  // Jetzt zählt nur, was auch wirklich eine neue Messung ist.
  /**
   * Radbestand der nächsten Abholstation, unterwegs nachgefragt.
   *
   * Die Zahl aus der Planung altert: bis man die Station erreicht, sind ein
   * paar Minuten vergangen, und Räder werden genau in dieser Zeit genommen.
   * Bisher erfuhr man das erst vor Ort.
   */
  const [bestand, setBestand] = useState<{ bikes: number; ebikes: number } | null>(null)
  const bestandAt = useRef(0)

  /** Nächste Station, an der noch ein Rad zu holen ist. */
  const abholStation = (() => {
    for (let i = legIndex; i < legs.length; i++) {
      if (legKind(legs[i]) !== 'bike') continue
      const bi = view.bikeLegs.get(i)
      if (!bi?.startStation) return null
      // Schon losgefahren: der Bestand ist dann nicht mehr unsere Sorge.
      if (i === legIndex && bikeStarts.current.get(i)) return null
      return bi.startStation
    }
    return null
  })()
  const abholId = abholStation?.id ?? null

  useEffect(() => {
    setBestand(null)
    bestandAt.current = 0
  }, [abholId])

  useEffect(() => {
    if (!abholStation || !userPos || arrived) return
    // Erst in der Nähe fragen. Aus zehn Kilometern Entfernung sagt die Zahl
    // nichts, kostet aber Mobilfunk.
    if (haversine(userPos, abholStation) > BESTAND_AB_M) return
    if (Date.now() - bestandAt.current < BESTAND_TAKT_MS) return
    bestandAt.current = Date.now()
    let lebt = true
    stationBestand(abholStation.id)
      .then(r => lebt && r && setBestand(r))
      .catch(() => {})
    return () => {
      lebt = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, abholId, arrived])

  const bestandKnapp = bestand != null && bestand.bikes <= BESTAND_KNAPP

  /**
   * Solange eine Fahrt läuft, darf sich die Seite nicht selbst neu laden —
   * ein Deployment mitten unterwegs würde sonst die Anzeige zurücksetzen.
   */
  useEffect(() => {
    fahrtMelden(true)
    return () => fahrtMelden(false)
  }, [])

  // Radetappe vorbei: die Ausleihe ist zurückgegeben, die gemerkte Uhr weg.
  useEffect(() => {
    if (!isBikeLeg && bikeStarts.current.size > 0) mieteBeenden()
    if (arrived) mieteBeenden()
  }, [isBikeLeg, arrived])

  const [abgekommen, setAbgekommen] = useState(false)
  useEffect(() => {
    if (projektion == null) return
    const schwelle = abseitsSchwelle(userPos?.accuracy)
    abseitsZaehler.current = projektion.dist > schwelle ? abseitsZaehler.current + 1 : 0
    setAbgekommen(abseitsZaehler.current >= OFF_ROUTE_FIXES)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  /**
   * Abbiegungen ansagen.
   *
   * Zweimal je Abbiegung: einmal auf Zuruf mit Entfernung, damit man sich
   * einordnen kann, und einmal unmittelbar davor. Gemerkt wird, was schon
   * gesagt wurde — sonst spräche jede Standortmeldung denselben Satz erneut,
   * und das im Sekundentakt.
   *
   * Am selben Schalter wie der Warnton: wer die Töne abstellt, will keine
   * Stimme. Ein zweiter Schalter wäre eine Einstellung mehr für dieselbe
   * Frage.
   */
  const gesagt = useRef<string>('')
  useEffect(() => {
    if (!soundEnabled || arrived || abgekommen) return
    const a = naechsteAbbiegung
    if (!a) return
    const stufe = a.inM <= 30 ? 'jetzt' : a.inM <= 150 ? 'gleich' : null
    if (!stufe) return
    const marke = `${legIndex}:${a.index}:${stufe}`
    if (gesagt.current === marke) return
    gesagt.current = marke
    sprechen(abbiegeSatz(a.kind, a.inM, lang), lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naechsteAbbiegung?.index, naechsteAbbiegung?.inM, soundEnabled, arrived, abgekommen])

  // Ton aus, Ansicht verlassen oder angekommen: sofort still.
  useEffect(() => {
    if (!soundEnabled) schweigen()
  }, [soundEnabled])
  useEffect(() => () => schweigen(), [])

  // Beim Etappenwechsel und nach der Ankunft von vorn
  useEffect(() => {
    abseitsZaehler.current = 0
    setAbgekommen(false)
  }, [legIndex])

  const richtungsWort = (kind: string): string =>
    kind === 'left'
      ? t('jmTurnLeft', lang)
      : kind === 'right'
        ? t('jmTurnRight', lang)
        : kind === 'slight-left'
          ? t('jmTurnSlightLeft', lang)
          : kind === 'slight-right'
            ? t('jmTurnSlightRight', lang)
            : kind === 'sharp-left'
              ? t('jmTurnSharpLeft', lang)
              : t('jmTurnSharpRight', lang)

  // Automatisch neu rechnen. Der Mindestabstand zwischen zwei Läufen sitzt in
  // App, damit ein zappelndes GPS den freien Dienst nicht im Sekundentakt fragt.
  //
  // Solange man abseits bleibt, wird es erneut versucht: fiel der erste Anlauf
  // in die Sperrfrist, kam sonst nie wieder einer — der Zustand „abgekommen"
  // ändert sich ja nicht mehr, und der Effekt lief nur bei Wechsel.
  useEffect(() => {
    if (!abgekommen || arrived || !onReroute || rerouting) return
    onReroute()
    const id = window.setInterval(() => onReroute(), REROUTE_RETRY_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abgekommen, arrived, rerouting])

  useEffect(() => {
    const panel = panelRef.current
    const wrap = journeyRef.current
    if (!panel || !wrap) return
    const messen = () => wrap.style.setProperty('--j-panel-h', `${Math.round(panel.offsetHeight)}px`)
    messen()
    const ro = new ResizeObserver(messen)
    ro.observe(panel)
    return () => ro.disconnect()
  })

  // Wer den Knopf übersieht und einfach losfährt, hätte gar keine Frist. Nach
  // einem merklichen Stück Weg startet sie deshalb von selbst — leicht
  // zurückdatiert, denn die ersten Meter zählten schon.
  useEffect(() => {
    if (!isBikeLeg || b?.electric || bikeStartedAt || !userPos) return
    const anker = radAnfangsPos.current
    if (!anker || anker.leg !== legIndex) {
      radAnfangsPos.current = { leg: legIndex, lat: userPos.lat, lon: userPos.lon }
      return
    }
    if (haversine(anker, userPos) >= AUTO_START_M) radGenommen(AUTO_START_BACKDATE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos, isBikeLeg, legIndex, bikeStartedAt])

  // Verspätungen aus der Suche sind eine Momentaufnahme. Wer schon unterwegs
  // ist, erfährt sonst nie, dass die Bahn inzwischen später kommt — deshalb
  // die laufende Fahrt regelmäßig nachfragen. Eine Fahrt, nicht die ganze Suche.
  const tripId = leg?.tripId
  useEffect(() => {
    setLiveStatus(null)
    if (!tripId || arrived) return
    const ctrl = new AbortController()
    let lebt = true
    const hole = () => {
      fetchTripStatus(tripId, ctrl.signal)
        .then(st => lebt && st && setLiveStatus(st))
        .catch(() => {})
    }
    hole()
    const id = window.setInterval(hole, LIVE_POLL_MS)
    return () => {
      lebt = false
      ctrl.abort()
      window.clearInterval(id)
    }
  }, [tripId, arrived])

  // ── Ankunftsscreen ──
  if (arrived) {
    // Echte Etappendauern und -längen statt pauschal 15 Min je Radetappe;
    // Pedelec zählt weniger Kalorien und kostet auch mit Abo Geld.
    const stats = viewStats(view, undefined, hatAbo)

    return (
      <div className="journey">
        <div className="arrive">
          <div className="arrive-kicker">{t('jmArrived', lang)}</div>
          <div className="arrive-time">
            {Math.max(1, Math.round(elapsedMs / 60000))}
            <small> {t('jmMin', lang)}</small>
          </div>
          <div className="arrive-route">{routeLabel || t('jmGoalReached', lang)}</div>
          <div className="arrive-sub">
            {t('jmTravelTime', lang)} {elapsedText(elapsedMs)} · {legs.length} {t('jmLegs', lang)}
          </div>

          <div className="arrive-stats">
            <div className="arrive-stat">
              <b>{stats.kcal}</b>
              <span>kcal{view.hasElectric ? ' (E)' : ''}</span>
            </div>
            <div className="arrive-stat">
              <b>{co2Label(stats.co2Grams, lang)}</b>
              <span>CO₂</span>
            </div>
            <div className="arrive-stat">
              <b>{stats.costKnown ? euro(stats.costCent, lang) : '—'}</b>
              <span>{t('jmCost', lang)}</span>
            </div>
          </div>

          <button className="arrive-btn" onClick={onExit}>
            {t('jmFinish', lang)}
          </button>
        </div>
      </div>
    )
  }

  const fromName = leg.from.name === 'START' ? t('jmStart', lang) : leg.from.name || b?.startStation?.name || ''
  // Bei Radetappen ist das Ziel die Rückgabestation — nicht der Punkt, den
  // MOTIS gewählt hat. Der lag bei freistehenden Rädern regelmäßig bei einem
  // anderen freien Rad, und die Navigation führte genau dorthin.
  const toName =
    leg.to.name === 'END'
      ? t('jmGoal', lang)
      : (b?.returnSnapped ? b.endStation?.name : '') || leg.to.name || b?.endStation?.name || ''
  const name = `${legLabel(leg, lang)}${leg.routeShortName ? ` ${leg.routeShortName}` : ''}`
  // Der frisch nachgefragte Stand schlägt den aus der Suche
  const delay = liveStatus?.realTime ? liveStatus.delayMin : legDelayMin(leg)
  const abgesagt = liveStatus?.cancelled ?? leg.cancelled

  const distText =
    distToEnd == null
      ? null
      : distToEnd >= 950
        ? `${(distToEnd / 1000).toFixed(1)} km`
        : `${Math.max(10, Math.round(distToEnd / 10) * 10)} m`
  // Ohne frischen Fix ist die Zahl geraten — dann lieber kein Wert als ein
  // falscher. Vorher blieb im Tunnel „300 m" stehen, während man weiterfuhr.
  const distVeraltet = posStale || gpsError != null

  // Kurzer Hinweis zur aktuellen Etappe
  let infoLine: string | null = null
  let infoWarn = false
  if (b) {
    const pk = planPickup(b.nearby, b.electric, bikesNeeded)
    const pl = t(b.electric ? 'ebikeMany' : 'bikeMany', lang)
    if (bikesNeeded > 1 && pk.got < bikesNeeded) {
      infoLine = dict[lang].jmOnlyXofY(pk.got, bikesNeeded, pl, pk.totalElectric, pk.totalClassic)
      infoWarn = true
    } else if (bikesNeeded > 1) {
      infoLine = dict[lang].jmPickupPlan(bikesNeeded, pl, pickupText(pk.picks, lang))
    } else if (b.startStation) {
      infoLine =
        dict[lang].jmBikesAt(b.startStation.bikes, b.startStation.name) +
        (b.endStation ? dict[lang].jmReturnTo(b.endStation.name) : '')
    } else if (b.freeFloating) {
      infoLine =
        t('jmFreeFloating', lang) + (b.endStation ? dict[lang].jmReturnTo(b.endStation.name) : '')
    }
    // Rückgabe außerhalb einer Station kostet 20 € — das gehört vor den Rest.
    if (b.noReturnStation) {
      infoLine = t('jmNoReturnStation', lang)
      infoWarn = true
    } else if (b.returnSnapped && b.endStation) {
      infoLine = `${t('jmReturnOnly', lang)} ${dict[lang].jmReturnStation(b.endStation.name, b.returnDetourM)}`
      infoWarn = true
    }
    if (b.swapStation) {
      infoLine = dict[lang].jmSwapAt(b.swapStation.name)
      infoWarn = true
    }
  }

  // Geschwindigkeit nur zeigen, wenn sie plausibel ist: unter 1 km/h steht man,
  // über 90 km/h war es ein GPS-Sprung.
  const tempoRoh = userPos?.speed != null && !posVeraltet ? userPos.speed * 3.6 : null
  const tempo = tempoRoh != null && tempoRoh >= 1 && tempoRoh < 90 ? Math.round(tempoRoh) : null

  /**
   * Restzeit bis zur nächsten Geldgrenze.
   *
   * Standardrad: bis die 30 Freiminuten um sind (mit Puffer 28).
   * E-Bike: bis die nächste angefangene halbe Stunde beginnt — dort gibt es
   * keine Freiminuten, aber jede Stufe kostet weitere 1,50 €. Genau deshalb
   * ist die Uhr dort nicht überflüssig, sondern besonders nützlich; sie fehlte
   * bisher ganz.
   */
  const geldTarif = stadt().tarif
  const STUFE_SEC = (geldTarif?.taktMin ?? 30) * 60
  const remainingSec = b?.electric
    ? STUFE_SEC - (bikeSec % STUFE_SEC)
    : Math.max(0, freiLimitSek() - bikeSec)
  /** Ohne bekannten Tarif ist jede Uhr eine Behauptung über Geld — dann keine. */
  const zeigeGelduhr = geldTarif !== null
  const remainingMins = Math.ceil(remainingSec / 60)
  /** Wie viele halbe Stunden das E-Bike bereits gekostet hat. */
  const ebikeStufen = b?.electric ? Math.floor(bikeSec / STUFE_SEC) + 1 : 0
  const isNearDropoff = isBikeLeg && distToEnd != null && distToEnd <= 250
  /** Meldung zur laufenden Linie — die zum Rest der Route hilft unterwegs nicht. */
  const etappenStoerung = stoerungenFuerEtappen([leg], stoerungen, now)[0] ?? null

  return (
    <div className="journey" ref={journeyRef}>
      <div className="j-map">{children}</div>

      {tempo != null && (
        <div className="j-speed">
          <b>{tempo}</b> km/h
        </div>
      )}

      {/* Folgen-Knopf wie in Kartendiensten: aus, sobald man selbst schiebt */}
      {/* Karte genordet oder in Fahrtrichtung — wie in Kartendiensten üblich */}
      {onToggleHeadUp && (
        <button
          className={`j-follow j-headup${headUp ? ' on' : ''}`}
          onClick={onToggleHeadUp}
          aria-pressed={headUp}
          title={t(headUp ? 'jmHeadUp' : 'jmNorthUp', lang)}
        >
          <CompassIcon size={20} />
        </button>
      )}

      {onToggleFollow && (
        <button
          className={`j-follow${follow ? ' on' : ''}`}
          onClick={onToggleFollow}
          aria-pressed={follow}
          title={t(follow ? 'jmFollowing' : 'jmRecenter', lang)}
        >
          <TargetIcon size={20} />
        </button>
      )}

      {/* Schwebende Kopfkarte: wohin es gerade geht + Entfernung */}
      <div className="j-poster">
        {bestand && !abgekommen && (
          <div className={`j-bestand${bestandKnapp ? ' knapp' : ''}`}>
            {bestandKnapp
              ? t(bestand.bikes === 0 ? 'jmKeineRaeder' : 'jmRadKnapp', lang)
              : dict[lang].jmRaederDa(bestand.bikes)}
          </div>
        )}

        {naechsteAbbiegung && !abgekommen && (
          <div className={`j-turn${naechsteAbbiegung.inM <= 25 ? ' now' : ''}`}>
            <TurnIcon kind={naechsteAbbiegung.kind} size={26} />
            <span>
              {naechsteAbbiegung.inM <= 25
                ? dict[lang].jmTurnNow(richtungsWort(naechsteAbbiegung.kind))
                : dict[lang].jmTurnIn(naechsteAbbiegung.inM, richtungsWort(naechsteAbbiegung.kind))}
            </span>
          </div>
        )}
        <div className="j-head-row">
          <div className="j-head-card">
            <span className={`j-head-icon ${k}`}>
              <BigIcon leg={leg} lang={lang} />
            </span>
            <div className="j-head-main">
              <div className="j-kicker">
                {t('jmHeadTowards', lang)}
                {startedAt != null && <span className="j-timer"> · {elapsedText(elapsedMs)}</span>}
              </div>
              <div className="j-head-target">{toName}</div>
            </div>
            {distText && !distVeraltet && (
              <div className="j-dist-badge">
                {distText.replace(/ ?(km|m)$/, '')}
                <small> {distText.endsWith('km') ? 'km' : 'm'}</small>
              </div>
            )}
          </div>
          <button
            className="j-end"
            onClick={onExit}
            aria-label={t('jmEnd', lang)}
            title={t('jmEnd', lang)}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Meldung und Rad-Uhr teilen sich eine Zeile unter der Kopfkarte:
            zuoberst ragte das Band in die Karte, darunter hing es unter der Uhr. */}
        <div className="j-status-row">
          {/* Unterwegs schaut niemand dauernd hin: Umleitung, verlorene Ortung
              oder „aussteigen" müssen auch angesagt werden. */}
          <div className="j-status-msg" role="status" aria-live="assertive">
            {rerouting ? (
              <div className="timer-banner off-route">
                <span>
                  <TargetIcon size={14} /> {t('jmRerouting', lang)}
                </span>
              </div>
            ) : abgekommen ? (
              <div className="timer-banner urgent off-route">
                <span>
                  <TargetIcon size={14} /> {t('jmOffRoute', lang)}
                </span>
              </div>
            ) : gpsError || posStale ? (
              <div className="timer-banner urgent">
                <TargetIcon size={14} />{' '}
                {t(gpsError === 'denied' ? 'jmGpsDenied' : 'jmGpsLost', lang)}
              </div>
            ) : isNearDropoff ? (
              <div className="timer-banner urgent">
                <PinIcon size={14} /> {t('jmDropoff', lang)} <b>{distText}</b> {t('jmDropoffAction', lang)}
              </div>
            ) : isTransitLeg && distToEnd != null && distToEnd <= 250 ? (
              <div className="timer-banner urgent">
                <TargetIcon size={14} /> {t('jmExitNext', lang)} {dict[lang].quote(toName)}
              </div>
            ) : etappenStoerung ? (
              <div className="timer-banner urgent">
                ⚠ {etappenStoerung.titel}
              </div>
            ) : null}
          </div>
          {isBikeLeg &&
            zeigeGelduhr &&
            (bikeStartedAt ? (
              <span
                className={`j-biketimer${remainingMins <= 5 ? ' urgent' : ''}${b?.electric ? ' ebike' : ''}`}
                title={
                  b?.electric
                    ? dict[lang].jmEbikeStufe(remainingMins, ebikeStufen)
                    : `${t('jmTimerFree', lang)} ${remainingMins} ${t('jmTimerFreeMin', lang)}`
                }
              >
                {b?.electric ? <BoltIcon size={13} /> : <ClockIcon size={13} />}
                {elapsedText(remainingSec * 1000)}
              </span>
            ) : (
              <button className="j-biketimer start" onClick={() => radGenommen()}>
                <BikeIcon size={13} /> {t('jmBikeTaken', lang)}
              </button>
            ))}
        </div>

      </div>

      {/* Unteres Blatt: Fortschritt, aktuelle Etappe, Navigation */}
      <div className="j-panel" ref={panelRef}>
        <div className="j-progress">
          {legs.map((_, i) => (
            <span key={i} className={`j-step${i <= legIndex ? ' done' : ''}`} />
          ))}
        </div>

        <div className="j-legcard">
          <span className={`j-bigico ${k}`}>
            <BigIcon leg={leg} lang={lang} />
          </span>
          <div className="j-legmain">
            <div className="j-legtop">
              <span className="j-mins">{restMin ?? mins(leg.duration)}</span>
              <span className="j-legname">
                {t('jmMin', lang)}
                {zeigtRest ? ` ${t('jmLeft', lang)}` : ''} · {name}
              </span>
              {abgesagt ? (
                <span className="delay cancel">{t('cardCancelled', lang)}</span>
              ) : delay != null && delay !== 0 ? (
                <span className="delay">{dict[lang].cardDelay(delay)}</span>
              ) : null}
            </div>
            <div className="j-legsub">
              {hm(leg.startTime, lang)} · {fromName} → {toName}
            </div>
          </div>
        </div>

        {infoLine && <div className={`j-info${infoWarn ? ' warn' : ''}`}>{infoLine}</div>}

        <div className="j-nav">
          <button className="j-nav-prev" disabled={legIndex === 0} onClick={onPrev} title={t('jmPrev', lang)}>
            <ChevronLeft size={24} />
          </button>
          {/* Beim Rad: Ausleihe in der Nextbike-App. Als eigene Zeile nahm der
              Knopf der Karte zu viel weg — jetzt in derselben Reihe. */}
          {isBikeLeg && (
            <a
              className="j-nav-bike"
              href={nextbikeLink(leg)}
              target="_blank"
              rel="noreferrer"
              aria-label={t('jmOpenNextbike', lang)}
              title={t('jmOpenNextbike', lang)}
            >
              <ExternalIcon size={20} />
            </a>
          )}
          {last ? (
            <button className="j-nav-next" onClick={onArrive}>
              {t('jmArrivedBtn', lang)} <SendIcon size={20} />
            </button>
          ) : (
            <button className="j-nav-next" onClick={onNext}>
              {t('jmNext', lang)} <ChevronRight size={22} />
            </button>
          )}
        </div>

        <div className="j-strips">
          {legs.map((l, i) => {
            const lk = legKind(l)
            const sel = i === legIndex
            return (
              // Vorher Knöpfe ohne Wirkung: sie sahen bedienbar aus, taten
              // aber nichts. Jetzt springen sie auf die Etappe.
              <button
                key={i}
                className={`j-chip ${lk}${sel ? ' sel' : ''}`}
                aria-current={sel ? 'step' : undefined}
                onClick={() => onGoTo?.(i)}
              >
                <ChipIcon leg={l} lang={lang} />
                <span>{mins(l.duration)}′</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
