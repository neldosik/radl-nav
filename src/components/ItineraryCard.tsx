import { useEffect, useState } from 'react'
import type { ItineraryView, Leg } from '../types'
import { bikeWord, hm, legDelayMin, legKind, legLabel, lineShort, mins, nextbikeLink, pickupText } from '../format'
import { BikeIcon, BoltIcon, ExternalIcon, PinIcon, SendIcon, WalkIcon } from '../icons'
import { planPickup } from '../geo'
import { decodePolyline } from '../polyline'
import { viewDuration, viewEndTime } from '../routing'
import { fetchElevationProfile } from '../api'
import type { ElevationProfile } from '../api'
import { dict, t } from '../i18n'
import type { Language } from '../i18n'

/** Einmal geholte Höhenprofile behalten. Beim Durchtippen der Routen wurde
 *  sonst für dieselbe Etappe immer wieder dieselbe Anfrage gestellt. */
const hoehenPuffer = new Map<string, ElevationProfile | null>()

function BikeLegElevation({ leg, lang }: { leg: Leg; lang: Language }) {
  const key = leg.legGeometry?.points ?? ''
  const [profile, setProfile] = useState<ElevationProfile | null>(() => hoehenPuffer.get(key) ?? null)

  useEffect(() => {
    if (!key) return
    const gepuffert = hoehenPuffer.get(key)
    if (gepuffert !== undefined) {
      setProfile(gepuffert)
      return
    }
    const ctrl = new AbortController()
    const pts = decodePolyline(key, leg.legGeometry?.precision ?? 6)
    fetchElevationProfile(pts, ctrl.signal).then(p => {
      if (ctrl.signal.aborted) return
      hoehenPuffer.set(key, p)
      setProfile(p)
    })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (!profile) return null

  return (
    <div className="elev-pill" title={t('cardElevationTitle', lang)}>
      ↗ +{profile.gain}m · ↘ -{profile.loss}m
    </div>
  )
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
  lang?: Language
  onSelect: () => void
  onGo: () => void
}

/** «+3» Verspätung / «-3» verfrüht / «Ausfall». */
function DelayTag({ leg, lang }: { leg: Leg; lang: Language }) {
  if (leg.cancelled) return <span className="delay cancel">{t('cardCancelled', lang)}</span>
  const d = legDelayMin(leg)
  if (d == null || d === 0) return null
  return <span className="delay">{dict[lang].cardDelay(d)}</span>
}

function KindIcon({ leg, lang }: { leg: Leg; lang: Language }) {
  const k = legKind(leg)
  if (k === 'walk') return <WalkIcon size={13} />
  if (k === 'bike') return <BikeIcon size={13} />
  return <>{lineShort(leg, lang)}</>
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
  let tagText = t('cardFreeWithAbo', lang)
  if (view.warnReturn) {
    // Ohne erreichbare Station endet die Fahrt mit 20 € Strafe — das schlägt
    // jede andere Meldung.
    tagKind = 'alert'
    tagText = t('cardReturnWarn', lang)
  } else if (short) {
    tagKind = 'alert'
    tagText = dict[lang].cardOnlyXofY(
      short.pk.got,
      bikesNeeded,
      short.b.electric ? t('ebikeMany', lang) : t('bikeMany', lang),
    )
  } else if (view.hasElectric) {
    tagKind = 'warn'
    tagText = t('cardEbikePrice', lang)
  } else if (view.warnLong) {
    tagKind = 'warn'
    tagText = t('cardTooLong', lang)
  } else if (minGot != null && minGot <= 2) {
    tagKind = 'alert'
    tagText = dict[lang].cardHighDemand(minGot, bikeWord(minGot, lang))
  } else if (minGot != null) {
    tagText = dict[lang].cardFreeWithBikes(minGot, bikeWord(minGot, lang))
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
              title={`${mins(l.duration)}′ ${legLabel(l, lang)}`}
            />
          )
        })}
      </div>
      {(isFastest || isFree || isFewestTransfers) && (
        <div className="route-badges-row">
          {isFastest && (
            <span className="badge-highlight fastest">{t('cardFastest', lang)}</span>
          )}
          {isFree && (
            <span className="badge-highlight free">
              <BikeIcon size={11} /> {t('cardFree100', lang)}
            </span>
          )}
          {isFewestTransfers && (
            <span className="badge-highlight transfers">{t('cardFewestChanges', lang)}</span>
          )}
        </div>
      )}

      {/* Kopf: große Dauer links, Zeitfenster und Preis rechts.
          Als echter Knopf, damit die Auswahl auch per Tastatur geht — vorher
          war es ein div und die Liste mit der Tastatur nicht bedienbar. */}
      <div
        className="route-main"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
      >
        <div className="route-durrow">
          {/* inklusive Umweg zur Rückgabestation — der wird ja mitgefahren */}
          <span className="route-dur">{mins(viewDuration(view))}</span>
          <span className="route-times">{t('cardMin', lang)}</span>
        </div>
        <div className="route-body">
          <div className="route-times">
            {hm(it.startTime, lang)} → {hm(viewEndTime(view), lang)}
          </div>
          <div className={`route-tag ${tagKind}`}>{tagText}</div>
        </div>
      </div>

      <div className="strip" onClick={onSelect} aria-hidden="true">
        {stripLegs.map((leg, i) => {
          const k = legKind(leg)
          const isE = k === 'bike' && view.bikeLegs.get(it.legs.indexOf(leg))?.electric
          return (
            <span key={i} className={`badge ${k}${isE ? ' ebike' : ''}`}>
              {k === 'line' ? (
                `${lineShort(leg, lang)} ${mins(leg.duration)}′`
              ) : (
                <>
                  <KindIcon leg={leg} lang={lang} />
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
              ▶ {departIn <= 0 ? t('cardDepartNow', lang) : dict[lang].cardDepartIn(departIn)}
            </div>
          )}
          {it.legs.map((leg, i) => {
            const k = legKind(leg)
            const bike = view.bikeLegs.get(i)
            const pk = bike ? planPickup(bike.nearby, bike.electric, bikesNeeded) : null

            return (
              <div key={i} className={`leg ${k}`}>
                <div className="leg-time">
                  {hm(leg.startTime, lang)}–{hm(leg.endTime, lang)}
                </div>
                <div className="leg-icon">
                  <KindIcon leg={leg} lang={lang} />
                </div>
                <div className="leg-body">
                  <div className="leg-head">
                    <span className="leg-title">{legLabel(leg, lang)}</span>
                    <DelayTag leg={leg} lang={lang} />
                  </div>
                  {leg.headsign && (
                    <div className="leg-sub">
                      {t('cardDirection', lang)} {leg.headsign}
                    </div>
                  )}

                  {k === 'bike' && <BikeLegElevation leg={leg} lang={lang} />}

                  {k === 'bike' && bike && (
                    <div className="bike-details">
                      {pk && (
                        <div className="pickup-info">
                          <PinIcon size={12} /> {t('cardPickup', lang)} {pickupText(pk.picks, lang)}
                        </div>
                      )}
                      {/* Rückgabe zwingend an einer Station — MOTIS beendet die
                          Etappe bei freistehenden Rädern sonst irgendwo. */}
                      {bike.noReturnStation ? (
                        <div className="bike-warn">{t('cardReturnWarn', lang)}</div>
                      ) : bike.endStation ? (
                        <div className="pickup-info">
                          <PinIcon size={12} /> {t('cardReturn', lang)}: {dict[lang].quote(bike.endStation.name)}
                          {bike.returnSnapped ? ` (+${bike.returnDetourM} m)` : ''}
                        </div>
                      ) : null}
                      {bike.electric && (
                        <div className="ebike-bat-info">
                          <BoltIcon size={12} /> E-Bike{' '}
                          {bike.startStation?.maxChargePercent != null
                            ? dict[lang].cardEbikeBattery(
                                bike.startStation.maxChargePercent,
                                bike.startStation.rangeKm ?? 25,
                              )
                            : t('cardEbikeNoBattery', lang)}
                        </div>
                      )}
                      {bike.tooLong && (
                        <div className="bike-warn">{t('cardTooLongWarn', lang)}</div>
                      )}
                    </div>
                  )}

                  {leg.rental?.rentalUriWeb && (
                    <div className="leg-links">
                      <a
                        href={nextbikeLink(leg)}
                        target="_blank"
                        rel="noreferrer"
                        className="leg-link"
                      >
                        <ExternalIcon size={12} /> {t('cardOpenNextbike', lang)}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <button className="btn-block btn-go" onClick={onGo}>
            <SendIcon size={15} /> {t('cardStartNav', lang)}
          </button>
        </div>
      )}
    </div>
  )
}
