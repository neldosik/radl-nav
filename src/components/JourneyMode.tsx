import type { ItineraryView } from '../types'
import { bikeWord, gmapsFullBikeLink, gmapsLink, hm, mins, modeMeta } from '../format'

interface Props {
  view: ItineraryView
  legIndex: number
  distToEnd: number | null
  hasGeo: boolean
  onPrev: () => void
  onNext: () => void
  onExit: () => void
}

export default function JourneyMode({
  view,
  legIndex,
  distToEnd,
  hasGeo,
  onPrev,
  onNext,
  onExit,
}: Props) {
  const legs = view.it.legs
  const leg = legs[legIndex]
  const m = modeMeta(leg)
  const b = view.bikeLegs.get(legIndex)
  const last = legIndex === legs.length - 1
  const fullBike = gmapsFullBikeLink(view.it)
  const fromName = leg.from.name === 'START' ? 'старт' : leg.from.name || b?.startStation?.name || ''
  const toName = leg.to.name === 'END' ? 'финиш' : leg.to.name || b?.endStation?.name || ''

  return (
    <div className="journey">
      <div className="j-head">
        <span>
          Этап {legIndex + 1} из {legs.length}
        </span>
        <button className="j-exit" onClick={onExit}>
          ✕ Завершить
        </button>
      </div>

      <div className="j-card" style={{ borderColor: m.color }}>
        <div className="j-title">
          <span className="leg-icon big" style={{ background: m.color }}>
            {m.icon}
          </span>
          <div>
            <div className="j-main">
              {m.label} {leg.routeShortName && <b>{leg.routeShortName}</b>} · {mins(leg.duration)}{' '}
              мин
            </div>
            <div className="j-sub">
              {hm(leg.startTime)} · {fromName} → {toName}
            </div>
            {leg.headsign && <div className="j-sub">направление: {leg.headsign}</div>}
          </div>
        </div>

        {b?.startStation && (
          <div className="j-sub">
            🚲 на «{b.startStation.name}» сейчас {b.startStation.bikes}{' '}
            {bikeWord(b.startStation.bikes)}
            {b.endStation ? `; вернуть: «${b.endStation.name}»` : ''}
          </div>
        )}
        {b?.freeFloating && (
          <div className="j-sub">📍 велик свободностоящий — точное место смотри в MyRadl</div>
        )}
        {b?.electric && (
          <div className="j-sub warn-text">⚡ это электровелик — он платный (1,50 €/30 мин)</div>
        )}
        {b?.tooLong && (
          <div className="j-sub warn-text">
            ⚠️ дольше 30 бесплатных минут — смени велик на станции по пути
          </div>
        )}
        {hasGeo && distToEnd != null && (
          <div className="j-dist">
            📍 до конца этапа ≈{' '}
            {distToEnd >= 950
              ? `${(distToEnd / 1000).toFixed(1)} км`
              : `${Math.max(10, Math.round(distToEnd / 10) * 10)} м`}
          </div>
        )}

        <a className="btn-primary" href={gmapsLink(leg, true)} target="_blank" rel="noreferrer">
          🧭 Навигация этапа в Google Maps
        </a>
        {leg.rental?.rentalUriWeb && (
          <a
            className="btn-secondary"
            href={leg.rental.rentalUriWeb}
            target="_blank"
            rel="noreferrer"
          >
            🔓 Станция в приложении MyRadl
          </a>
        )}
      </div>

      <div className="j-nav">
        <button onClick={onPrev} disabled={legIndex === 0}>
          ← Назад
        </button>
        <button className="j-next" onClick={onNext} disabled={last}>
          {last ? 'Ты на месте 🎉' : 'Дальше →'}
        </button>
      </div>

      {!hasGeo && (
        <div className="j-hint">
          Разреши геолокацию — этапы будут переключаться сами, когда доезжаешь до точки.
        </div>
      )}

      {fullBike && (
        <a className="j-full" href={fullBike} target="_blank" rel="noreferrer">
          Весь маршрут одной ссылкой (чисто вело) ↗
        </a>
      )}

      {!last && (
        <div className="j-coming">
          {legs.slice(legIndex + 1).map((l, k) => {
            const mm = modeMeta(l)
            return (
              <span className="chip" key={k} style={{ borderColor: mm.color }}>
                {mm.icon} {l.routeShortName ?? `${mins(l.duration)}′`}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
