import { useEffect, useRef, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import MapView from './components/MapView'
import MapPicker from './components/MapPicker'
import StationWidget from './components/StationWidget'
import { fetchWeatherAt, getGeolocation, loadFreeBikes, loadStations } from './api'
import type { WeatherAtTime } from './api'
import { clusterFreeBikes } from './geo'
import { searchRoutes } from './routing'
import { useTheme } from './hooks/useTheme'
import { useJourney } from './hooks/useJourney'
import { addFavRoute, loadFavRoutes, loadSaved, PRESET_SLOTS, removeFavRoute, shortPlace, upsertSaved } from './places'
import type { SavedPlace } from './places'
import { BikeIcon, BoltIcon, LogoMark, SendIcon, StarIcon, SwapIcon } from './icons'
import type { ItineraryView, Place, Station } from './types'

export default function App() {
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [bikes, setBikes] = useState(1)
  const [maxBike, setMaxBike] = useState(() => {
    const saved = Number(localStorage.getItem('radl.maxbike'))
    return [10, 15, 20, 30].includes(saved) ? saved : 20
  })
  const [bikeType, setBikeType] = useState<'classic' | 'any'>(() =>
    localStorage.getItem('radl.biketype') === 'any' ? 'any' : 'classic',
  )
  const [timeMode, setTimeMode] = useState<'now' | 'depart' | 'arrive'>('now')
  const [timeVal, setTimeVal] = useState('') // значение <input type="datetime-local">

  const [views, setViews] = useState<ItineraryView[] | null>(null)
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weather, setWeather] = useState<WeatherAtTime | null>(null)
  const [favVer, setFavVer] = useState(0) // форс-обновление списка любимых
  const [nowTick, setNowTick] = useState(Date.now()) // для живого отсчёта до отправления
  const [pickOnMap, setPickOnMap] = useState<'from' | 'to' | null>(null)
  const [liveStations, setLiveStations] = useState<Station[]>([])
  const searchCtrl = useRef<AbortController | null>(null) // laufende Suche abbrechbar
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => loadSaved())

  const { theme: themeMode, toggleTheme } = useTheme()

  const selectedView = views?.[sel] ?? null
  const journey = useJourney(selectedView)
  const { legIndex: journeyLeg, startedAt, arrived, userPos, distToEnd } = journey

  // Beim Start: Stationen laden und einmalig den Standort holen (für das Stationen-Widget).
  useEffect(() => {
    loadStations().then(setLiveStations).catch(() => {})
    getGeolocation()
      .then(pos => journey.setUserPos(pos))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const journeyView = journeyLeg != null ? selectedView : null

  // Neue Suche oder andere Route gewählt — Los-Modus verlassen.
  useEffect(() => {
    journey.exit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, views])

  // Тик раз в 30с для отсчёта «Abfahrt in X» (только когда есть результаты).
  useEffect(() => {
    if (!views) return
    const id = window.setInterval(() => setNowTick(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [views])

  // В поездке тикаем раз в секунду — для таймера mm:ss.
  useEffect(() => {
    if (journeyLeg == null || arrived) return
    const id = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [journeyLeg, arrived])

  async function search(f: Place | null = from, t: Place | null = to) {
    if (!f || !t) return
    // Vorherige Suche abbrechen — sonst kann eine alte Antwort die neue überschreiben.
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
      // für die Verfügbarkeit zählen auch freistehende Räder mit
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
      // Погода на время старта лучшего варианта в точке отправления.
      if (list.length) {
        const rideStart = new Date(list[0].it.startTime)
        fetchWeatherAt(f.lat, f.lon, rideStart)
          .then(w => {
            if (!ctrl.signal.aborted) setWeather(w)
          })
          .catch(() => {})
      }
    } catch (e) {
      // Abbruch durch eine neuere Suche ist kein Fehler
      if ((e as Error)?.name === 'AbortError' || ctrl.signal.aborted) return
      console.error(e)
      setError('Router nicht erreichbar (Transitous). Versuch es gleich nochmal.')
    } finally {
      // Ladeanzeige nur beenden, wenn keine neuere Suche übernommen hat
      if (searchCtrl.current === ctrl) setLoading(false)
    }
  }

  function swap() {
    setFrom(to)
    setTo(from)
    setViews(null)
  }

  function runFav(f: Place, t: Place) {
    setFrom(f)
    setTo(t)
    search(f, t)
  }

  // ── Journey / Los-Modus ──
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
          routeLabel={from && to ? `${shortPlace(from)} → ${shortPlace(to)}` : ''}
          onPrev={() => journey.goTo(Math.max(0, journeyLeg - 1))}
          onNext={() => journey.goTo(Math.min(journeyView.it.legs.length - 1, journeyLeg + 1))}
          onArrive={journey.markArrived}
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

  // now → строка для <input type="datetime-local"> (с учётом локального пояса)
  function nowLocal() {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  }
  function pickTimeMode(m: 'now' | 'depart' | 'arrive') {
    setTimeMode(m)
    if (m !== 'now' && !timeVal) setTimeVal(nowLocal())
  }

  // ── Suche ──
  const hasResults = !!views && views.length > 0

  return (
    <div className="app">
      <div className="poster">
        <div className="poster-brand">
          <LogoMark size={20} />
          <span className="poster-name">RADL NAVI</span>
          <span className="poster-sub">MYRADL + MVV</span>
        </div>
        <button className="theme-toggle-btn" onClick={toggleTheme} title="Design umschalten">
          {themeMode === 'dark' ? '🌙 Dark' : '☀️ Light'}
        </button>
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
        <div className="in-row">
          <span className="in-label">NACH</span>
          <PlaceInput
            placeholder="Ziel"
            value={to}
            onSelect={setTo}
            onPickOnMap={() => setPickOnMap('to')}
          />
          <button className="in-btn" onClick={swap} title="Tauschen">
            <SwapIcon size={18} />
          </button>
        </div>

        <div className="quick-presets-row">
          {PRESET_SLOTS.map(s => {
            const saved = savedPlaces.find(p => p.id === s.id)
            return (
              <button
                key={s.id}
                className={`quick-preset-chip${saved ? ' active' : ''}`}
                onClick={() => {
                  if (saved) {
                    setTo(saved.place)
                  } else if (to) {
                    const next = upsertSaved(s, to)
                    setSavedPlaces(next)
                  } else if (from) {
                    const next = upsertSaved(s, from)
                    setSavedPlaces(next)
                  }
                }}
                title={saved ? `Ziel: ${saved.place.name}` : `Als ${s.label} speichern`}
              >
                <span>{s.emoji}</span> {s.label}
                {saved && <span className="preset-dot" />}
              </button>
            )
          })}
        </div>

        <div className="controls">
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
              className="time-input"
              type="datetime-local"
              value={timeVal}
              onChange={e => setTimeVal(e.target.value)}
            />
          )}
        </div>

        <div className="controls">
          <span className="ctl-label">Räder</span>
          <div className="seg">
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                className={`seg-btn${bikes === n ? ' on' : ''}`}
                onClick={() => setBikes(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <span className="ctl-label">Rad ≤</span>
          <div className="seg">
            {[10, 15, 20, 30].map(n => (
              <button
                key={n}
                className={`seg-btn${maxBike === n ? ' on' : ''}`}
                onClick={() => {
                  setMaxBike(n)
                  localStorage.setItem('radl.maxbike', String(n))
                }}
              >
                {n}′
              </button>
            ))}
          </div>

          <div className="seg seg-auto">
            <button
              className={`seg-btn${bikeType === 'classic' ? ' on' : ''}`}
              onClick={() => {
                setBikeType('classic')
                localStorage.setItem('radl.biketype', 'classic')
              }}
            >
              <BikeIcon size={15} />
              Standard
            </button>
            <button
              className={`seg-btn${bikeType === 'any' ? ' on' : ''}`}
              onClick={() => {
                setBikeType('any')
                localStorage.setItem('radl.biketype', 'any')
              }}
            >
              <BoltIcon size={14} />
              E-Bike
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
                title="Route merken"
              >
                <StarIcon size={12} /> merken
              </button>
            ) : (
              <div className="fav-placeholder" />
            )}

            <StationWidget userPos={userPos} stations={liveStations} onSelectStation={setFrom} />

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
            Unter «Rad ≤ {maxBike} Min» nichts gefunden — erhöhe das Limit oder wähle andere Punkte.
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
          <div className="res-head">
            {views!.length} Routen · nach Ankunft
          </div>
        )}
        {views?.map((v, i) => (
          <ItineraryCard
            key={i}
            view={v}
            index={i}
            selected={i === sel}
            bikesNeeded={bikes}
            now={nowTick}
            onSelect={() => setSel(i)}
            onGo={journey.start}
          />
        ))}
        <div className="sig">
          made by <b>neld</b>
          <div className="sig-credits">
            Fahrplan{' '}
            <a href="https://transitous.org" target="_blank" rel="noreferrer">
              Transitous
            </a>{' '}
            · Räder MyRadl/nextbike (CC0) · Wetter{' '}
            <a href="https://open-meteo.com" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{' '}
            (CC BY 4.0) · Karte OpenFreeMap © OpenMapTiles, Daten{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
            <br />
            Nicht-kommerzielles Hobby-Projekt · ohne Gewähr
          </div>
        </div>
      </section>

      {pickOnMap && (
        <MapPicker
          title={pickOnMap === 'from' ? 'Start auf der Karte' : 'Ziel auf der Karte'}
          initial={pickOnMap === 'from' ? to : from}
          theme={themeMode}
          onPick={p => {
            if (pickOnMap === 'from') setFrom(p)
            else setTo(p)
            setPickOnMap(null)
          }}
          onClose={() => setPickOnMap(null)}
        />
      )}
    </div>
  )
}
