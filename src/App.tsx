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

export default function App() {
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

  async function search(f: Place | null = from, t: Place | null = to) {
    if (!f || !t) return
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
      const list = await searchRoutes(f, t, {
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
        setError(e?.message ?? 'Suche fehlgeschlagen')
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

  function runFav(f: Place, t: Place) {
    setFrom(f)
    setTo(t)
    search(f, t)
  }

  if (pickOnMap) {
    return (
      <MapPicker
        title={pickOnMap === 'from' ? 'Startpunkt auf Karte wählen' : 'Zielpunkt auf Karte wählen'}
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

  return (
    <div className="app">
      <div className="poster">
        <div className="poster-brand">
          <LogoMark size={20} />
          <span className="poster-name">RADL NAVI</span>
          <span className="poster-sub">MYRADL + MVV</span>
        </div>
        <div className="header-menu-container">
          <button
            className="header-menu-btn"
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            title="Hauptmenü"
          >
            ⋯
          </button>

          {showHeaderMenu && (
            <div className="header-dropdown" onClick={() => setShowHeaderMenu(false)}>
              <button className="header-menu-item" onClick={toggleTheme}>
                {themeMode === 'dark' ? '☀️ Heller Modus' : '🌙 Dunkler Modus'}
              </button>
              <button
                className="header-menu-item"
                onClick={() => {
                  setShowHistory(true)
                  setShowHeaderMenu(false)
                }}
              >
                📖 Meine Fahrten
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="inputs">
        <div className="in-row von">
          <span className="in-label">VON</span>
          <PlaceInput
            placeholder="Startpunkt"
            value={from}
            onSelect={setFrom}
            onPickOnMap={() => setPickOnMap('from')}
          />
        </div>
        <div className="in-row nach">
          <button className="btn-swap" onClick={swap} title="Start und Ziel tauschen">
            <SwapIcon size={14} />
          </button>
          <span className="in-label">NACH</span>
          <PlaceInput
            placeholder="Ziel"
            value={to}
            onSelect={setTo}
            onPickOnMap={() => setPickOnMap('to')}
          />
        </div>

        <div className="quick-presets-row">
          {PRESET_SLOTS.map(s => {
            const saved = savedPlaces.find(p => p.id === s.id)
            const target = to ?? from
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
                    setPresetHint(`»${shortPlace(target)}« als ${s.label} gespeichert`)
                  } else {
                    setPresetHint(`Erst Ziel wählen, dann als ${s.label} speichern`)
                  }
                }}
                title={saved ? `Ziel: ${saved.place.name}` : `Als ${s.label} speichern`}
              >
                <span>{saved ? s.emoji : '＋'}</span> {s.label}
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
                setPresetHint('Gespeicherte Orte gelöscht')
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
            <span className="ctl-label">Zeit</span>
            <div className="seg seg-auto">
              {(['now', 'depart', 'arrive'] as const).map(m => (
                <button
                  key={m}
                  className={`seg-btn${timeMode === m ? ' on' : ''}`}
                  onClick={() => pickTimeMode(m)}
                >
                  {m === 'now' ? 'Jetzt' : m === 'depart' ? 'Abfahrt' : 'Ankunft'}
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
            <span className="ctl-label">Rad</span>
            <button
              className="filter-chip"
              onClick={() => setShowFilterModal(true)}
              title="Fahrrad-Typ & Zeitlimit anpassen"
            >
              {bikeType === 'classic' ? <BikeIcon size={14} /> : <BoltIcon size={14} />}
              <span>
                {bikeType === 'classic' ? 'Standard' : 'E-Bike'} · {maxBike === 9999 ? '∞ Limit' : `≤ ${maxBike}′`}
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
                title="Diese Strecke merken"
              >
                <BookmarkIcon size={12} /> Strecke merken
              </button>
            ) : (
              <div className="fav-placeholder" />
            )}

            <button
              className="btn-bikemap"
              onClick={() => setShowBikeMap(true)}
              title="Räder in der Nähe auf der Karte"
            >
              <BikeIcon size={13} /> Räder in der Nähe
            </button>

            <button className="btn-route-chip" disabled={!from || !to || loading} onClick={() => search()}>
              <SendIcon size={13} />
              {loading ? '…' : 'Route'}
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
            Wähle Start und Ziel — dann berechne ich Kombinationen aus Rad + MVV mit deinen 30
            Freiminuten im Blick.
          </div>
        )}
        {loading && <div className="msg">Berechne Rad + MVV …</div>}
        {views && views.length === 0 && (
          <div className="msg">
            Unter «Rad {maxBike === 9999 ? '∞' : `≤ ${maxBike} Min`}» nichts gefunden — erhöhe das Limit oder wähle andere Punkte.
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
            {views.map((v, i) => (
              <ItineraryCard
                key={i}
                view={v}
                index={i}
                selected={i === sel}
                bikesNeeded={bikes}
                now={nowTick}
                onSelect={() => setSel(i)}
                onGo={() => journey.start()}
              />
            ))}
          </div>
        )}
      </section>

      {showFilterModal && (
        <div className="filter-modal-backdrop" onClick={() => setShowFilterModal(false)}>
          <div className="filter-modal" onClick={e => e.stopPropagation()}>
            <div className="filter-modal-head">
              <span>Fahrrad-Typ & Zeitlimit</span>
              <button className="filter-modal-close" onClick={() => setShowFilterModal(false)}>
                ✕
              </button>
            </div>

            <div className="filter-modal-section">
              <label className="filter-label">Fahrrad-Typ</label>
              <div className="seg seg-auto font-large">
                <button
                  className={`seg-btn${bikeType === 'classic' ? ' on' : ''}`}
                  onClick={() => {
                    setBikeType('classic')
                    localStorage.setItem('radl.biketype', 'classic')
                  }}
                >
                  <BikeIcon size={15} /> Standard (30 Min frei)
                </button>
                <button
                  className={`seg-btn${bikeType === 'any' ? ' on' : ''}`}
                  onClick={() => {
                    setBikeType('any')
                    localStorage.setItem('radl.biketype', 'any')
                  }}
                >
                  <BoltIcon size={14} /> Alle (inkl. E-Bike)
                </button>
              </div>
            </div>

            <div className="filter-modal-section">
              <label className="filter-label">Maximalzeit auf dem Rad (pro Etappe)</label>
              <div className="filter-time-options">
                {[10, 15, 20, 30, 9999].map(n => (
                  <button
                    key={n}
                    className={`filter-time-btn${maxBike === n ? ' on' : ''}`}
                    onClick={() => {
                      setMaxBike(n)
                      localStorage.setItem('radl.maxbike', String(n))
                    }}
                  >
                    {n === 9999 ? '∞ Ohne Limit' : `${n} Min`}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn-block filter-modal-apply" onClick={() => setShowFilterModal(false)}>
              Übernehmen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
