import { useEffect, useState } from 'react'
import type { ItineraryView, Leg } from '../types'
import { bikeWord, hm, legDelayMin, legKind, legLabel, lineShort, mins } from '../format'
import { BikeIcon, BoltIcon, ExternalIcon, PinIcon, SendIcon, WalkIcon } from '../icons'
import { planPickup } from '../geo'
import { decodePolyline } from '../polyline'
import { fetchElevationProfile } from '../api'
import type { ElevationProfile } from '../api'

function BikeLegElevation({ leg }: { leg: Leg }) {
  const [profile, setProfile] = useState<ElevationProfile | null>(null)

  useEffect(() => {
    let alive = true
    if (!leg.legGeometry?.points) return
    const pts = decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6)
    fetchElevationProfile(pts).then(p => {
      if (alive) setProfile(p)
    })
    return () => {
      alive = false
    }
  }, [leg])

  if (!profile) return null

  return (
    <div className="elev-pill" title="Echtes Höhenprofil (Open-Meteo)">
      ↗ +{profile.gain}m · ↘ -{profile.loss}m
    </div>
  )
}

/** «2 an »A« + 1 an »B« (180 m)» */
export function pickupText(picks: { station: { name: string }; dist: number; take: number }[]) {
  return picks
    .map(p => `${p.take} an »${p.station.name}«${p.dist > 60 ? ` (${Math.round(p.dist)} m)` : ''}`)
    .join(' + ')
}

