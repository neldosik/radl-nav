import { useEffect, useRef, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import MapView from './components/MapView'
import MapPicker from './components/MapPicker'
import BikeMap from './components/BikeMap'
import History from './components/History'
import { addTrip } from './history'
import { fetchWeatherAt, getGeolocation, loadFreeBikes, loadStations } from './api'
import type { WeatherAtTime } from './api'
import { clusterFreeBikes } from './geo'
import { searchRoutes } from './routing'
import { useTheme } from './hooks/useTheme'
import { useJourney } from './hooks/useJourney'
import { addFavRoute, loadFavRoutes, loadSaved, PRESET_SLOTS, removeFavRoute, removeSaved, shortPlace, upsertSaved } from './places'
import type { SavedPlace } from './places'
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
  const [favVer, setFavVer] = useState(0)
  const [nowTick, setNowTick] = useState(Date.now())
  const [pickOnMap, setPickOnMap] = useState<'from' | 'to' | null>(null)
  const [showBikeMap, setShowBikeMap] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const [showFilterModal, setShowFilterModal] = useState(false)
  const searchCtrl = useRef<AbortController | null>(null)
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
      .then(pos => journey.setUserPos(pos))
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
        setError(e?.message ?? (lang === 'en' ? 'Search failed' : 'Suche fehlgeschlagen'))
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
      <MapPicker
        title={pickOnMap === 'from'
          ? (lang === 'en' ? 'Select Start on Map' : 'Startpunkt auf Karte wählen')
          : (lang === 'en' ? 'Select Destination on Map' : 'Zielpunkt auf Karte wählen')
        }
        initial={pickOnMap === 'from' ? from : to}
        theme={themeMode}
        onPick={p => {
          if (pickOnMap === 'from') setFrom(p)
          else setTo(p)
          setPickOnMap(null)
        }}
        onClose={() => setPickOnMap(null)}
      />
    )
  }

  if (showBikeMap) {
    return (
      <BikeMap
        userPos={userPos}
        theme={themeMode}
        onSelectPlace={p => {
          setFrom(p)
          setShowBikeMap(false)
        }}
        onClose={() => setShowBikeMap(false)}
      />
    )
  }

  if (showHistory) {
    return (
      <History
        onClose={() => setShowHistory(false)}
      />
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

  return (
    <div className="app">
      <div className="poster">
        <div className="poster-brand">
          <LogoMark size={20} />
          <span className="poster-name">RADL NAVI</span>
          <span className="poster-sub">{t('appSub', lang)}</span>
        </div>
        <div className="header-menu-container">
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
              <button className="header-menu-item" onClick={toggleLang}>
                {t('langToggle', lang)}
              </button>
              <button className="header-menu-item" onClick={toggleSound}>
                {soundEnabled ? t('soundOn', lang) : t('soundOff', lang)}
              </button>
              <button
                className="header-menu-item"
                onClick={() => {
                  setShowHistory(true)
                  setShowHeaderMenu(false)
                }}
              >
                {t('myTrips', lang)}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="inputs">
        <div className="in-row von">
          <span className="in-label">{t('von', lang)}</span>
          <PlaceInput
            placeholder={t('startPlaceholder', lang)}
            value={from}
            onSelect={setFrom}
            onPickOnMap={() => setPickOnMap('from')}
          />
        </div>
        <div className="in-row nach">
          <button className="btn-swap" onClick={swap} title="Start / Ziel tauschen">
            <SwapIcon size={14} />
          </button>
          <span className="in-label">{t('nach', lang)}</span>
          <PlaceInput
            placeholder={t('toPlaceholder', lang)}
            value={to}
            onSelect={setTo}
            onPickOnMap={() => setPickOnMap('to')}
          />
        </div>

        <div className="quick-presets-row">
          {PRESET_SLOTS.map(s => {
            const saved = savedPlaces.find(p => p.id === s.id)
            const target = to ?? from
            const labelText = s.id === 'home' ? t('home', lang) : s.id === 'work' ? t('work', lang) : t('uni', lang)
            return (
              <button
                key={s.id}
                className={`quick-preset-chip${saved ? ' active' : ' empty'}`}
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
        </div>
        {presetHint && <div className="preset-hint">{presetHint}</div>}

        <div className="controls">
          <div className="ctl-group">
            <span className="ctl-label">{t('time', lang)}</span>
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

          <div className="ctl-group">
            <span className="ctl-label">{t('bike', lang)}</span>
            <button
              className="filter-chip"
              onClick={() => setShowFilterModal(true)}
              title="Fahrrad-Typ & Zeitlimit"
            >
              {bikeType === 'classic' ? <BikeIcon size={14} /> : <BoltIcon size={14} />}
              <span>
                {bikeType === 'classic' ? t('standard', lang) : t('ebike', lang)} · {maxBike === 9999 ? t('noLimit', lang) : `≤ ${maxBike}′`}
              </span>
              <ChevronDown size={12} />
            </button>
          </div>

          <div className="ctl-row-actions">
            {from && to ? (
              <button
                className="fav-chip save"
                onClick={() => {
                  addFavRoute(from, to)
                  setFavVer(v => v + 1)
                }}
                title={t('saveRoute', lang)}
              >
                <BookmarkIcon size={12} /> {t('saveRoute', lang)}
              </button>
            ) : (
              <div className="fav-placeholder" />
            )}

            <button
              className="btn-bikemap"
              onClick={() => setShowBikeMap(true)}
              title={t('bikesNearby', lang)}
            >
              <BikeIcon size={13} /> {t('bikesNearby', lang)}
            </button>

            <button className="btn-route-chip" disabled={!from || !to || loading} onClick={() => search()}>
              <SendIcon size={13} />
              {loading ? '…' : t('routeBtn', lang)}
            </button>
          </div>
        </div>

        {loadFavRoutes().length > 0 && (
          <div className="favs">
            {loadFavRoutes().map(fr => (
              <button key={fr.id} className="fav-chip" onClick={() => runFav(fr.from, fr.to)}>
                {shortPlace(fr.from)} → {shortPlace(fr.to)}
                <span
                  className="fav-del"
                  onClick={e => {
                    e.stopPropagation()
                    removeFavRoute(fr.id)
                    setFavVer(v => v + 1)
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
            <span hidden>{favVer}</span>
          </div>
        )}
      </div>

      <section className="results">
        {error && <div className="msg error">{error}</div>}
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
        {hasResults && weather && (
          <div className={`weather${weather.rain ? ' rain' : ''}`}>
            {weather.rain
              ? `🌧️ Regen um ${weather.timeLabel} (${weather.precip.toFixed(1)} mm) · ${weather.temp}° — bei Radetappen lieber MVV`
              : `☀️ Trocken um ${weather.timeLabel} · ${weather.temp}° — gute Radzeit`}
          </div>
        )}
        {hasResults && (
          <div className="results-map">
            <MapView view={selectedView} userPos={userPos} bikesNeeded={bikes} theme={themeMode} />
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
      </section>

      {showFilterModal && (
        <div className="filter-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="filter-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-grabber" />

            <div className="filter-modal-head">
              <div className="filter-modal-title">
                <BikeIcon size={18} />
                <span>{t('filterTitle', lang)}</span>
              </div>
              <button className="filter-modal-close" onClick={() => setShowFilterModal(false)}>
                ✕
              </button>
            </div>

            <div className="filter-card">
              <label className="filter-label">{t('bikeTypeLabel', lang)}</label>
              <div className="filter-type-grid">
                <div
                  className={`filter-type-card${bikeType === 'classic' ? ' active' : ''}`}
                  onClick={() => {
                    setBikeType('classic')
                    localStorage.setItem('radl.biketype', 'classic')
                  }}
                >
                  <div className="ft-icon"><BikeIcon size={20} /></div>
                  <div className="ft-name">Standard</div>
                  <div className="ft-sub">{t('standardSub', lang)}</div>
                </div>

                <div
                  className={`filter-type-card${bikeType === 'any' ? ' active' : ''}`}
                  onClick={() => {
                    setBikeType('any')
                    localStorage.setItem('radl.biketype', 'any')
                  }}
                >
                  <div className="ft-icon"><BoltIcon size={20} /></div>
                  <div className="ft-name">E-Bikes</div>
                  <div className="ft-sub">{t('ebikeSub', lang)}</div>
                </div>
              </div>
            </div>

            <div className="filter-card">
              <label className="filter-label">{t('maxBikeTime', lang)}</label>
              <div className="filter-time-pills">
                {[10, 15, 20, 30, 9999].map(n => (
                  <button
                    key={n}
                    className={`filter-time-pill${maxBike === n ? ' active' : ''}`}
                    onClick={() => {
                      setMaxBike(n)
                      localStorage.setItem('radl.maxbike', String(n))
                    }}
                  >
                    {n === 9999 ? t('noLimit', lang) : `${n}′`}
                  </button>
                ))}
              </div>
            </div>

            <button className="filter-modal-apply" onClick={() => setShowFilterModal(false)}>
              {t('applyFilter', lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
