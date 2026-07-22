import type { ItineraryView } from '../types'
import { bikeWord, gmapsLink, hm, mins, modeMeta } from '../format'

interface Props {
  view: ItineraryView
  selected: boolean
  bikesNeeded: number
  onSelect: () => void
}

export default function ItineraryCard({ view, selected, bikesNeeded, onSelect }: Props) {
  const { it } = view

  return (
    <div className={`card${selected ? ' selected' : ''}`} onClick={onSelect}>
      <div className="card-head">
        <span className="times">
          {hm(it.startTime)} – {hm(it.endTime)}
        </span>
        <span className="total">{mins(it.duration)} мин</span>
      </div>

      <div className="strip">
        {it.legs
          .filter(l => !(l.mode === 'WALK' && l.duration < 90))
          .map((leg, i) => {
            const m = modeMeta(leg)
            return (
              <span className="chip" key={i} style={{ borderColor: m.color }}>
                {m.icon} {leg.routeShortName ?? `${mins(leg.duration)}′`}
              </span>
            )
          })}
      </div>

      <div className="badges">
        {view.warnLong ? (
          <span className="badge warn">⚠️ велик дольше 30 бесплатных минут</span>
        ) : (
          <span className="badge ok">0 € с Deutschlandticket</span>
        )}
        {[...view.bikeLegs.values()].map((b, i) =>
          b.startStation ? (
            <span
              key={i}
              className={`badge ${b.startStation.bikes < bikesNeeded ? 'warn' : 'ok'}`}
            >
              🚲 {b.startStation.bikes} на «{b.startStation.name}»
              {b.startStation.bikes < bikesNeeded
                ? ` — нужно ${bikesNeeded}, резервируй в приложении (держится 15 мин)!`
                : ''}
            </span>
          ) : null,
        )}
      </div>

      {selected && (
        <div className="legs">
          {it.legs.map((leg, i) => {
            const m = modeMeta(leg)
            const b = view.bikeLegs.get(i)
            const fromName =
              leg.from.name === 'START' ? 'старт' : leg.from.name || b?.startStation?.name || ''
            const toName =
              leg.to.name === 'END' ? 'финиш' : leg.to.name || b?.endStation?.name || ''
            return (
              <div className="leg" key={i}>
                <div className="leg-time">{hm(leg.startTime)}</div>
                <div className="leg-icon" style={{ background: m.color }}>
                  {m.icon}
                </div>
                <div className="leg-body">
                  <div className="leg-title">
                    {m.label} {leg.routeShortName && <b>{leg.routeShortName}</b>}
                    {leg.headsign ? ` → ${leg.headsign}` : ''} · {mins(leg.duration)} мин
                  </div>
                  {(fromName || toName) && (
                    <div className="leg-sub">
                      {fromName} → {toName}
                    </div>
                  )}
                  {b?.startStation && (
                    <div className="leg-sub">
                      🚲 сейчас {b.startStation.bikes} {bikeWord(b.startStation.bikes)}
                      {b.startStation.ebikes ? ` (+${b.startStation.ebikes} e-bike, платно)` : ''}
                      {b.endStation ? `; вернуть: «${b.endStation.name}»` : ''}
                    </div>
                  )}
                  {b?.tooLong && (
                    <div className="leg-sub warn-text">
                      ⚠️ {mins(leg.duration)} мин — сдай велик на станции по пути и возьми новый,
                      иначе 1 €
                    </div>
                  )}
                </div>
                <a
                  className="leg-nav"
                  href={gmapsLink(leg)}
                  target="_blank"
                  rel="noreferrer"
                  title="Открыть этап в Google Maps"
                  onClick={e => e.stopPropagation()}
                >
                  🧭
                </a>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
