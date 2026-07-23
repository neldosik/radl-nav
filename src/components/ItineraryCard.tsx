import type { ItineraryView, Leg } from '../types'
import { bikeWord, gmapsLink, hm, legKind, legLabel, lineShort, mins } from '../format'
import { BikeIcon, ExternalIcon, SendIcon, WalkIcon } from '../icons'

interface Props {
  view: ItineraryView
  index: number
  selected: boolean
  bikesNeeded: number
  onSelect: () => void
  onGo: () => void
}

function KindIcon({ leg }: { leg: Leg }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={13} />
  if (k === 'bike') return <BikeIcon size={13} />
  return <>{lineShort(leg)}</>
}

export default function ItineraryCard({
  view,
  index,
  selected,
  bikesNeeded,
  onSelect,
  onGo,
}: Props) {
  const { it } = view

  // Тег маршрута (одна строка, как в дизайне).
  const bikeStarts = [...view.bikeLegs.values()].filter(b => b.startStation)
  const minBikes = bikeStarts.length
    ? Math.min(...bikeStarts.map(b => b.startStation!.bikes))
    : null
  const lowBikes = bikeStarts.some(b => b.startStation!.bikes < bikesNeeded)

  let tagKind = 'ok'
  let tagText = '0 € mit Deutschlandticket'
  if (view.hasElectric) {
    tagKind = 'warn'
    tagText = 'E-Bike · 1,50 €/30 Min'
  } else if (lowBikes && minBikes != null) {
    tagKind = 'warn'
    tagText = `Nur ${minBikes} ${bikeWord(minBikes)} frei — reservieren`
  } else if (view.warnLong) {
    tagKind = 'warn'
    tagText = 'Rad länger als 30 Freiminuten'
  } else if (minBikes != null) {
    tagText = `0 € mit Deutschlandticket · ${minBikes} ${bikeWord(minBikes)} frei`
  }

  const stripLegs = it.legs.filter(l => !(l.mode === 'WALK' && l.duration < 90))

  return (
    <div className={`route${selected ? ' sel' : ''}`}>
      <div className="route-main" onClick={onSelect}>
        <span className="route-idx">{String(index + 1).padStart(2, '0')}</span>
        <div className="route-body">
          <div className="route-durrow">
            <span className="route-dur">{mins(it.duration)}</span>
            <span className="route-times">
              Min · {hm(it.startTime)}–{hm(it.endTime)}
            </span>
          </div>

          {!selected && (
            <div className="strip">
              {stripLegs.map((leg, i) => {
                const k = legKind(leg)
                return (
                  <span key={i} className={`badge ${k}`}>
                    {k === 'line' ? (
                      lineShort(leg)
                    ) : (
                      <>
                        <KindIcon leg={leg} />
                        {k === 'bike' ? `${mins(leg.duration)}′` : ''}
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          <div className={`route-tag ${tagKind}`}>{tagText}</div>
        </div>
      </div>

      {selected && (
        <div className="legs">
          {it.legs.map((leg, i) => {
            const k = legKind(leg)
            const b = view.bikeLegs.get(i)
            const fromName =
              leg.from.name === 'START' ? 'Start' : leg.from.name || b?.startStation?.name || ''
            const toName =
              leg.to.name === 'END' ? 'Ziel' : leg.to.name || b?.endStation?.name || ''
            return (
              <div className="leg" key={i}>
                <span className="leg-time">{hm(leg.startTime)}</span>
                <span className={`leg-ico ${k}`}>
                  <KindIcon leg={leg} />
                </span>
                <div className="leg-body">
                  <div className="leg-title">
                    {legLabel(leg)}
                    {leg.routeShortName ? ` ${leg.routeShortName}` : ''} · {mins(leg.duration)} Min
                  </div>
                  <div className="leg-sub">
                    {fromName} → {toName}
                    {leg.headsign ? ` · Ri. ${leg.headsign}` : ''}
                  </div>
                  {b?.startStation && (
                    <div className="leg-sub stat">
                      {b.startStation.bikes} {bikeWord(b.startStation.bikes)} an »{b.startStation.name}«
                      {b.startStation.ebikes ? ` (+${b.startStation.ebikes} E-Bike)` : ''}
                      {b.endStation ? `; zurückgeben: »${b.endStation.name}«` : ''}
                    </div>
                  )}
                  {b?.freeFloating && <div className="leg-sub stat">Freistehendes Rad (keine Station)</div>}
                  {b?.electric && <div className="leg-sub warn">E-Bike — keine Freiminuten</div>}
                  {b?.tooLong && (
                    <div className="leg-sub warn">
                      {mins(leg.duration)} Min — Rad unterwegs wechseln, sonst 1 €
                    </div>
                  )}
                </div>
                <a
                  className="leg-link"
                  href={gmapsLink(leg)}
                  target="_blank"
                  rel="noreferrer"
                  title="In Google Maps öffnen"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalIcon size={16} />
                </a>
              </div>
            )
          })}

          <button
            className="btn-block"
            onClick={e => {
              e.stopPropagation()
              onGo()
            }}
          >
            <SendIcon size={17} /> Losfahren
          </button>
        </div>
      )}
    </div>
  )
}
