import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import FilterModal, { MAX_BIKES_PER_ACCOUNT } from './components/FilterModal'
import MapGuard from './components/MapGuard'

// maplibre-gl ist mit Abstand der größte Brocken im Bündel und wird erst
// gebraucht, wenn es Ergebnisse gibt — der Startbildschirm kommt ohne aus.
const MapView = lazy(() => import('./components/MapView'))
const MapPicker = lazy(() => import('./components/MapPicker'))
const BikeMap = lazy(() => import('./components/BikeMap'))
const History = lazy(() => import('./components/History'))
const Diag = lazy(() => import('./components/Diag'))
import { addTrip } from './history'
import { ApiError, fetchWeatherAt, getGeolocation, loadFreeBikes, loadStations, reverseGeocode } from './api'
import type { WeatherAtTime } from './api'
import { clusterFreeBikes } from './geo'
import { searchRoutes, viewDuration } from './routing'
import { rideLegsOf, viewStats } from './stats'
import { ensureNotificationPermission } from './notify'
import { useTheme } from './hooks/useTheme'
import { useBackGuard } from './hooks/useBackGuard'
import { kompassFreigeben } from './kompass'
import { useJourney } from './hooks/useJourney'
import { addFavRoute, loadFavRoutes, loadSaved, PRESET_SLOTS, removeFavRoute, removeSaved, shortPlace, upsertSaved } from './places'
import type { FavRoute, SavedPlace } from './places'
import { BikeIcon, BoltIcon, BookmarkIcon, ChevronDown, CloseIcon, LogoMark, RainIcon, SendIcon, SettingsIcon, SlotIcon, SunIcon, SwapIcon } from './icons'
import type { ItineraryView, Place } from './types'
import { applyDocumentLang, dict, loadLanguage, saveLanguage, t } from './i18n'
import type { Language } from './i18n'

/** Kennzeichnet eine Suche eindeutig: Orte plus alle Filter, die das Ergebnis
 *  beeinflussen. Unterscheidet sich der aktuelle Stand davon, ist die Liste
 *  veraltet. */
