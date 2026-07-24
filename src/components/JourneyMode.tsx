import type { ReactNode } from 'react'
import type { ItineraryView, Leg } from '../types'
import { gmapsLink, hm, legDelayMin, legKind, legLabel, lineShort, mins } from '../format'
import { BikeIcon, ChevronLeft, ChevronRight, CloseIcon, SendIcon, WalkIcon } from '../icons'
import { planPickup } from '../geo'
import { pickupText } from './ItineraryCard'

interface Props {
  view: ItineraryView
  legIndex: number
  distToEnd: number | null
  hasGeo: boolean
  bikesNeeded: number
  now: number
  startedAt: number | null
  arrived: boolean
  routeLabel: string
  onPrev: () => void
  onNext: () => void
  onArrive: () => void
  onExit: () => void
  children?: ReactNode // карта
}

function BigIcon({ leg }: { leg: Leg }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={22} />
  if (k === 'bike') return <BikeIcon size={24} />
  return <>{lineShort(leg)}</>
}

function ChipIcon({ leg }: { leg: Leg }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={13} />
  if (k === 'bike') return <BikeIcon size={13} />
  return <>{lineShort(leg)}</>
}

/** mm:ss, а после часа — h:mm:ss */
function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`
}

export default function JourneyMode({
  view,
  legIndex,
  distToEnd,
  hasGeo,
  bikesNeeded,
  now,
  startedAt,
  arrived,
  routeLabel,
  onPrev,
  onNext,
  onArrive,
  onExit,
  children,
}: Props) {
  const legs = view.it.legs
  const leg = legs[legIndex]
  const k = legKind(leg)
  const b = view.bikeLegs.get(legIndex)
  const last = legIndex === legs.length - 1
  const total = String(legs.length).padStart(2, '0')
  const elapsedMs = startedAt ? now - startedAt : 0

  // ── Экран прибытия ──
  if (arrived) {
    return (
      <div className="journey">
        <div className="arrive">
          <div className="arrive-kicker">Angekommen</div>
          <div className="arrive-time">
            {Math.max(1, Math.round(elapsedMs / 60000))}
            <small> Min</small>
          </div>
          <div className="arrive-route">{routeLabel || 'Ziel erreicht'}</div>
          <div className="arrive-sub">
            Reine Fahrzeit {elapsedText(elapsedMs)} · {legs.length} Etappen
          </div>
          <button className="btn-block" onClick={onExit}>
            <SendIcon size={17} /> Fertig
          </button>
        </div>
      </div>
    )
  }

  const fromName = leg.from.name === 'START' ? 'Start' : leg.from.name || b?.startStation?.name || ''
  const toName = leg.to.name === 'END' ? 'Ziel' : leg.to.name || b?.endStation?.name || ''
  const name = `${legLabel(leg)}${leg.routeShortName ? ` ${leg.routeShortName}` : ''}`
  const delay = legDelayMin(leg)

  const distText =
    distToEnd == null
      ? null
      : distToEnd >= 950
        ? `${(distToEnd / 1000).toFixed(1)} km`
        : `${Math.max(10, Math.round(distToEnd / 10) * 10)} m`

  // Одна короткая строка с самым важным про этот этап.
  let infoLine: string | null = null
  let infoWarn = false
  if (b) {
    const pk = planPickup(b.nearby, b.electric, bikesNeeded)
    const pl = b.electric ? 'E-Bikes' : 'Räder'
    if (bikesNeeded > 1 && pk.got < bikesNeeded) {
      infoLine = `Nur ${pk.got} von ${bikesNeeded} ${pl} · ${pk.totalElectric} E-Bikes, ${pk.totalClassic} Standard in der Nähe`
      infoWarn = true
    } else if (bikesNeeded > 1) {
      infoLine = `${bikesNeeded} ${pl}: ${pickupText(pk.picks)}`
    } else if (b.startStation) {
      infoLine = `${b.startStation.bikes} an »${b.startStation.name}«${b.endStation ? ` → zurück: »${b.endStation.name}«` : ''}`
    } else if (b.freeFloating) {
      infoLine = 'Freistehendes Rad — Ort in MyRadl prüfen'
    }
    if (b.swapStation) {
      infoLine = `Rad wechseln bei »${b.swapStation.name}« — bleibt gratis`
      infoWarn = true
    }
  }

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
        <div className="j-head-right">
          {startedAt != null && <div className="j-timer">{elapsedText(elapsedMs)}</div>}
          <button className="j-end" onClick={onExit}>
            <CloseIcon size={12} /> ENDE
          </button>
        </div>
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

      <div className="j-panel">
        <div className="j-legcard">
          <span className={`j-bigico ${k}`}>
            <BigIcon leg={leg} />
          </span>
          <div className="j-legmain">
            <div className="j-legtop">
              <span className="j-mins">{mins(leg.duration)}</span>
              <span className="j-legname">Min · {name}</span>
              {leg.cancelled ? (
                <span className="delay cancel">Ausfall</span>
              ) : delay != null && delay !== 0 ? (
                <span className="delay">{delay > 0 ? `+${delay}` : delay} Min</span>
              ) : null}
              {hasGeo && distText && <span className="j-dist-badge">≈ {distText}</span>}
            </div>
            <div className="j-legsub">
              {hm(leg.startTime)} · {fromName} → {toName}
            </div>
          </div>
        </div>

        {infoLine && <div className={`j-info${infoWarn ? ' warn' : ''}`}>{infoLine}</div>}

        <a className="btn-block" href={gmapsLink(leg, true)} target="_blank" rel="noreferrer">
          <SendIcon size={16} /> Navigation in Google Maps
        </a>

        <div className="j-nav">
          <button onClick={onPrev} disabled={legIndex === 0}>
            <ChevronLeft size={16} /> Zurück
          </button>
          {last ? (
            <button className="next" onClick={onArrive}>
              Angekommen <ChevronRight size={16} />
            </button>
          ) : (
            <button className="next" onClick={onNext}>
              Weiter <ChevronRight size={16} />
            </button>
          )}
        </div>

        {!last && (
          <div className="j-next-row">
            <span className="j-next-cap">danach</span>
            {legs.slice(legIndex + 1).map((l, i) => (
              <span key={i} className={`badge ${legKind(l)}`}>
                <ChipIcon leg={l} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
