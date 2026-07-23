import type { ReactNode } from 'react'
import type { ItineraryView, Leg } from '../types'
import { bikeWord, gmapsLink, hm, legKind, legLabel, lineShort, mins } from '../format'
import { BikeIcon, ChevronLeft, ChevronRight, CloseIcon, SendIcon, TargetIcon, WalkIcon } from '../icons'

interface Props {
  view: ItineraryView
  legIndex: number
  distToEnd: number | null
  hasGeo: boolean
  onPrev: () => void
  onNext: () => void
  onExit: () => void
  children?: ReactNode // карта
}

function BigIcon({ leg }: { leg: Leg }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={28} />
  if (k === 'bike') return <BikeIcon size={30} />
  return <>{lineShort(leg)}</>
}

function ChipIcon({ leg }: { leg: Leg }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={13} />
  if (k === 'bike') return <BikeIcon size={13} />
  return <>{lineShort(leg)}</>
}

export default function JourneyMode({
  view,
  legIndex,
  distToEnd,
  hasGeo,
  onPrev,
  onNext,
  onExit,
  children,
}: Props) {
  const legs = view.it.legs
  const leg = legs[legIndex]
  const k = legKind(leg)
  const b = view.bikeLegs.get(legIndex)
  const last = legIndex === legs.length - 1
  const total = String(legs.length).padStart(2, '0')

  const fromName = leg.from.name === 'START' ? 'Start' : leg.from.name || b?.startStation?.name || ''
  const toName = leg.to.name === 'END' ? 'Ziel' : leg.to.name || b?.endStation?.name || ''
  const name = `${legLabel(leg)}${leg.routeShortName ? ` ${leg.routeShortName}` : ''}`

  const distText =
    distToEnd == null
      ? null
      : distToEnd >= 950
        ? `${(distToEnd / 1000).toFixed(1)} km`
        : `${Math.max(10, Math.round(distToEnd / 10) * 10)} m`
  const showStation = !!b?.startStation || (hasGeo && distText != null)

  return (
    <div className="journey">
      <div className="j-poster">
        <div>
          <div className="j-kicker">Los-Modus</div>
          <div className="j-etappe">
            ETAPPE {String(legIndex + 1).padStart(2, '0')}
            <small> / {total}</small>
          </div>
        </div>
        <button className="j-end" onClick={onExit}>
          <CloseIcon size={12} /> ENDE
        </button>
      </div>

      <div className="j-progress">
        {legs.map((_, i) => (
          <span
            key={i}
            style={{ background: i <= legIndex ? 'var(--color-accent)' : 'var(--color-neutral-300)' }}
          />
        ))}
      </div>

      <div className="j-map">{children}</div>

      <div className="j-scroll">
        <div className="j-legcard">
          <span className={`j-bigico ${k}`}>
            <BigIcon leg={leg} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="j-mins">{mins(leg.duration)}</span>
              <span className="j-legname">Min · {name}</span>
            </div>
            <div className="leg-sub" style={{ marginTop: 4 }}>
              {hm(leg.startTime)} · {fromName} → {toName}
            </div>
          </div>
        </div>

        {showStation && (
          <div className="j-station">
            {b?.startStation && (
              <div className="leg-sub stat">
                {b.startStation.bikes} {bikeWord(b.startStation.bikes)} an »{b.startStation.name}«
                {b.endStation ? `; zurückgeben: »${b.endStation.name}«` : ''}
              </div>
            )}
            {b?.electric && <div className="leg-sub warn">E-Bike — keine Freiminuten</div>}
            {b?.tooLong && (
              <div className="leg-sub warn">Länger als 30 Freiminuten — Rad unterwegs wechseln</div>
            )}
            {hasGeo && distText != null && (
              <div className="j-dist">
                <TargetIcon size={18} /> noch ≈ {distText}
              </div>
            )}
          </div>
        )}

        <div className="j-actions">
          <a className="btn-block" href={gmapsLink(leg, true)} target="_blank" rel="noreferrer">
            <SendIcon size={17} /> Navigation in Google Maps
          </a>
          <div className="j-nav">
            <button onClick={onPrev} disabled={legIndex === 0}>
              <ChevronLeft size={16} /> Zurück
            </button>
            <button className="next" onClick={onNext} disabled={last}>
              {last ? 'Angekommen' : 'Weiter'} <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {!hasGeo && (
          <div className="msg" style={{ padding: '4px 18px 16px', textAlign: 'left', fontSize: 12 }}>
            Standort freigeben — Etappen schalten automatisch weiter, sobald du am Punkt bist.
          </div>
        )}

        {!last && (
          <div className="j-next-wrap">
            <div className="j-next-label">Als Nächstes</div>
            <div className="j-next-chips">
              {legs.slice(legIndex + 1).map((l, i) => (
                <span key={i} className={`badge ${legKind(l)}`}>
                  <ChipIcon leg={l} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
