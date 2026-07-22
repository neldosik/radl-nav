import { useState } from 'react'
import PlaceInput from './components/PlaceInput'
import ItineraryCard from './components/ItineraryCard'
import MapView from './components/MapView'
import { loadStations, plan } from './api'
import { nearestStation } from './geo'
import type { BikeLegInfo, Itinerary, ItineraryView, Place, Station } from './types'

/** 28 мин вместо 30 — запас на поиск слота и парковку. */
const FREE_LIMIT_SEC = 28 * 60

const MYRADL_SYSTEM_ID = 'nextbike_ml'

function buildView(it: Itinerary, stations: Station[], maxBikeSec: number): ItineraryView | null {
  const bikeLegs = new Map<number, BikeLegInfo>()
  let hasBike = false
  let warnLong = false

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
    hasBike = true
    const info: BikeLegInfo = {
      startStation: nearestStation(leg.from, stations),
      endStation: nearestStation(leg.to, stations),
      tooLong: leg.duration > FREE_LIMIT_SEC,
    }
    if (info.tooLong) warnLong = true
    bikeLegs.set(i, info)
  }

  return { it, hasBike, warnLong, bikeLegs }
}

export default function App() {
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  const [bikes, setBikes] = useState(1)
  const [maxBike, setMaxBike] = useState(() => {
    const saved = Number(localStorage.getItem('radl.maxbike'))
    return [10, 15, 20, 30].includes(saved) ? saved : 20
  })
  const [views, setViews] = useState<ItineraryView[] | null>(null)
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  async function search() {
    if (!from || !to) return
    setLoading(true)
    setError(null)
    setViews(null)
    try {
      const [res, stations] = await Promise.all([plan(from, to), loadStations()])
      const toViews = (its: Itinerary[]) =>
        its
          .map(it => buildView(it, stations, maxBike * 60))
          .filter((v): v is ItineraryView => v !== null)
          // чисто пешие варианты не интересны — приложение про велик и транспорт
          .filter(v => v.hasBike || v.it.legs.some(l => l.mode !== 'WALK'))
      const sig = (v: ItineraryView) =>
        `${v.it.startTime}|${v.it.endTime}|${v.it.legs.map(l => l.mode + (l.routeShortName ?? '')).join(',')}`

      let list = toViews([...(res.direct ?? []), ...res.itineraries])
      // Лимит вело-времени мог съесть всё (вечером MOTIS любит длинные вело-варианты) —
      // добираем чистый транспорт вторым запросом.
      if (list.length < 2) {
        const res2 = await plan(from, to, true)
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
          <div className="row controls">
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
          </div>
        </div>
      </header>

      <MapView view={views?.[sel] ?? null} />

      <section className="results">
        {error && <div className="msg error">{error}</div>}
        {!error && !views && !loading && (
          <div className="msg">
            Куда едем? 🚲 Велик учитывается в начале, в конце или вместо транспорта — а бесплатные
            30 минут MyRadl под контролем.
          </div>
        )}
        {loading && <div className="msg">Считаю комбинации велик + MVV…</div>}
        {views && views.length === 0 && (
          <div className="msg">
            Под лимит «на велике ≤ {maxBike} мин» ничего не нашлось — увеличь лимит или попробуй
            другие точки.
          </div>
        )}
        {views?.map((v, i) => (
          <ItineraryCard
            key={i}
            view={v}
            selected={i === sel}
            bikesNeeded={bikes}
            onSelect={() => setSel(i)}
          />
        ))}
      </section>
    </div>
  )
}
