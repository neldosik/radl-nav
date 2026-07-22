import { useEffect, useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import JourneyMode from './components/JourneyMode'
import MapView from './components/MapView'
import { loadStations, plan } from './api'
import { haversine, nearestStation } from './geo'
import type { BikeLegInfo, Itinerary, ItineraryView, Place, Station } from './types'

/** 28 мин вместо 30 — запас на поиск слота и парковку. */
const FREE_LIMIT_SEC = 28 * 60

const MYRADL_SYSTEM_ID = 'nextbike_ml'

function buildView(
  it: Itinerary,
  stations: Station[],
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
  const [views, setViews] = useState<ItineraryView[] | null>(null)
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  // Режим «Поехали»: null = выключен, число = индекс текущего этапа.
  const [journeyLeg, setJourneyLeg] = useState<number | null>(null)
  const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null)

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
  }, [sel, views])

  const distToEnd =
    journeyLeg != null && userPos && journeyView
      ? haversine(userPos, {
          lat: journeyView.it.legs[journeyLeg].to.lat,
          lon: journeyView.it.legs[journeyLeg].to.lon,
        })
      : null

  async function search() {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    setViews(null)
    try {
      const [res, stations] = await Promise.all([
        plan(from, to, { classicOnly: bikeType === 'classic' }),
        loadStations(),
      ])
      const toViews = (its: Itinerary[]) =>
        its
          .map(it => buildView(it, stations, maxBike * 60, bikeType === 'classic'))
          .filter((v): v is ItineraryView => v !== null)
          // чисто пешие варианты не интересны — приложение про велик и транспорт
          .filter(v => v.hasBike || v.it.legs.some(l => l.mode !== 'WALK'))
      const sig = (v: ItineraryView) =>
        `${v.it.startTime}|${v.it.endTime}|${v.it.legs.map(l => l.mode + (l.routeShortName ?? '')).join(',')}`

      let list = toViews([...(res.direct ?? []), ...res.itineraries])
      // Лимит вело-времени мог съесть всё (вечером MOTIS любит длинные вело-варианты) —
      // добираем чистый транспорт вторым запросом.
      if (list.length < 2) {
        const res2 = await plan(from, to, { walkOnly: true })
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
    } catch (e) {
      console.error(e)
      setError('Роутер не ответил (Transitous). Попробуй ещё раз через минуту.')
    } finally {
      setLoading(false)
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setError('Геолокация недоступна в этом браузере')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setFrom({ name: '📍 Моё местоположение', lat: pos.coords.latitude, lon: pos.coords.longitude })
        setLocating(false)
      },
      () => {
        setError('Не удалось получить геолокацию')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  function swap() {
    setFrom(to)
    setTo(from)
    setViews(null)
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          🚲 Radl Navi <span className="sub">MyRadl + MVV · Мюнхен</span>
        </div>
        <div className="inputs">
          <div className="row">
            <PlaceInput placeholder="Откуда" value={from} onSelect={setFrom} />
            <button className="icon-btn" onClick={locate} title="Моё местоположение">
              {locating ? '…' : '📍'}
            </button>
          </div>
          <div className="row">
            <PlaceInput placeholder="Куда" value={to} onSelect={setTo} />
            <button className="icon-btn" onClick={swap} title="Поменять местами">
              ⇅
            </button>
          </div>
          <div className="row controls">
            <div className="bikes-sel">
              <span>Великов:</span>
              {[1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`bike-n${bikes === n ? ' active' : ''}`}
                  onClick={() => setBikes(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <button className="go" disabled={!from || !to || loading} onClick={search}>
              {loading ? 'Ищу…' : 'Маршрут'}
            </button>
          </div>
          <div className="row controls wrap">
            <div className="bikes-sel">
              <span>На велике ≤</span>
              {[10, 15, 20, 30].map(n => (
                <button
                  key={n}
                  className={`bike-n wide${maxBike === n ? ' active' : ''}`}
                  onClick={() => {
                    setMaxBike(n)
                    localStorage.setItem('radl.maxbike', String(n))
                  }}
                >
                  {n}′
                </button>
              ))}
            </div>
            <div className="bikes-sel">
              <button
                className={`bike-n type${bikeType === 'classic' ? ' active' : ''}`}
                onClick={() => {
                  setBikeType('classic')
                  localStorage.setItem('radl.biketype', 'classic')
                }}
              >
                🚲 обычные
              </button>
              <button
                className={`bike-n type${bikeType === 'any' ? ' active' : ''}`}
                onClick={() => {
                  setBikeType('any')
                  localStorage.setItem('radl.biketype', 'any')
                }}
              >
                ⚡ любые
              </button>
            </div>
          </div>
        </div>
      </header>

      <MapView view={views?.[sel] ?? null} activeLeg={journeyLeg} userPos={userPos} />

      <section className="results">
        {journeyView && journeyLeg != null ? (
          <JourneyMode
            view={journeyView}
            legIndex={journeyLeg}
            distToEnd={distToEnd}
            hasGeo={userPos != null}
            onPrev={() => setJourneyLeg(Math.max(0, journeyLeg - 1))}
            onNext={() => setJourneyLeg(Math.min(journeyView.it.legs.length - 1, journeyLeg + 1))}
            onExit={() => setJourneyLeg(null)}
          />
        ) : (
          <>
            {error && <div className="msg error">{error}</div>}
            {!error && !views && !loading && (
              <div className="msg">
                Куда едем? 🚲 Велик учитывается в начале, в конце или вместо транспорта — а
                бесплатные 30 минут MyRadl под контролем.
              </div>
            )}
            {loading && <div className="msg">Считаю комбинации велик + MVV…</div>}
            {views && views.length === 0 && (
              <div className="msg">
                Под лимит «на велике ≤ {maxBike} мин» ничего не нашлось — увеличь лимит или
                попробуй другие точки.
              </div>
            )}
            {views?.map((v, i) => (
              <ItineraryCard
                key={i}
                view={v}
                selected={i === sel}
                bikesNeeded={bikes}
                onSelect={() => setSel(i)}
                onGo={() => setJourneyLeg(0)}
              />
            ))}
          </>
        )}
      </section>
    </div>
  )
}
