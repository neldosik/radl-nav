import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import MapView from './components/MapView'
import FilterModal from './components/FilterModal'

const MapPicker = lazy(() => import('./components/MapPicker'))
const BikeMap = lazy(() => import('./components/BikeMap'))
const History = lazy(() => import('./components/History'))
import { addTrip } from './history'
import { fetchWeatherAt, getGeolocation, loadFreeBikes, loadStations, reverseGeocode } from './api'
import type { WeatherAtTime } from './api'
import { clusterFreeBikes } from './geo'
import { searchRoutes } from './routing'
import { useTheme } from './hooks/useTheme'
import { useJourney } from './hooks/useJourney'
import { addFavRoute, loadFavRoutes, loadSaved, PRESET_SLOTS, removeFavRoute, removeSaved, shortPlace, upsertSaved } from './places'
import type { FavRoute, SavedPlace } from './places'
import { BikeIcon, BoltIcon, BookmarkIcon, ChevronDown, LogoMark, SendIcon, SwapIcon } from './icons'
import type { ItineraryView, Place } from './types'
import { loadLanguage, saveLanguage, t } from './i18n'
import type { Language } from './i18n'

export default function App() {
  const [lang, setLang] = useState<Language>(() => loadLanguage())
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => localStorage.getItem('radl.sound') !== 'false')

  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [bikes] = useState(1)
  const [maxBike, setMaxBike] = useState(() => {
    const saved = Number(localStorage.getItem('radl.maxbike'))
    return [10, 15, 20, 30, 9999].includes(saved) ? saved : 20
  })
  const [bikeType, setBikeType] = useState<'classic' | 'any'>(() =>
    localStorage.getItem('radl.biketype') === 'any' ? 'any' : 'classic',
  )
  const [timeMode, setTimeMode] = useState<'now' | 'depart' | 'arrive'>('now')
  const [timeVal, setTimeVal] = useState('')

  const [views, setViews] = useState<ItineraryView[] | null>(null)
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherAtTime | null>(null)
  const [favRoutes, setFavRoutes] = useState<FavRoute[]>(() => loadFavRoutes())
  const [showWeatherModal, setShowWeatherModal] = useState(false)
  const [nowTick, setNowTick] = useState(Date.now())
  const [pickOnMap, setPickOnMap] = useState<'from' | 'to' | null>(null)
  /** Untere Reiter: Route (Suche), Räder (Karte), Fahrten (Verlauf) */
  const [tab, setTab] = useState<'route' | 'bikes' | 'trips'>('route')
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const searchCtrl = useRef<AbortController | null>(null)
  const mapBoxRef = useRef<HTMLDivElement>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => loadSaved())
  const [presetHint, setPresetHint] = useState<string | null>(null)

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

  useEffect(() => {
    if (!presetHint) return
    const id = window.setTimeout(() => setPresetHint(null), 3000)
    return () => window.clearTimeout(id)
  }, [presetHint])

  const { theme: themeMode, toggleTheme } = useTheme()

  const selectedView = views?.[sel] ?? null
  const journey = useJourney(selectedView)
  const { legIndex: journeyLeg, startedAt, arrived, userPos, distToEnd } = journey

  useEffect(() => {
    getGeolocation()
      .then(async pos => {
        journey.setUserPos(pos)
        const name = await reverseGeocode(pos.lat, pos.lon).catch(() => t('myLocation', lang))
        setFrom(f => f ?? { name, lat: pos.lat, lon: pos.lon })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const journeyView = journeyLeg != null ? selectedView : null

  useEffect(() => {
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

  async function search(f: Place | null = from, tPl: Place | null = to) {
    if (!f || !tPl) return
    searchCtrl.current?.abort()
    const ctrl = new AbortController()
    searchCtrl.current = ctrl
    setLoading(true)
    setError(null)
    setViews(null)
    setWeather(null)
    const when = timeMode !== 'now' && timeVal ? new Date(timeVal) : undefined
    const timeOpts = when ? { time: when, arriveBy: timeMode === 'arrive' } : {}
    try {
      const [stations, freeBikes] = await Promise.all([loadStations(), loadFreeBikes()])
      if (ctrl.signal.aborted) return
      const supply = [...stations, ...clusterFreeBikes(freeBikes)]
      const list = await searchRoutes(f, tPl, {
        stations,
        supply,
        maxBikeSec: maxBike * 60,
        classicOnly: bikeType === 'classic',
        time: timeOpts,
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      setViews(list)
      setSel(0)
      if (list.length) {
        const firstLeg = list[0].it.legs[0]
        const startTimeStr = firstLeg?.startTime ?? list[0].it.startTime
        const bestTime = new Date(startTimeStr)
        fetchWeatherAt(f.lat, f.lon, bestTime).then(w => {
          if (!ctrl.signal.aborted) setWeather(w)
        })
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        const isNetwork = !navigator.onLine || e?.message?.includes('fetch') || e?.message?.includes('network')
        setError(isNetwork ? t('networkError', lang) : (e?.message ?? t('noRoutesFound', lang)))
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
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
        <MapPicker
          title={pickOnMap === 'from'
            ? (lang === 'en' ? 'Select Start on Map' : 'Startpunkt auf Karte wählen')
            : (lang === 'en' ? 'Select Destination on Map' : 'Zielpunkt auf Karte wählen')
          }
          initial={pickOnMap === 'from' ? from : to}
          theme={themeMode}
          lang={lang}
          onPick={p => {
            if (pickOnMap === 'from') setFrom(p)
            else setTo(p)
            setPickOnMap(null)
          }}
          onClose={() => setPickOnMap(null)}
        />
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
          hasGeo={userPos != null}
          bikesNeeded={bikes}
          now={nowTick}
          startedAt={startedAt}
          arrived={arrived}
          soundEnabled={soundEnabled}
          lang={lang}
          routeLabel={(from ? shortPlace(from) : '') + ' → ' + (to ? shortPlace(to) : '')}
          onPrev={() => journey.goTo(journeyLeg - 1)}
          onNext={() => journey.goTo(journeyLeg + 1)}
          onArrive={() => {
            if (from && to) {
              const bikeLegMins = Array.from(journeyView.bikeLegs.values()).reduce((acc, b) => acc + (b.tooLong ? 30 : 15), 0)
              addTrip({
                from: shortPlace(from),
                to: shortPlace(to),
                seconds: journeyView.it.duration,
                legs: journeyView.it.legs.length,
                bikeMinutes: bikeLegMins,
                electric: journeyView.hasElectric,
              })
            }
            journey.markArrived()
          }}
          onExit={journey.exit}
        >
          <MapView
            view={journeyView}
            activeLeg={journeyLeg}
            userPos={userPos}
            bikesNeeded={bikes}
            theme={themeMode}
          />
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
  const minDuration = views ? Math.min(...views.map(v => v.it.duration)) : Infinity
  const minTransfers = views ? Math.min(...views.map(v => v.it.legs.length)) : Infinity

  // Реиспользуемая нижняя панель вкладок
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
      <div className="app">
        <Suspense fallback={<div className="msg">{t('calculating', lang)}</div>}>
          <BikeMap
            embedded
            userPos={userPos}
            theme={themeMode}
            lang={lang}
            onSelectPlace={p => {
              setFrom(p)
              setTab('route')
            }}
            onClose={() => setTab('route')}
          />
        </Suspense>
        {tabBar}
      </div>
    )
  }

  if (tab === 'trips') {
    return (
      <div className="app">
        <Suspense fallback={<div className="msg">{t('calculating', lang)}</div>}>
          <History embedded lang={lang} onClose={() => setTab('route')} />
        </Suspense>
        {tabBar}
      </div>
    )
  }

  return (
    <div className="app">
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
            title={t('menuTitle', lang)}
          >
            ⋯
          </button>

          {showHeaderMenu && (
            <div className="header-dropdown" onClick={() => setShowHeaderMenu(false)}>
              <button className="header-menu-item" onClick={toggleTheme}>
                {themeMode === 'dark' ? t('lightMode', lang) : t('darkMode', lang)}
              </button>
              <button className="header-menu-item" onClick={toggleSound}>
                {soundEnabled ? t('soundOn', lang) : t('soundOff', lang)}
              </button>
              <button className="header-menu-item" onClick={() => setShowFilterModal(true)}>
                {t('filterTitle', lang)}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="inputs">
        <div className="in-card">
          <div className="in-row von">
            <span className="in-label">{t('von', lang)}</span>
            <PlaceInput
              placeholder={t('startPlaceholder', lang)}
              value={from}
              lang={lang}
              onSelect={setFrom}
              onPickOnMap={() => setPickOnMap('from')}
            />
          </div>
          <div className="in-row nach">
            <span className="in-label">{t('nach', lang)}</span>
            <PlaceInput
              placeholder={t('toPlaceholder', lang)}
              value={to}
              lang={lang}
              onSelect={setTo}
              onPickOnMap={() => setPickOnMap('to')}
            />
            <button className="btn-swap" onClick={swap} title="Start / Ziel tauschen">
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
                    setPresetHint(`»${shortPlace(target)}« ${s.label}`)
                  } else {
                    setPresetHint(`Ziel wählen, dann als ${labelText} speichern`)
                  }
                }}
                title={saved ? `Ziel: ${saved.place.name}` : `Als ${labelText} speichern`}
              >
                <span>{saved ? s.emoji : '＋'}</span> {labelText}
                {isSmart && <span className="smart-tag">⚡</span>}
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
                setPresetHint(lang === 'en' ? 'Saved places cleared' : 'Gespeicherte Orte gelöscht')
              }}
              title="Gespeicherte Orte löschen"
            >
              ✕
            </button>
          )}

          {/* Rad-Typ und Zeitlimit — ein Chip statt zweier Schalterreihen */}
          <button
            className="filter-chip"
            onClick={() => setShowFilterModal(true)}
            title={t('filterTitle', lang)}
          >
            {bikeType === 'classic' ? <BikeIcon size={14} /> : <BoltIcon size={14} />}
            <span>
              {bikeType === 'classic' ? t('standard', lang) : t('ebike', lang)} ·{' '}
              {maxBike === 9999 ? t('noLimit', lang) : `≤ ${maxBike}′`}
            </span>
            <ChevronDown size={12} />
          </button>
        </div>
        {presetHint && <div className="preset-hint">{presetHint}</div>}

        <div className="controls">
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
            {timeMode !== 'now' && (
              <input
                type="datetime-local"
                className="time-input"
                value={timeVal}
                onChange={e => setTimeVal(e.target.value)}
              />
            )}
          </div>

          <div className="ctl-row-actions">
            {from && to && (
              <button
                className="fav-chip save"
                onClick={() => {
                  addFavRoute(from, to)
                  setFavRoutes(loadFavRoutes())
                }}
                title={t('saveRoute', lang)}
              >
                <BookmarkIcon size={13} /> {t('saveRoute', lang)}
              </button>
            )}

            <button className="btn-route-chip" disabled={!from || !to || loading} onClick={() => search()}>
              <SendIcon size={15} />
              {loading ? '…' : t('routeBtn', lang)}
            </button>
          </div>
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
                  ✕
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Übersichtskarte mit Wetterhinweis — wie im Entwurf über der Liste */}
      {hasResults && (
        <div className="results-map" ref={mapBoxRef}>
          <MapView view={selectedView} userPos={userPos} bikesNeeded={bikes} theme={themeMode} />
          {weather && (
            <button
              className={`weather${weather.rain ? ' rain' : ''}`}
              onClick={() => setShowWeatherModal(true)}
              title={t('filterTitle', lang)}
            >
              {weather.rain
                ? `🌧️ ${weather.temp}° · ${weather.precip.toFixed(1)} mm`
                : `☀️ ${weather.temp}° · ${t('dry', lang)}`}
            </button>
          )}
        </div>
      )}

      <section className="results">
        {error && (
          <div className="msg error">
            {error}
            <button className="retry-btn" onClick={() => search()}>{t('retry', lang)}</button>
          </div>
        )}
        {!error && !views && !loading && (
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
              const isFastest = v.it.duration === minDuration
              const isFree = !v.hasElectric && !v.warnLong
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
                  onGo={() => journey.start()}
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

      {showFilterModal && (
        <FilterModal
          bikeType={bikeType}
          maxBike={maxBike}
          lang={lang}
          onSelectBikeType={setBikeType}
          onSelectMaxBike={setMaxBike}
          onClose={() => setShowFilterModal(false)}
        />
      )}

      {showWeatherModal && weather?.hourly && (
        <div className="filter-modal-backdrop" onClick={() => setShowWeatherModal(false)}>
          <div className="filter-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-grabber" />
            <div className="filter-modal-head">
              <div className="filter-modal-title">
                <span>🌦️ {lang === 'en' ? 'Weather Radar & Rain Forecast' : 'Wetter-Radar & Niederschlag'}</span>
              </div>
              <button className="filter-modal-close" onClick={() => setShowWeatherModal(false)}>✕</button>
            </div>

            <div className="weather-hourly-list">
              {weather.hourly.map((h, i) => (
                <div key={i} className={`weather-hour-row${h.rain ? ' rain' : ''}`}>
                  <span className="wh-time">{h.timeLabel} Uhr</span>
                  <span className="wh-icon">{h.rain ? '🌧️' : '☀️'}</span>
                  <span className="wh-temp">{h.temp}°C</span>
                  <span className="wh-precip">{h.precip > 0 ? `${h.precip.toFixed(1)} mm/h` : (lang === 'en' ? 'Dry' : 'Trocken')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
