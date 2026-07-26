import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { ItineraryView, Leg } from '../types'
import { hm, legDelayMin, legKind, legLabel, lineShort, mins, nextbikeLink } from '../format'
import {
  BikeIcon,
  ChevronLeft,
  ChevronRight,
  ClockIcon,
  CloseIcon,
  ExternalIcon,
  PinIcon,
  SendIcon,
  TargetIcon,
  WalkIcon,
} from '../icons'
import { planPickup } from '../geo'
import { FREE_LIMIT_SEC } from '../routing'
import { pickupText } from './ItineraryCard'
import { playWarningSound } from '../audio'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
  view: ItineraryView
  legIndex: number
  distToEnd: number | null
  bikesNeeded: number
  now: number
  startedAt: number | null
  arrived: boolean
  soundEnabled: boolean
  lang?: Language
  routeLabel: string
  onPrev: () => void
  onNext: () => void
  onArrive: () => void
  onExit: () => void
  /** Kamera folgt dem Standort? */
  follow?: boolean
  onToggleFollow?: () => void
  children?: ReactNode // Karte
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

/** mm:ss, nach einer Stunde h:mm:ss */
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
  bikesNeeded,
  now,
  startedAt,
  arrived,
  soundEnabled,
  lang = 'de',
  routeLabel,
  onPrev,
  onNext,
  onArrive,
  onExit,
  follow = true,
  onToggleFollow,
  children,
}: Props) {
  const legs = view.it.legs
  const leg = legs[legIndex]
  const k = legKind(leg)
  const b = view.bikeLegs.get(legIndex)
  const last = legIndex === legs.length - 1

  const elapsedMs = startedAt ? now - startedAt : 0

  const isBikeLeg = k === 'bike'
  const isTransitLeg = k === 'line'
  const warned5Min = useRef(false)
  const warned2Min = useRef(false)
  const vibratedTransit = useRef(false)

  const bikeStartedAt = useRef<number | null>(null)

  useEffect(() => {
    bikeStartedAt.current = isBikeLeg ? Date.now() : null
    warned5Min.current = false
    warned2Min.current = false
    vibratedTransit.current = false
  }, [legIndex, isBikeLeg])

  const bikeSec = bikeStartedAt.current ? Math.floor((now - bikeStartedAt.current) / 1000) : 0

  // Screen Wake Lock API — keep display awake while riding
  useEffect(() => {
    let wakeLock: any = null
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(lock => {
        wakeLock = lock
      }).catch(() => {})
    }
    return () => {
      wakeLock?.release().catch(() => {})
    }
  }, [])

  // Get-off alert vibration when transit leg reaches final ~200m or 1 min
  useEffect(() => {
    if (!isTransitLeg || vibratedTransit.current) return
    if (distToEnd != null && distToEnd <= 250) {
      vibratedTransit.current = true
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
    }
  }, [distToEnd, isTransitLeg])

  // Rückgabe-Warnung: 5 Min und 2 Min vor Ende des kostenlosen Fensters
  useEffect(() => {
    if (!isBikeLeg) return
    if (bikeSec >= FREE_LIMIT_SEC - 5 * 60 && bikeSec < FREE_LIMIT_SEC - 2 * 60 && !warned5Min.current) {
      warned5Min.current = true
      if (soundEnabled) playWarningSound()
      if (navigator.vibrate) navigator.vibrate([300, 100, 300])
    }
    if (bikeSec >= FREE_LIMIT_SEC - 2 * 60 && !warned2Min.current) {
      warned2Min.current = true
      if (soundEnabled) playWarningSound()
      if (navigator.vibrate) navigator.vibrate([400, 100, 400])
    }
  }, [bikeSec, isBikeLeg])

  // ── Ankunftsscreen ──
  if (arrived) {
    const totalBikeMins = Array.from(view.bikeLegs.values()).reduce(acc => acc + 15, 0)
    const cal = Math.round(totalBikeMins * 5.2)
    const co2 = Math.round(totalBikeMins * 38)
    const co2Label = co2 >= 1000 ? `${(co2 / 1000).toFixed(1)} kg` : `${co2} g`

    return (
      <div className="journey">
        <div className="arrive">
          <div className="arrive-kicker">{t('jmArrived', lang)}</div>
          <div className="arrive-time">
            {Math.max(1, Math.round(elapsedMs / 60000))}
            <small> Min</small>
          </div>
          <div className="arrive-route">{routeLabel || t('jmGoalReached', lang)}</div>
          <div className="arrive-sub">
            {t('jmTravelTime', lang)} {elapsedText(elapsedMs)} · {legs.length} {t('jmLegs', lang)}
          </div>

          <div className="arrive-stats">
            <div className="arrive-stat">
              <b>{cal}</b>
              <span>kcal</span>
            </div>
            <div className="arrive-stat">
              <b>{co2Label}</b>
              <span>CO₂</span>
            </div>
            <div className="arrive-stat">
              <b>{view.hasElectric ? '1,50 €' : '0 €'}</b>
              <span>{lang === 'en' ? 'cost' : 'Kosten'}</span>
            </div>
          </div>

          <button className="arrive-btn" onClick={onExit}>
            {t('jmFinish', lang)}
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

  // Kurzer Hinweis zur aktuellen Etappe
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

  const remainingSec = Math.max(0, FREE_LIMIT_SEC - bikeSec)
  const remainingMins = Math.ceil(remainingSec / 60)
  const isNearDropoff = isBikeLeg && distToEnd != null && distToEnd <= 250

  return (
    <div className="journey">
      <div className="j-map">{children}</div>

      {/* Folgen-Knopf wie in Kartendiensten: aus, sobald man selbst schiebt */}
      {onToggleFollow && (
        <button
          className={`j-follow${follow ? ' on' : ''}`}
          onClick={onToggleFollow}
          title={follow ? (lang === 'en' ? 'Following you' : 'Folgt dir') : (lang === 'en' ? 'Recenter' : 'Zentrieren')}
        >
          <TargetIcon size={20} />
        </button>
      )}

      {/* Schwebende Kopfkarte: wohin es gerade geht + Entfernung */}
      <div className="j-poster">
        <div className="j-head-row">
          <div className="j-head-card">
            <span className={`j-head-icon ${k}`}>
              <BigIcon leg={leg} />
            </span>
            <div className="j-head-main">
              <div className="j-kicker">
                {lang === 'en' ? 'Head towards' : 'Fahre Richtung'}
                {startedAt != null && <span className="j-timer"> · {elapsedText(elapsedMs)}</span>}
              </div>
              <div className="j-head-target">{toName}</div>
            </div>
            {distText && (
              <div className="j-dist-badge">
                {distText.replace(/ ?(km|m)$/, '')}
                <small> {distText.endsWith('km') ? 'km' : 'm'}</small>
              </div>
            )}
          </div>
          <button className="j-end" onClick={onExit} title={t('jmEnd', lang)}>
            <CloseIcon size={20} />
          </button>
        </div>

        {isNearDropoff ? (
          <div className="timer-banner urgent">
            <PinIcon size={14} /> {t('jmDropoff', lang)} <b>{distText}</b> {t('jmDropoffAction', lang)}
          </div>
        ) : isBikeLeg && !b?.electric ? (
          <div className={`timer-banner${remainingMins <= 5 ? ' urgent' : ''}`}>
            <ClockIcon size={14} /> {t('jmTimerFree', lang)}{' '}
            <b>{remainingMins} {t('jmTimerFreeMin', lang)}</b>
          </div>
        ) : isTransitLeg && distToEnd != null && distToEnd <= 250 ? (
          <div className="timer-banner urgent">
            <TargetIcon size={14} /> {t('jmExitNext', lang)} »{toName}«
          </div>
        ) : null}
      </div>

      {/* Unteres Blatt: Fortschritt, aktuelle Etappe, Navigation */}
      <div className="j-panel">
        <div className="j-progress">
          {legs.map((_, i) => (
            <span key={i} className={`j-step${i <= legIndex ? ' done' : ''}`} />
          ))}
        </div>

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
            </div>
            <div className="j-legsub">
              {hm(leg.startTime)} · {fromName} → {toName}
            </div>
          </div>
        </div>

        {infoLine && <div className={`j-info${infoWarn ? ' warn' : ''}`}>{infoLine}</div>}

        <div className="j-nav">
          <button className="j-nav-prev" disabled={legIndex === 0} onClick={onPrev} title={t('jmPrev', lang)}>
            <ChevronLeft size={24} />
          </button>
          {/* Beim Rad: Ausleihe in der Nextbike-App. Als eigene Zeile nahm der
              Knopf der Karte zu viel weg — jetzt in derselben Reihe. */}
          {isBikeLeg && (
            <a
              className="j-nav-bike"
              href={nextbikeLink(leg)}
              target="_blank"
              rel="noreferrer"
              aria-label={lang === 'en' ? 'Open in Nextbike' : 'In Nextbike öffnen'}
              title={lang === 'en' ? 'Open in Nextbike' : 'In Nextbike öffnen'}
            >
              <ExternalIcon size={20} />
            </a>
          )}
          {last ? (
            <button className="j-nav-next" onClick={onArrive}>
              {t('jmArrivedBtn', lang)} <SendIcon size={20} />
            </button>
          ) : (
            <button className="j-nav-next" onClick={onNext}>
              {t('jmNext', lang)} <ChevronRight size={22} />
            </button>
          )}
        </div>

        <div className="j-strips">
          {legs.map((l, i) => {
            const lk = legKind(l)
            const sel = i === legIndex
            return (
              <button key={i} className={`j-chip ${lk}${sel ? ' sel' : ''}`}>
                <ChipIcon leg={l} />
                <span>{mins(l.duration)}′</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