interface Props {
  view: ItineraryView
  index?: number
  selected: boolean
  bikesNeeded: number
  now: number
  isFastest?: boolean
  isFree?: boolean
  isFewestTransfers?: boolean
  lang?: 'de' | 'en'
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
  index: _index,
  selected,
  bikesNeeded,
  now,
  isFastest = false,
  isFree = false,
  isFewestTransfers = false,
  lang = 'de',
  onSelect,
  onGo,
}: Props) {
  const { it } = view
  const departIn = Math.round((new Date(it.startTime).getTime() - now) / 60000)

  const bikeInfos = [...view.bikeLegs.values()]
  const pickups = bikeInfos.map(b => ({
    b,
    pk: planPickup(b.nearby, b.electric, bikesNeeded),
  }))
  const short = pickups.find(p => p.pk.got < bikesNeeded)
  const minGot = pickups.length ? Math.min(...pickups.map(p => p.pk.got)) : null

  let tagKind = 'ok'
  let tagText = lang === 'en' ? '0 € with subscription' : '0 € mit Deutschlandticket'
  if (short) {
    tagKind = 'alert'
    tagText = lang === 'en'
      ? `Only ${short.pk.got} of ${bikesNeeded} ${short.b.electric ? 'E-Bikes' : 'bikes'} nearby`
      : `Nur ${short.pk.got} von ${bikesNeeded} ${short.b.electric ? 'E-Bikes' : 'Rädern'} in der Nähe`
  } else if (view.hasElectric) {
    tagKind = 'warn'
    tagText = 'E-Bike · 1,50 €/30 Min'
  } else if (view.warnLong) {
    tagKind = 'warn'
    tagText = lang === 'en' ? 'Bike ride > 30 free mins' : 'Rad länger als 30 Freiminuten'
  } else if (minGot != null && minGot <= 2) {
    tagKind = 'alert'
    tagText = lang === 'en'
      ? `High demand: only ${minGot} ${minGot === 1 ? 'bike' : 'bikes'} left`
      : `Hohe Nachfrage: nur noch ${minGot} ${bikeWord(minGot)} frei`
  } else if (minGot != null) {
    tagText = lang === 'en'
      ? `0 € with sub · ${minGot} ${minGot === 1 ? 'bike' : 'bikes'} free`
      : `0 € mit Deutschlandticket · ${minGot} ${bikeWord(minGot)} frei`
  }

  const stripLegs = it.legs.filter(l => !(l.mode === 'WALK' && l.duration < 90))
  const totalDurationSec = Math.max(1, it.legs.reduce((acc, l) => acc + l.duration, 0))

  return (
    <div className={`route${selected ? ' sel' : ''}`}>
      <div className="route-timeline-bar">
        {it.legs.map((l, i) => {
          const pct = Math.max(3, (l.duration / totalDurationSec) * 100)
          const k = legKind(l)
          const colorClass = k === 'bike' ? 'bar-bike' : k === 'line' ? 'bar-transit' : 'bar-walk'
          return (
            <span
              key={i}
              className={`timeline-seg ${colorClass}`}
              style={{ width: `${pct}%` }}
              title={`${mins(l.duration)}′ ${legLabel(l)}`}
            />
          )
        })}
      </div>
      {(isFastest || isFree || isFewestTransfers) && (
        <div className="route-badges-row">
          {isFastest && (
            <span className="badge-highlight fastest">
              {lang === 'en' ? 'Fastest' : 'Schnellste'}
            </span>
          )}
          {isFree && (
            <span className="badge-highlight free">
              <BikeIcon size={11} /> {lang === 'en' ? '100 % free' : '100 % gratis'}
            </span>
          )}
          {isFewestTransfers && (
            <span className="badge-highlight transfers">
              {lang === 'en' ? 'Fewest changes' : 'Wenigste Umstiege'}
            </span>
          )}
        </div>
      )}

      {/* Kopf: große Dauer links, Zeitfenster und Preis rechts */}
      <div className="route-main" onClick={onSelect}>
        <div className="route-durrow">
          <span className="route-dur">{mins(it.duration)}</span>
          <span className="route-times">{lang === 'en' ? 'min' : 'Min'}</span>
        </div>
        <div className="route-body">
          <div className="route-times">
            {hm(it.startTime)} → {hm(it.endTime)}
          </div>
          <div className={`route-tag ${tagKind}`}>{tagText}</div>
        </div>
      </div>

      <div className="strip" onClick={onSelect}>
        {stripLegs.map((leg, i) => {
          const k = legKind(leg)
          const isE = k === 'bike' && view.bikeLegs.get(it.legs.indexOf(leg))?.electric
          return (
            <span key={i} className={`badge ${k}${isE ? ' ebike' : ''}`}>
              {k === 'line' ? (
                `${lineShort(leg)} ${mins(leg.duration)}′`
              ) : (
                <>
                  <KindIcon leg={leg} />
                  {k === 'bike' ? `${mins(leg.duration)}′` : `${mins(leg.duration)}′`}
                </>
              )}
            </span>
          )
        })}
      </div>

      {selected && (
        <div className="legs">
          {departIn >= -1 && departIn <= 120 && (
            <div className={`depart-in${departIn <= 3 ? ' urgent' : ''}`}>
              ▶ {departIn <= 0 ? (lang === 'en' ? 'Depart now' : 'Abfahrt jetzt') : (lang === 'en' ? `Depart in ${departIn} min` : `Abfahrt in ${departIn} Min`)}
            </div>
          )}
          {it.legs.map((leg, i) => {
            const k = legKind(leg)
            const bike = view.bikeLegs.get(i)
            const pk = bike ? planPickup(bike.nearby, bike.electric, bikesNeeded) : null

            return (
              <div key={i} className={`leg ${k}`}>
                <div className="leg-time">
                  {hm(leg.startTime)}–{hm(leg.endTime)}
                </div>
                <div className="leg-icon">
                  <KindIcon leg={leg} />
                </div>
                <div className="leg-body">
                  <div className="leg-head">
                    <span className="leg-title">{legLabel(leg)}</span>
                    <DelayTag leg={leg} />
                  </div>
                  {leg.headsign && <div className="leg-sub">Richtung: {leg.headsign}</div>}

                  {k === 'bike' && <BikeLegElevation leg={leg} />}

                  {k === 'bike' && bike && (
                    <div className="bike-details">
                      {pk && (
                        <div className="pickup-info">
                          <PinIcon size={12} /> Ausleihe: {pickupText(pk.picks)}
                        </div>
                      )}
                      {bike.electric && (
                        <div className="ebike-bat-info">
                          <BoltIcon size={12} /> E-Bike{' '}
                          {bike.startStation?.maxChargePercent != null
                            ? `· Max ${bike.startStation.maxChargePercent} % · ~${bike.startStation.rangeKm ?? 25} km`
                            : '· 1,50 €/30 Min'}
                        </div>
                      )}
                      {bike.tooLong && (
                        <div className="bike-warn">
                          Fahrt dauert länger als 30 Min — kleine Aufzahlung.
                        </div>
                      )}
                    </div>
                  )}

                  {leg.rental?.rentalUriWeb && (
                    <div className="leg-links">
                      <a
                        href={leg.rental.rentalUriWeb}
                        target="_blank"
                        rel="noreferrer"
                        className="leg-link nextbike"
                      >
                        <ExternalIcon size={12} /> Auf Nextbike öffnen
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <button className="btn-block btn-go" onClick={onGo}>
            <SendIcon size={15} /> {lang === 'en' ? 'Start Navigation' : 'LOS — Navigation starten'}
          </button>
        </div>
      )}
    </div>
  )
}
