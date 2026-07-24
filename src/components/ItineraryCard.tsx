import type { ItineraryView, Leg } from '../types'
import { bikeWord, gmapsLink, hm, legDelayMin, legKind, legLabel, lineShort, mins, nextbikeLink } from '../format'
import { BikeIcon, ExternalIcon, SendIcon, WalkIcon } from '../icons'
import { planPickup } from '../geo'

/** «2 an »A« + 1 an »B« (180 m)» */
export function pickupText(picks: { station: { name: string }; dist: number; take: number }[]) {
  return picks
    .map(p => `${p.take} an »${p.station.name}«${p.dist > 60 ? ` (${Math.round(p.dist)} m)` : ''}`)
    .join(' + ')
}

interface Props {
  view: ItineraryView
  index: number
  selected: boolean
  bikesNeeded: number
  now: number
  onSelect: () => void
  onGo: () => void
}

/** «+3» Verspätung / «3 früher» / «Ausfall». */
function DelayTag({ leg }: { leg: Leg }) {
  if (leg.cancelled) return <span className="delay cancel">Ausfall</span>
  const d = legDelayMin(leg)
  if (d == null || d === 0) return null
  return <span className="delay">{d > 0 ? `+${d}` : `${d}`} Min</span>
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
  now,
  onSelect,
  onGo,
}: Props) {
  const { it } = view
  const departIn = Math.round((new Date(it.startTime).getTime() - now) / 60000)

  // Verfügbarkeit von Rädern in der Nähe (mit Aufteilung nach Stationen)
  const bikeInfos = [...view.bikeLegs.values()]
  const pickups = bikeInfos.map(b => ({
    b,
    pk: planPickup(b.nearby, b.electric, bikesNeeded),
  }))
  const short = pickups.find(p => p.pk.got < bikesNeeded)
  const minGot = pickups.length ? Math.min(...pickups.map(p => p.pk.got)) : null

  // Routen-Tag (eine Zeile)
  let tagKind = 'ok'
  let tagText = '0 € mit Deutschlandticket'
  if (short) {
    tagKind = 'warn'
    tagText = `Nur ${short.pk.got} von ${bikesNeeded} ${short.b.electric ? 'E-Bikes' : 'Rädern'} in der Nähe`
  } else if (view.hasElectric) {
    tagKind = 'warn'
    tagText = 'E-Bike · 1,50 €/30 Min'
  } else if (view.warnLong) {
    tagKind = 'warn'
    tagText = 'Rad länger als 30 Freiminuten'
  } else if (minGot != null) {
    tagText = `0 € mit Deutschlandticket · ${minGot} ${bikeWord(minGot)} frei`
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
          {departIn >= -1 && departIn <= 120 && (
            <div className={`depart-in${departIn <= 3 ? ' urgent' : ''}`}>
              ▶ {departIn <= 0 ? 'Abfahrt jetzt' : `Abfahrt in ${departIn} Min`}
            </div>
          )}
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
                    {leg.routeShortName ? ` ${leg.routeShortName}` : ''} · {mins(leg.duration)} Min{' '}
                    <DelayTag leg={leg} />
                  </div>
                  <div className="leg-sub">
                    {fromName} → {toName}
                    {leg.headsign ? ` · Ri. ${leg.headsign}` : ''}
                  </div>
                  {b &&
                    (() => {
                      const pk = planPickup(b.nearby, b.electric, bikesNeeded)
                      const pl = b.electric ? 'E-Bikes' : 'Räder'
                      // Einzelnes Rad — kurze Zeile wie bisher
                      if (bikesNeeded === 1) {
                        if (!b.startStation) return null
                        return (
                          <div className="leg-sub stat">
                            {b.startStation.bikes} {bikeWord(b.startStation.bikes)} an »
                            {b.startStation.name}«
                            {b.startStation.ebikes ? ` (+${b.startStation.ebikes} E-Bike)` : ''}
                            {b.endStation ? `; zurückgeben: »${b.endStation.name}«` : ''}
                          </div>
                        )
                      }
                      return (
                        <>
                          {pk.got >= bikesNeeded ? (
                            <div className="leg-sub stat">
                              {bikesNeeded} {pl}: {pickupText(pk.picks)}
                            </div>
                          ) : (
                            <>
                              <div className="leg-sub warn">
                                Nur {pk.got} von {bikesNeeded} {pl} in der Nähe
                              </div>
                              <div className="leg-sub stat">
                                In der Nähe: {pk.totalElectric} E-Bikes · {pk.totalClassic} Standard
                                {pk.picks.length > 0 ? ` — ${pickupText(pk.picks)}` : ''}
                              </div>
                            </>
                          )}
                          {b.endStation && (
                            <div className="leg-sub stat">zurückgeben: »{b.endStation.name}«</div>
                          )}
                        </>
                      )
                    })()}
                  {b?.freeFloating && <div className="leg-sub stat">Freistehendes Rad (keine Station)</div>}
                  {b?.electric && <div className="leg-sub warn">E-Bike — keine Freiminuten</div>}
                  {b?.tooLong && (
                    <div className="leg-sub warn">
                      {mins(leg.duration)} Min — Rad unterwegs wechseln, sonst 1 €
                    </div>
                  )}
                  {b?.swapStation && (
                    <div className="leg-sub swap">
                      🔁 Rad wechseln bei »{b.swapStation.name}« ({b.swapStation.bikes}{' '}
                      {bikeWord(b.swapStation.bikes)}) — bleibt gratis
                    </div>
                  )}
                </div>
                <div className="leg-links">
                  {k === 'bike' && (
                    <a
                      className="leg-link nextbike"
                      href={nextbikeLink(leg)}
                      target="_blank"
                      rel="noreferrer"
                      title="In Nextbike App öffnen"
                      onClick={e => e.stopPropagation()}
                    >
                      <BikeIcon size={14} />
                    </a>
                  )}
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