function sucheSchluessel(
  from: Place | null,
  to: Place | null,
  maxBike: number,
  bikeType: string,
  bikes: number,
): string {
  const ort = (p: Place | null) => (p ? `${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : '-')
  return `${ort(from)}|${ort(to)}|${maxBike}|${bikeType}|${bikes}`
}

export default function App() {
  const [lang, setLang] = useState<Language>(() => loadLanguage())
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem('radl.sound') !== 'false')

  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  /** Gruppenfahrt: wie viele Räder auf einmal geholt werden sollen. */
  const [bikes, setBikes] = useState(() => {
    const saved = Number(localStorage.getItem('radl.bikes'))
    return saved >= 1 && saved <= MAX_BIKES_PER_ACCOUNT ? saved : 1
  })
  const [maxBike, setMaxBike] = useState(() => {
    const saved = Number(localStorage.getItem('radl.maxbike'))
    // 30 wie die Freiminuten. Mit 20 blendete die Voreinstellung Routen aus,
    // die vollständig kostenlos gewesen wären — das Gegenteil des Zwecks.
    return [10, 15, 20, 30, 9999].includes(saved) ? saved : 30
  })
  const [bikeType, setBikeType] = useState<'classic' | 'any'>(() =>
    localStorage.getItem('radl.biketype') === 'any' ? 'any' : 'classic',
  )
  const [timeMode, setTimeMode] = useState<'now' | 'depart' | 'arrive'>('now')
  const [timeVal, setTimeVal] = useState('')

  const [views, setViews] = useState<ItineraryView[] | null>(null)
  /** Suchfeld ausgeklappt; nach einem Treffer klappt es zu, damit die Liste Platz hat */
  const [searchOpen, setSearchOpen] = useState(true)
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(false)
  /** Schlüssel statt fertigem Text: sonst bleibt die Meldung in der Sprache
   *  stehen, die zum Zeitpunkt der Suche galt. */
  const [errorKey, setErrorKey] = useState<'networkError' | 'noRoutesFound' | null>(null)
  const [weather, setWeather] = useState<WeatherAtTime | null>(null)
  const [favRoutes, setFavRoutes] = useState<FavRoute[]>(() => loadFavRoutes())
  const [showWeatherModal, setShowWeatherModal] = useState(false)
  const [nowTick, setNowTick] = useState(Date.now())
  const [pickOnMap, setPickOnMap] = useState<'from' | 'to' | null>(null)
  /** Untere Reiter: Route (Suche), Räder (Karte), Fahrten (Verlauf) */
  const [tab, setTab] = useState<'route' | 'bikes' | 'trips'>('route')
  /** Los-Modus: Karte folgt dem Standort, bis man selbst schiebt */
  const [followMe, setFollowMe] = useState(true)
  /** Karte in Fahrtrichtung drehen (wie in Kartendiensten). Gemerkt, damit die
   *  Einstellung die nächste Fahrt überdauert. */
  /**
   * Die 30 Freiminuten hängen am ÖPNV-Abo. Voreinstellung „hat eins": das
   * Deutschlandticket ist der Anlass dieser App, und wer keins hat, stellt es
   * einmal um. Falsch herum wäre schlimmer — dann läse jeder zu hohe Preise.
   */
  const [hatAbo, setHatAbo] = useState(() => localStorage.getItem('radl.abo') !== 'false')
  const [headUp, setHeadUp] = useState(() => localStorage.getItem('radl.headup') === 'true')
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  /** Gerätewerte einblenden — hilft bei Layoutfehlern, die nur auf einem Gerät auftreten. */
  const [showDiag, setShowDiag] = useState(false)
  /** Radwege-Ebene über der Karte — CyclOSM, nur Anzeige. Die Routenführung
   *  bleibt unberührt, die kommt weiter von MOTIS. */
  const [cycleLayer, setCycleLayer] = useState<boolean>(
    () => localStorage.getItem('radl.cyclelayer') === 'true',
  )
  const [showFilterModal, setShowFilterModal] = useState(false)
  const searchCtrl = useRef<AbortController | null>(null)
  /** Läuft gerade eine automatische Neuberechnung? Dann darf der Effekt
   *  unten den Los-Modus nicht beenden — die Fahrt geht weiter. */
  const rerouting = useRef(false)
  /** Wann zuletzt automatisch neu berechnet wurde. */
  const letzteNeuberechnung = useRef(0)
  /** Die Trefferliste, auf die weitergefahren werden soll. Daran erkennt der
   *  Effekt unten den Abschluss der Neuberechnung. */
  const rerouteZiel = useRef<ItineraryView[] | null>(null)
  const [rerouteLaeuft, setRerouteLaeuft] = useState(false)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => loadSaved())
  const [presetHint, setPresetHint] = useState<string | null>(null)
  /** Hinweis, wenn der Standort nicht freigegeben ist. */
  const [geoHint, setGeoHint] = useState<string | null>(null)
  /** Womit die angezeigte Liste erzeugt wurde. Ändert der Nutzer danach Orte
   *  oder Filter, ohne neu zu suchen, zeigt die Liste etwas anderes an, als
   *  oben eingestellt ist — vorher fiel das erst beim Losfahren auf. */
  const [searchedWith, setSearchedWith] = useState<string | null>(null)
  /** Wann die Liste entstanden ist — Radzahlen altern schnell. */
  const [searchedAt, setSearchedAt] = useState<number | null>(null)

  function toggleLang() {
    const next = lang === 'de' ? 'en' : 'de'
    setLang(next)
    saveLanguage(next)
  }

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('radl.sound', String(next))
  }

  function toggleCycleLayer() {
    const next = !cycleLayer
    setCycleLayer(next)
    localStorage.setItem('radl.cyclelayer', String(next))
  }

  // Beim Start die gespeicherte Sprache auch ins Dokument schreiben.
  useEffect(() => {
    applyDocumentLang(lang)
  }, [lang])

  useEffect(() => {
    if (!presetHint) return
    const id = window.setTimeout(() => setPresetHint(null), 3000)
    return () => window.clearTimeout(id)
  }, [presetHint])

  const { theme: themeMode, toggleTheme } = useTheme()

  // Zurück führt innerhalb der App zurück, statt sie zu verlassen.
  useBackGuard(tab !== 'route', () => setTab('route'))
  useBackGuard(showFilterModal, () => setShowFilterModal(false))
  useBackGuard(showWeatherModal, () => setShowWeatherModal(false))
  useBackGuard(showHeaderMenu, () => setShowHeaderMenu(false))
  useBackGuard(showDiag, () => setShowDiag(false))

  const selectedView = views?.[sel] ?? null
  const journey = useJourney(selectedView)
  const { legIndex: journeyLeg, startedAt, arrived, userPos, distToEnd, gpsError, posStale } = journey

  useEffect(() => {
    getGeolocation()
      .then(async pos => {
        journey.setUserPos({ ...pos, at: Date.now() })
        const name = await reverseGeocode(pos.lat, pos.lon).catch(() => null)
        setFrom(f => f ?? { name: name ?? t('myLocation', lang), lat: pos.lat, lon: pos.lon })
      })
      // Vorher stumm: das Startfeld blieb einfach leer, ohne dass jemand
      // erfuhr, dass die Freigabe fehlt.
      .catch((err: GeolocationPositionError) => {
        if (err?.code === 1) setGeoHint(t('locationDenied', lang))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Los-Modus: Zurück beendet die Navigation, nicht die App.
  useBackGuard(journeyLeg != null, () => journey.exit())

  const journeyView = journeyLeg != null ? selectedView : null

  useEffect(() => {
    // Beim Neuberechnen bleibt die Navigation an: die neue Liste ist ja der
    // Ersatz für die Route, auf der man gerade unterwegs ist. Die Sperre fällt
    // erst, wenn genau diese Liste angekommen ist — `search` setzt zwischendurch
    // `views` auf null, und ein früheres Zurücksetzen hätte den Los-Modus
    // beendet, bevor React den Effekt überhaupt gerechnet hat.
    if (rerouting.current) {
      if (views && views === rerouteZiel.current) {
        rerouting.current = false
        rerouteZiel.current = null
      }
      return
    }
    journey.exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, views])

  useEffect(() => {
    if (!views) return
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [views])

  useEffect(() => {
    if (journeyLeg == null || arrived) return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [journeyLeg, arrived])

  // Wetter zur *ausgewählten* Route. Vorher wurde es einmal für die erste
  // Verbindung geholt und blieb dann über der Karte jeder anderen stehen —
  // bei einer Route zwei Stunden später eine Vorhersage für den falschen
  // Zeitpunkt.
  useEffect(() => {
    if (!selectedView || !from) {
      setWeather(null)
      return
    }
    const ctrl = new AbortController()
    const startTimeStr = selectedView.it.legs[0]?.startTime ?? selectedView.it.startTime
    fetchWeatherAt(from.lat, from.lon, new Date(startTimeStr), ctrl.signal).then(w => {
      if (!ctrl.signal.aborted) setWeather(w)
    })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedView, from?.lat, from?.lon])

  async function search(
    f: Place | null = from,
    tPl: Place | null = to,
    suchOpts: { ownBike?: boolean } = {},
  ): Promise<ItineraryView[] | null> {
    if (!f || !tPl) return null
    searchCtrl.current?.abort()
    const ctrl = new AbortController()
    searchCtrl.current = ctrl
    setLoading(true)
    setErrorKey(null)
    // Beim Neuberechnen bleibt die bisherige Route stehen, bis die neue da ist —
    // sonst verschwindet der Los-Modus kurz und die Suchmaske blitzt auf.
    if (!rerouting.current) setViews(null)
    setWeather(null)
    const when = timeMode !== 'now' && timeVal ? new Date(timeVal) : undefined
    const timeOpts = when ? { time: when, arriveBy: timeMode === 'arrive' } : {}
    try {
      const [stations, freeBikes] = await Promise.all([loadStations(), loadFreeBikes()])
      if (ctrl.signal.aborted) return null
      const supply = [...stations, ...clusterFreeBikes(freeBikes)]
      const list = await searchRoutes(f, tPl, {
        stations,
        supply,
        ownBike: suchOpts.ownBike,
        maxBikeSec: maxBike * 60,
        classicOnly: bikeType === 'classic',
        time: timeOpts,
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return null
      setViews(list)
      setSearchedWith(sucheSchluessel(f, tPl, maxBike, bikeType, bikes))
      setSearchedAt(Date.now())
      setSel(0)
      // Suchfeld einklappen: sonst bleiben für die Ergebnisliste nur ~200 px
      if (list.length) setSearchOpen(false)
      // Das Wetter holt der Effekt unten — es gehört zur *ausgewählten* Route,
      // nicht dauerhaft zur ersten.
      return list
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        // Nicht mehr über den Meldungstext raten: in Safari heißt ein
        // Netzausfall „Load failed", in Firefox anders, und ein HTTP 500 sah
        // aus wie ein Programmfehler. `ApiError` sagt es direkt.
        const netz =
          !navigator.onLine ||
          (e instanceof ApiError && (e.kind === 'network' || e.kind === 'timeout'))
        setErrorKey(netz ? 'networkError' : 'noRoutesFound')
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
    return null
  }

  /** Mindestabstand zwischen zwei automatischen Neuberechnungen. Transitous
   *  ist ein freier Dienst; ohne Sperre feuert ein zappelndes GPS im
   *  Sekundentakt. */
  const REROUTE_COOLDOWN_MS = 45_000

  /**
   * Route ab dem aktuellen Standort neu berechnen und *weiterfahren* — die
   * Navigation soll nicht in die Ergebnisliste zurückfallen.
   */
  async function reroute() {
    if (!userPos || !to || rerouting.current) return
    if (!navigator.onLine) return
    if (Date.now() - letzteNeuberechnung.current < REROUTE_COOLDOWN_MS) return

    letzteNeuberechnung.current = Date.now()
    rerouting.current = true
    setRerouteLaeuft(true)
    const hier = { name: t('myLocation', lang), lat: userPos.lat, lon: userPos.lon }
    setFrom(hier)
    // Sitzt der Nutzer gerade auf einem Rad, darf die neue Route ihn nicht
    // erst zu Fuß zur nächsten Station schicken — er hat das Rad ja schon.
    const aufDemRad = journeyLeg != null && !!selectedView?.bikeLegs.get(journeyLeg)
    try {
      const liste = await search(hier, to, { ownBike: aufDemRad })
      if (liste && liste.length) {
        // Auf der neuen besten Route weiterfahren: Fahrzeit läuft weiter,
        // die automatische Etappenschaltung bleibt scharf.
        rerouteZiel.current = liste
        journey.continueOn(0)
      } else {
        // Nichts gefunden — dann lieber die Liste zeigen als stumm bleiben.
        rerouting.current = false
        rerouteZiel.current = null
        journey.exit()
      }
    } finally {
      setRerouteLaeuft(false)
    }
  }

  function swap() {
    const tmp = from
    setFrom(to)
    setTo(tmp)
    if (tmp && from) search(to, tmp)
  }

  function runFav(f: Place, tPl: Place) {
    setFrom(f)
    setTo(tPl)
    search(f, tPl)
  }


  if (pickOnMap) {
    return (
      <Suspense fallback={<div className="msg">{t('calculating', lang)}</div>}>
        <MapGuard lang={lang}>
          <MapPicker
            title={t(pickOnMap === 'from' ? 'pickStartKicker' : 'pickDestKicker', lang)}
            initial={pickOnMap === 'from' ? from : to}
            userPos={userPos}
            theme={themeMode}
            lang={lang}
            onPick={p => {
              if (pickOnMap === 'from') setFrom(p)
              else setTo(p)
              setPickOnMap(null)
            }}
            onClose={() => setPickOnMap(null)}
          />
        </MapGuard>
      </Suspense>
    )
  }

  if (journeyView && journeyLeg != null) {
    return (
      <div className="app">
        <JourneyMode
          view={journeyView}
          legIndex={journeyLeg}
          distToEnd={distToEnd}
          userPos={userPos}
          gpsError={gpsError}
          posStale={posStale}
          bikesNeeded={bikes}
          now={nowTick}
          startedAt={startedAt}
          arrived={arrived}
          soundEnabled={soundEnabled}
          lang={lang}
          routeLabel={(from ? shortPlace(from) : '') + ' → ' + (to ? shortPlace(to) : '')}
          onPrev={() => journey.goTo(journeyLeg - 1)}
          onNext={() => journey.goTo(journeyLeg + 1)}
          onGoTo={i => journey.goTo(i)}
          onArrive={() => {
            if (from && to) {
              // echte Radminuten und -kilometer aus den Etappen, nicht geschätzt
              const stats = viewStats(journeyView, undefined, hatAbo)
              // Die einzelnen Ausleihen mitgeben: der Preis hängt an ihnen,
              // nicht an der Fahrtsumme.
              const etappen = rideLegsOf(journeyView).map(l => ({
                minutes: l.minutes,
                electric: l.electric,
              }))
              addTrip({
                from: shortPlace(from),
                to: shortPlace(to),
                // Leer, wenn ohne Standort gefahren wurde — dann lieber kein
                // Feld als eine Linie, die es nie gab.
                ...(() => {
                  const t = journey.spurHolen()
                  return t.length >= 2 ? { track: t } : {}
                })(),
                // Tatsächlich gebrauchte Zeit, nicht die geplante — dafür ist
                // das Feld da. Ohne Startzeit bleibt die Planung als Rückfall.
                seconds: startedAt
                  ? Math.max(1, Math.round((Date.now() - startedAt) / 1000))
                  : viewDuration(journeyView),
                legs: journeyView.it.legs.length,
                bikeMinutes: stats.bikeMinutes,
                bikeKm: stats.bikeKm,
                electricMinutes: stats.electricMinutes,
                legMinutes: etappen,
                electric: journeyView.hasElectric,
              })
            }
            journey.markArrived()
          }}
          onExit={journey.exit}
          onReroute={reroute}
          rerouting={rerouteLaeuft}
          follow={followMe}
          onToggleFollow={() => setFollowMe(f => !f)}
          hatAbo={hatAbo}
          headUp={headUp}
          onToggleHeadUp={() => {
            // iOS gibt den Magnetfeldsensor nur auf ausdrückliche Nachfrage
            // frei, und die Nachfrage nimmt es nur aus einer Bedienhandlung
            // heraus an — hier, beim Druck auf „in Fahrtrichtung". Von der
            // Antwort hängt nichts ab: ohne Sensor dreht die Karte weiter nach
            // dem Kurs über Grund, nur eben nicht mehr im Stand.
            void kompassFreigeben()
            setHeadUp(h => {
              localStorage.setItem('radl.headup', String(!h))
              return !h
            })
          }}
        >
          <MapGuard lang={lang}>
            <Suspense fallback={<div className="map" />}>
              <MapView
                view={journeyView}
                activeLeg={journeyLeg}
                userPos={userPos}
                bikesNeeded={bikes}
                theme={themeMode}
                cycleLayer={cycleLayer}
                follow={followMe}
                headUp={headUp}
                onUserPan={() => setFollowMe(false)}
              />
            </Suspense>
          </MapGuard>
        </JourneyMode>
      </div>
    )
  }

  function nowLocal() {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }
  function pickTimeMode(m: 'now' | 'depart' | 'arrive') {
    setTimeMode(m)
    if (m !== 'now' && !timeVal) setTimeVal(nowLocal())
  }

  const hasResults = !!views && views.length > 0
  /** Liste vorhanden, aber Orte oder Filter wurden seither geändert. */
  const listeVeraltet =
    hasResults &&
    searchedWith != null &&
    searchedWith !== sucheSchluessel(from, to, maxBike, bikeType, bikes)
  const minDuration = views ? Math.min(...views.map(viewDuration)) : Infinity
  const minTransfers = views ? Math.min(...views.map(v => v.it.legs.length)) : Infinity

  // Wiederverwendete Reiterleiste am unteren Rand
  const tabBar = (
    <nav className="tabbar">
      <button className={`tab${tab === 'route' ? ' on' : ''}`} onClick={() => setTab('route')}>
        <SendIcon size={21} />
        {t('tabRoute', lang)}
      </button>
      <button className={`tab${tab === 'bikes' ? ' on' : ''}`} onClick={() => setTab('bikes')}>
        <BikeIcon size={21} />
        {t('tabBikes', lang)}
      </button>
      <button className={`tab${tab === 'trips' ? ' on' : ''}`} onClick={() => setTab('trips')}>
        <BookmarkIcon size={21} />
        {t('tabTrips', lang)}
      </button>
    </nav>
  )

  if (tab === 'bikes') {
    return (
      <div className="app with-tabs">
        <Suspense fallback={<div className="msg">{t('calculating', lang)}</div>}>
          <MapGuard lang={lang}>
            <BikeMap
              embedded
              userPos={userPos}
              theme={themeMode}
              lang={lang}
              cycleLayer={cycleLayer}
              onSelectPlace={p => {
                setFrom(p)
                setTab('route')
              }}
              onClose={() => setTab('route')}
            />
          </MapGuard>
        </Suspense>
        {tabBar}
      </div>
    )
  }

  if (tab === 'trips') {
    return (
      <div className="app with-tabs">
        <Suspense fallback={<div className="msg">{t('calculating', lang)}</div>}>
          <History embedded lang={lang} onClose={() => setTab('route')} />
        </Suspense>
        {tabBar}
      </div>
    )
  }

  return (
    <div className="app with-tabs">
      <div className="poster">
        <div className="poster-brand">
          <LogoMark size={19} />
          <span className="poster-name">Radl Navi</span>
        </div>
        <div className="header-menu-container">
          <button className="header-menu-btn" onClick={toggleLang} title={t('langToggle', lang)}>
            {lang === 'de' ? 'EN' : 'DE'}
          </button>
          <button
            className="header-menu-btn"
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            aria-label={t('menuTitle', lang)}
            title={t('menuTitle', lang)}
          >
            <SettingsIcon size={18} />
          </button>

          {showHeaderMenu && (
            <div className="header-dropdown" onClick={() => setShowHeaderMenu(false)}>
              <button className="header-menu-item" onClick={toggleTheme}>
                {themeMode === 'dark' ? t('lightMode', lang) : t('darkMode', lang)}
              </button>
              <button className="header-menu-item" onClick={toggleSound}>
                {soundEnabled ? t('soundOn', lang) : t('soundOff', lang)}
              </button>
              <button className="header-menu-item" onClick={toggleCycleLayer}>
                {cycleLayer ? t('cycleLayerOff', lang) : t('cycleLayerOn', lang)}
              </button>
              <button
                className="header-menu-item"
                onClick={() =>
                  setHatAbo(a => {
                    localStorage.setItem('radl.abo', String(!a))
                    return !a
                  })
                }
              >
                {t(hatAbo ? 'aboAn' : 'aboAus', lang)}
              </button>
              <button className="header-menu-item" onClick={() => setShowDiag(true)}>
                Diagnose
              </button>
            </div>
          )}
        </div>
      </div>

      {!searchOpen && from && to && (
        <button className="search-summary" onClick={() => setSearchOpen(true)}>
          <span className="ss-route">
            {shortPlace(from)} <span className="ss-arrow">→</span> {shortPlace(to)}
          </span>
          <span className="ss-edit">
            {t('change', lang)} <ChevronDown size={12} />
          </span>
        </button>
      )}

      <div className={`inputs${searchOpen ? '' : ' collapsed'}`}>
        <div className="in-card">
          <div className="in-row von">
            <span className="in-label"><span className="sr-only">{t('von', lang)}</span></span>
            <PlaceInput
              placeholder={t('startPlaceholder', lang)}
              value={from}
              lang={lang}
              onSelect={setFrom}
              onPickOnMap={() => setPickOnMap('from')}
            />
          </div>
          <div className="in-row nach">
            <span className="in-label"><span className="sr-only">{t('nach', lang)}</span></span>
            <PlaceInput
              placeholder={t('toPlaceholder', lang)}
              value={to}
              lang={lang}
              onSelect={setTo}
              onPickOnMap={() => setPickOnMap('to')}
            />
            <button className="btn-swap" onClick={swap} title={t('swapPlaces', lang)}>
              <SwapIcon size={16} />
            </button>
          </div>
        </div>

        <div className="quick-presets-row">
          {PRESET_SLOTS.map(s => {
            const saved = savedPlaces.find(p => p.id === s.id)
            const target = to ?? from
            const labelText = s.id === 'home' ? t('home', lang) : s.id === 'work' ? t('work', lang) : t('uni', lang)
            const curHour = new Date().getHours()
            const isSmart = (curHour >= 7 && curHour < 10 && s.id === 'work') || (curHour >= 16 && curHour < 20 && s.id === 'home')

            return (
              <button
                key={s.id}
                className={`quick-preset-chip${saved ? ' active' : ' empty'}${isSmart ? ' smart-commute' : ''}`}
                onClick={() => {
                  if (saved) {
                    setTo(saved.place)
                    setPresetHint(null)
                  } else if (target) {
                    setSavedPlaces(upsertSaved(s, target))
                    setPresetHint(dict[lang].presetSaved(shortPlace(target), labelText))
                  } else {
                    setPresetHint(dict[lang].presetNeedsTarget(labelText))
                  }
                }}
                title={saved ? dict[lang].presetGoto(saved.place.name) : dict[lang].presetSaveAs(labelText)}
              >
                <span className="qp-icon">{saved ? <SlotIcon id={s.id} size={13} /> : '＋'}</span>{' '}
                {labelText}
                {isSmart && <span className="smart-tag" />}
                {saved && <span className="preset-dot" />}
              </button>
            )
          })}
          {savedPlaces.length > 0 && (
            <button
              className="quick-preset-chip clear"
              onClick={() => {
                for (const s of PRESET_SLOTS) removeSaved(s.id)
                setSavedPlaces(loadSaved())
                setPresetHint(t('savedPlacesCleared', lang))
              }}
              title={t('clearSavedPlaces', lang)}
            >
              <CloseIcon size={12} />
            </button>
          )}

        </div>
        {presetHint && <div className="preset-hint">{presetHint}</div>}
        {geoHint && <div className="preset-hint warn">{geoHint}</div>}

        <div className="controls">
          {/* Reihe 1: Zeitwahl über die volle Breite, rechts zwei runde Knöpfe */}
          <div className="ctl-group">
            <div className="seg seg-auto">
              {(['now', 'depart', 'arrive'] as const).map(m => (
                <button
                  key={m}
                  className={`seg-btn${timeMode === m ? ' on' : ''}`}
                  onClick={() => pickTimeMode(m)}
                >
                  {m === 'now' ? t('now', lang) : m === 'depart' ? t('depart', lang) : t('arrive', lang)}
                </button>
              ))}
            </div>

            {/* Rad-Typ und Zeitlimit — nur Symbol, den Stand zeigt der Punkt */}
            <button
              className="filter-chip"
              onClick={() => setShowFilterModal(true)}
              aria-label={t('filterTitle', lang)}
              title={`${bikeType === 'classic' ? t('standard', lang) : t('ebike', lang)} · ${
                maxBike === 9999 ? t('noLimit', lang) : `≤ ${maxBike}′`
              }${bikes > 1 ? ` · ${bikes} ${t('bikeCount', lang)}` : ''}`}
            >
              {bikeType === 'classic' ? <BikeIcon size={16} /> : <BoltIcon size={16} />}
              {bikes > 1 && <span className="chip-count">{bikes}</span>}
            </button>

            {from && to && (
              <button
                className="fav-chip save"
                onClick={() => {
                  addFavRoute(from, to)
                  setFavRoutes(loadFavRoutes())
                }}
                aria-label={t('saveRoute', lang)}
                title={t('saveRoute', lang)}
              >
                <BookmarkIcon size={15} />
              </button>
            )}
          </div>

          {timeMode !== 'now' && (
            <input
              type="datetime-local"
              className="time-input"
              value={timeVal}
              onChange={e => setTimeVal(e.target.value)}
            />
          )}

          {/* Reihe 2: Suche über die volle Breite */}
          <button className="btn-route-chip" disabled={!from || !to || loading} onClick={() => search()}>
            <SendIcon size={15} />
            {loading ? '…' : t('routeBtn', lang)}
          </button>
        </div>

        {favRoutes.length > 0 && (
          <div className="favs">
            {favRoutes.map(fr => (
              <button key={fr.id} className="fav-chip" onClick={() => runFav(fr.from, fr.to)}>
                {shortPlace(fr.from)} → {shortPlace(fr.to)}
                <span
                  className="fav-del"
                  onClick={e => {
                    e.stopPropagation()
                    removeFavRoute(fr.id)
                    setFavRoutes(loadFavRoutes())
                  }}
                >
                  <CloseIcon size={11} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Übersichtskarte mit Wetterhinweis — wie im Entwurf über der Liste */}
      {hasResults && (
        <div className="results-map" ref={mapBoxRef}>
          <MapGuard lang={lang}>
            <Suspense fallback={<div className="map" />}>
              <MapView
                view={selectedView}
                userPos={userPos}
                bikesNeeded={bikes}
                theme={themeMode}
                cycleLayer={cycleLayer}
              />
            </Suspense>
          </MapGuard>
          {weather && (
            <button
              className={`weather${weather.rain ? ' rain' : ''}`}
              onClick={() => setShowWeatherModal(true)}
              title={t('filterTitle', lang)}
            >
              {weather.rain ? <RainIcon size={13} /> : <SunIcon size={13} />}
              {weather.rain
                ? `${weather.temp}° · ${weather.precip.toFixed(1)} mm`
                : `${weather.temp}° · ${t('dry', lang)}`}
            </button>
          )}
        </div>
      )}

      <section className="results">
        {/* Ohne diesen Hinweis blieb die alte Liste kommentarlos stehen, wenn man
            im Filter etwas umstellte oder ein anderes Ziel wählte — im
            schlimmsten Fall fuhr man mit „LOS" zum vorherigen Ziel. */}
        {listeVeraltet && (
          <button className="stale-hint" onClick={() => search()}>
            {t('resultsStale', lang)}
            <span className="stale-action">{t('routeBtn', lang)}</span>
          </button>
        )}
        {errorKey && (
          <div className="msg error">
            {t(errorKey, lang)}
            <button className="retry-btn" onClick={() => search()}>{t('retry', lang)}</button>
          </div>
        )}
        {!errorKey && !views && !loading && (
          <div className="msg">
            {t('welcomeMsg', lang)}
          </div>
        )}
        {loading && <div className="msg">{t('calculating', lang)}</div>}
        {views && views.length === 0 && (
          <div className="msg">
            {t('noRoutesFound', lang)}
          </div>
        )}
        {hasResults && (
          <div className="results-list">
            {views.map((v, i) => {
              const isFastest = viewDuration(v) === minDuration
              const isFree = !v.hasElectric && !v.warnLong && !v.warnReturn
              const isFewestTransfers = v.it.legs.length === minTransfers
              return (
                <ItineraryCard
                  key={i}
                  view={v}
                  index={i}
                  selected={i === sel}
                  bikesNeeded={bikes}
                  now={nowTick}
                  isFastest={isFastest}
                  isFree={isFree}
                  isFewestTransfers={isFewestTransfers}
                  lang={lang}
                  onSelect={() => setSel(i)}
                  onGo={() => {
                    // Die angezeigten Radzahlen stammen vom Zeitpunkt der
                    // Suche. Wer die Liste zwanzig Minuten offen hatte, fährt
                    // sonst auf einen Bestand zu, den es nicht mehr gibt —
                    // deshalb vor dem Losfahren still nachladen.
                    if (from && to && Date.now() - (searchedAt ?? 0) > 3 * 60_000) {
                      search(from, to)
                      return
                    }
                    // Nachführung wieder einschalten: sie blieb sonst für den
                    // Rest der Sitzung aus, sobald man die Karte einmal
                    // angefasst hatte — „folgt mir gar nicht mehr".
                    // Um die Erlaubnis für Meldungen hier fragen, nicht später:
                    // Browser verlangen dafür eine echte Nutzeraktion, und der
                    // Druck auf „LOS" ist die letzte vor der Radetappe.
                    ensureNotificationPermission()
                    journey.start()
                  }}
                />
              )
            })}
          </div>
        )}

        <footer className="app-footer">
          Made with ❤️ by <b>NELD</b> · {t('appSub', lang)}
          <br />
          <a href="https://transitous.org" target="_blank" rel="noreferrer">
            Transitous
          </a>{' '}
          · MyRadl/nextbike (CC0) ·{' '}
          <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>{' '}
          (CC BY 4.0) · OpenFreeMap ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap
          </a>
        </footer>
      </section>

      {tabBar}

      {showDiag && (
        <Suspense fallback={null}>
          <Diag onClose={() => setShowDiag(false)} />
        </Suspense>
      )}

      {showFilterModal && (
        <FilterModal
          bikeType={bikeType}
          maxBike={maxBike}
          bikes={bikes}
          lang={lang}
          onSelectBikeType={setBikeType}
          onSelectMaxBike={setMaxBike}
          onSelectBikes={setBikes}
          onClose={() => setShowFilterModal(false)}
        />
      )}

      {showWeatherModal && weather?.hourly && (
        <div className="filter-modal-backdrop" onClick={() => setShowWeatherModal(false)}>
          <div className="filter-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-grabber" />
            <div className="filter-modal-head">
              <div className="filter-modal-title">
                <span>{t('weatherTitle', lang)}</span>
              </div>
              <button className="filter-modal-close" onClick={() => setShowWeatherModal(false)}>
                <CloseIcon size={13} />
              </button>
            </div>

            <div className={`weather-advice${weather.rain ? ' rain' : ''}`}>
              {weather.rain
                ? dict[lang].weatherRain(weather.timeLabel, weather.precip.toFixed(1), weather.temp)
                : dict[lang].weatherDry(weather.timeLabel, weather.temp)}
            </div>

            <div className="weather-hourly-list">
              {weather.hourly.map((h, i) => (
                <div key={i} className={`weather-hour-row${h.rain ? ' rain' : ''}`}>
                  <span className="wh-time">{dict[lang].weatherHour(h.timeLabel)}</span>
                  <span className="wh-icon">{h.rain ? <RainIcon size={14} /> : <SunIcon size={14} />}</span>
                  <span className="wh-temp">{h.temp}°C</span>
                  <span className="wh-precip">
                    {h.precip > 0 ? dict[lang].weatherPrecip(h.precip.toFixed(1)) : t('dryCap', lang)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
