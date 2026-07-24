import { useEffect, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import MapView from './components/MapView'
import MapPicker from './components/MapPicker'
import StationWidget from './components/StationWidget'
import { fetchWeatherAt, getGeolocation, loadFreeBikes, loadStations, plan } from './api'
import type { WeatherAtTime } from './api'
import { clusterFreeBikes, haversine, nearbyStations, nearestStation } from './geo'
import { decodePolyline } from './polyline'
import { addFavRoute, loadFavRoutes, loadSaved, PRESET_SLOTS, removeFavRoute, shortPlace, upsertSaved } from './places'
import type { SavedPlace } from './places'
import { BikeIcon, BoltIcon, LogoMark, SendIcon, StarIcon, SwapIcon } from './icons'
import type { BikeLegInfo, Itinerary, ItineraryView, Place, Station } from './types'

/** 28 мин вместо 30 — запас на поиск слота и парковку. */
const FREE_LIMIT_SEC = 28 * 60

const MYRADL_SYSTEM_ID = 'nextbike_ml'

function buildView(
  it: Itinerary,
  stations: Station[], // реальные станции — для взятия/возврата/смены велика
  supply: Station[], // станции + свободностоящие велики — для подсчёта «сколько рядом»
  maxBikeSec: number,
  classicOnly: boolean,
): ItineraryView | null {
  const bikeLegs = new Map<number, BikeLegInfo>()
  let hasBike = false
  let warnLong = false
  let hasElectric = false

  for (let i = 0; i < it.legs.length; i++) {
    const leg = it.legs[i]
    if (leg.mode !== 'RENTAL') continue
    // Только MyRadl: Dott (самокаты И велики) платный — вырезаем целиком.
    const isMyRadl =
      leg.rental?.systemId === MYRADL_SYSTEM_ID ||
      (leg.rental?.systemName ?? '').toLowerCase().includes('myradl')
    if (!isMyRadl) return null
    // Жёсткий лимит пользователя «на велике не дольше N минут».
    if (leg.duration > maxBikeSec) return null
    // E-bike платный всегда; в режиме «обычные» — вырезаем (страховка к серверному фильтру).
    const electric = !!leg.rental?.propulsionType && leg.rental.propulsionType !== 'HUMAN'
    if (electric && classicOnly) return null
    const freeFloating = !leg.rental?.fromStationName
    hasBike = true
    const info: BikeLegInfo = {
      startStation: freeFloating ? null : nearestStation(leg.from, stations),
      endStation: nearestStation(leg.to, stations),
      tooLong: !electric && leg.duration > FREE_LIMIT_SEC,
      electric,
      freeFloating,
      swapStation: null,
      // всё доступное вокруг старта этапа (вкл. свободностоящие) — чтобы набрать на группу
      nearby: nearbyStations(leg.from, supply, 600, 6),
    }
    // «Веломарафон»: этап дольше бесплатных 30 мин → станция у середины пути для смены велика.
    if (info.tooLong && leg.legGeometry?.points) {
      const pts = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
      const mid = pts[Math.floor(pts.length * 0.55)]
      if (mid) {
        // Доки MyRadl всегда 0 (flex-станции), возврат принимают везде — нужны лишь велики.
        const cand = stations.filter(s => s.bikes > 0)
        const sw = nearestStation({ lat: mid[1], lon: mid[0] }, cand, 600)
        if (sw && sw.id !== info.startStation?.id && sw.id !== info.endStation?.id) info.swapStation = sw
      }
    }
    if (info.tooLong) warnLong = true
    if (electric) hasElectric = true
    bikeLegs.set(i, info)
  }

  return { it, hasBike, warnLong, hasElectric, bikeLegs }
}

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
  // Режим «Поехали»: null = выключен, число = индекс текущего этапа.
  const [journeyLeg, setJourneyLeg] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null) // старт поездки для таймера
  const [arrived, setArrived] = useState(false) // экран «прибыли»
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null)
  const [liveStations, setLiveStations] = useState<Station[]>([])
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => loadSaved())

  useEffect(() => {
    loadStations().then(s => setLiveStations(s)).catch(() => {})
    getGeolocation().then(pos => {
      if (pos) setUserPos(pos)
    }).catch(() => {})

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => setUserPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [])
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    return localStorage.getItem('radl.theme') === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    localStorage.setItem('radl.theme', themeMode)
    const root = document.documentElement
    root.classList.remove('light-theme', 'dark-theme')
    if (themeMode === 'light') root.classList.add('light-theme')
    else root.classList.add('dark-theme')
  }, [themeMode])

  function toggleTheme() {
    setThemeMode(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const journeyView = journeyLeg != null && views ? (views[sel] ?? null) : null

  // Слежение за позицией + не давать экрану гаснуть, пока едем.
  useEffect(() => {
    if (journeyLeg == null) {
      setUserPos(null)
      return
    }
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      p => setUserPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    )
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock
      ?.request('screen')
      .then(l => {
        lock = l
      })
      .catch(() => {})
    return () => {
      navigator.geolocation.clearWatch(id)
      lock?.release().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyLeg != null])

  // Автопереход: доехал до конца этапа (<70 м) — включаем следующий.
  useEffect(() => {
    if (journeyLeg == null || !userPos || !journeyView) return
    const legs = journeyView.it.legs
    const leg = legs[journeyLeg]
    const d = haversine(userPos, { lat: leg.to.lat, lon: leg.to.lon })
    if (d < 70 && journeyLeg < legs.length - 1) {
      setJourneyLeg(journeyLeg + 1)
      navigator.vibrate?.(200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos])

  // Новый поиск или другая карточка — выходим из режима «Поехали».
  useEffect(() => {
    setJourneyLeg(null)
    setStartedAt(null)
    setArrived(false)
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

  function startJourney() {
    setJourneyLeg(0)
    setStartedAt(Date.now())
    setArrived(false)
  }

  function exitJourney() {
    setJourneyLeg(null)
    setStartedAt(null)
    setArrived(false)
  }

  const distToEnd =
    journeyLeg != null && userPos && journeyView
      ? haversine(userPos, {
          lat: journeyView.it.legs[journeyLeg].to.lat,
          lon: journeyView.it.legs[journeyLeg].to.lon,
        })
      : null

  async function search(f: Place | null = from, t: Place | null = to) {
    if (!f || !t) return
    setLoading(true)
    setError(null)
    setViews(null)
    setWeather(null)
    const when = timeMode !== 'now' && timeVal ? new Date(timeVal) : undefined
    const timeOpts = when ? { time: when, arriveBy: timeMode === 'arrive' } : {}
    try {
      const [res, stations, freeBikes] = await Promise.all([
        plan(f, t, { classicOnly: bikeType === 'classic', ...timeOpts }),
        loadStations(),
        loadFreeBikes().catch(() => []),
      ])
      // для подсчёта доступности учитываем и свободностоящие велики
      const supply = [...stations, ...clusterFreeBikes(freeBikes)]
      const toViews = (its: Itinerary[]) =>
        its
          .map(it => buildView(it, stations, supply, maxBike * 60, bikeType === 'classic'))
          .filter((v): v is ItineraryView => v !== null)
          // чисто пешие варианты не интересны — приложение про велик и транспорт
          .filter(v => v.hasBike || v.it.legs.some(l => l.mode !== 'WALK'))
      const sig = (v: ItineraryView) =>
        `${v.it.startTime}|${v.it.endTime}|${v.it.legs.map(l => l.mode + (l.routeShortName ?? '')).join(',')}`

      let list = toViews([...(res.direct ?? []), ...res.itineraries])
      // Лимит вело-времени мог съесть всё (вечером MOTIS любит длинные вело-варианты) —
      // добираем чистый транспорт вторым запросом.
      if (list.length < 2) {
        const res2 = await plan(f, t, { walkOnly: true, ...timeOpts })
        const seen = new Set(list.map(sig))
        for (const v of toViews([...(res2.direct ?? []), ...res2.itineraries])) {
          if (!seen.has(sig(v))) list.push(v)
        }
      }
      list = list
        .sort((a, b) => +new Date(a.it.endTime) - +new Date(b.it.endTime))
        .slice(0, 7)
      setViews(list)
      setSel(0)
      // Погода на время старта лучшего варианта в точке отправления.
      if (list.length) {
        const rideStart = new Date(list[0].it.startTime)
        fetchWeatherAt(f.lat, f.lon, rideStart)
          .then(w => setWeather(w))
          .catch(() => {})
      }
    } catch (e) {
      console.error(e)
      setError('Router nicht erreichbar (Transitous). Versuch es gleich nochmal.')
    } finally {
      setLoading(false)
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
          onPrev={() => setJourneyLeg(Math.max(0, journeyLeg - 1))}
          onNext={() => setJourneyLeg(Math.min(journeyView.it.legs.length - 1, journeyLeg + 1))}
          onArrive={() => setArrived(true)}
          onExit={exitJourney}
        >
          <MapView
            view={journeyView}
            activeLeg={journeyLeg}
            userPos={userPos}
            bikesNeeded={bikes}
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
            onGo={startJourney}
          />
        ))}
        <div className="sig">
          made by <b>neld</b>
        </div>
      </section>

      {pickOnMap && (
        <MapPicker
          title={pickOnMap === 'from' ? 'Start auf der Karte' : 'Ziel auf der Karte'}
          initial={pickOnMap === 'from' ? to : from}
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
