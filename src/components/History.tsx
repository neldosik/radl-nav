import { useState } from 'react'
import {
  exactWhen,
  loadTrips,
  removeTrip,
  topRoute,
  tripStats,
  weeklyAverage,
  weeklyChartData,
  whenLabel,
} from '../history'
import { BikeIcon, BookmarkIcon, CloseIcon, TrashIcon } from '../icons'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
  lang?: Language
  /** als Reiter eingebettet (ohne Vollbild-Overlay und Schließen-Knopf) */
  embedded?: boolean
  onClose: () => void
}

/** Fahrtenbuch & Rider Analytics Dashboard */
export default function History({ lang = 'de', embedded = false, onClose }: Props) {
  const [trips, setTrips] = useState(() => loadTrips())
  /** angetippter Balken der Wochenübersicht */
  const [pickedDay, setPickedDay] = useState<string | null>(null)
  const s = tripStats(trips)
  const chartData = weeklyChartData(trips)
  const avgMins = weeklyAverage(chartData)
  const favorite = topRoute(trips)

  const maxMins = Math.max(1, ...chartData.map(c => c.mins))
  // ohne Antippen bleibt sonst kein einziger Wert sichtbar
  const shownDay = pickedDay ?? chartData.reduce((a, b) => (b.mins > a.mins ? b : a)).day
  const co2Label = s.co2Grams >= 1000 ? `${(s.co2Grams / 1000).toFixed(1)} kg` : `${s.co2Grams} g`

  // Abzeichen — jetzt an dem gemessen, was draufsteht. „50 km" prüfte vorher
  // `bikeMinutes >= 120`, also zwei Stunden statt Kilometern.
  const badges = [
    { id: 'km50', label: '50 km Radler', unlocked: s.bikeKm >= 50 },
    { id: 'save25', label: '25 € gespart', unlocked: s.savedEuro >= 25 },
    { id: 'eco10', label: 'Eco-Held 10 kg', unlocked: s.co2Grams >= 10000 },
  ]

  return (
    <div className={`picker${embedded ? ' embedded' : ''}`}>
      {embedded ? (
        <div className="screen-title">{t('histTitle', lang)}</div>
      ) : (
        <div className="picker-top">
          <span>{t('histTitle', lang)}</span>
          <button className="picker-x" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="hist-body">
        <div className="hist-stats">
          <div className="hist-stat">
            <span className="hist-num">{s.count}</span>
            <span className="hist-cap">{t('histTrips', lang)}</span>
          </div>
          <div className="hist-stat">
            <span className="hist-num">{s.minutes}</span>
            <span className="hist-cap">{t('histMinutes', lang)}</span>
          </div>
          <div className="hist-stat">
            <span className="hist-num">{s.bikeMinutes}</span>
            <span className="hist-cap">{t('histBikeMin', lang)}</span>
          </div>
          <div className="hist-stat accent">
            <span className="hist-num">{s.savedEuro} €</span>
            <span className="hist-cap">{t('histSaved', lang)}</span>
          </div>
        </div>

        {s.count > 0 && (
          <>
            <div className="eco-banner">
              <span><b>{s.calories}</b> {t('jmCalBurned', lang)}</span>
              <span className="eco-dot" />
              <span><b>{co2Label}</b> {t('jmCo2Saved', lang)}</span>
            </div>

            {favorite && (
              <div className="top-route-box">
                <BookmarkIcon size={12} /> {favorite}
              </div>
            )}

            <div className="chart-box">
              <div className="chart-head">
                <div className="chart-title">{t('histWeekTitle', lang)}</div>
                <div className="chart-avg">
                  ⌀ {avgMins} {lang === 'en' ? 'min/day' : 'Min/Tag'}
                </div>
              </div>
              <div className="chart-bars">
                {chartData.map(d => {
                  const hPct = Math.round((d.mins / maxMins) * 100)
                  const on = shownDay === d.day
                  return (
                    <button
                      key={d.day}
                      className={`chart-bar-col${on ? ' picked' : ''}`}
                      onClick={() => setPickedDay(on ? null : d.day)}
                    >
                      <span className="chart-bar-val">{d.mins} Min</span>
                      <div className="chart-bar-track">
                        <div
                          className="chart-bar-fill"
                          style={{ height: `${Math.max(d.mins > 0 ? 15 : 0, hPct)}%` }}
                        />
                      </div>
                      <span className="chart-bar-day">{d.day}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="badges-box">
              {badges.map(b => (
                <span key={b.id} className={`achieve-badge${b.unlocked ? ' unlocked' : ' locked'}`}>
                  {b.label}
                </span>
              ))}
            </div>
          </>
        )}

        {trips.length === 0 ? (
          <div className="msg">
            {t('histEmpty', lang)}
          </div>
        ) : (
          <div className="hist-list">
            {trips.map(tRec => (
              <div className="hist-item" key={tRec.id}>
                <div className="hist-when">
                  {whenLabel(tRec.at)}
                  <span className="hist-exact">{exactWhen(tRec.at)}</span>
                </div>
                <div className="hist-main">
                  <div className="hist-route">
                    {tRec.from} → {tRec.to}
                  </div>
                  <div className="hist-meta">
                    {Math.max(1, Math.round(tRec.seconds / 60))} Min · {tRec.legs} {t('jmLegs', lang)}
                    {tRec.bikeMinutes > 0 && (
                      <>
                        {' · '}
                        <BikeIcon size={11} /> {tRec.bikeMinutes} Min
                      </>
                    )}
                    {tRec.electric && ' · E-Bike'}
                  </div>
                </div>
                <button
                  className="hist-del"
                  title={lang === 'en' ? 'Delete trip' : 'Fahrt löschen'}
                  onClick={() => setTrips(removeTrip(tRec.id))}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
