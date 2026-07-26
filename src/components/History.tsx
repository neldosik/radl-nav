import { useState } from 'react'
import { clearTrips, loadTrips, topRoute, tripStats, weeklyChartData, whenLabel } from '../history'
import { BikeIcon, CloseIcon } from '../icons'

interface Props {
  onClose: () => void
}

/** Fahrtenbuch & Rider Analytics Dashboard */
export default function History({ onClose }: Props) {
  const [trips, setTrips] = useState(() => loadTrips())
  const s = tripStats(trips)
  const chartData = weeklyChartData(trips)
  const favorite = topRoute(trips)

  const maxMins = Math.max(1, ...chartData.map(c => c.mins))
  const co2Label = s.co2Grams >= 1000 ? `${(s.co2Grams / 1000).toFixed(1)} kg` : `${s.co2Grams} g`

  // Achievement Badges
  const badges = [
    { id: 'km50', label: '🥉 50 km Radler', unlocked: s.bikeMinutes >= 120 },
    { id: 'save25', label: '🥈 25 € Gespart', unlocked: s.savedEuro >= 25 },
    { id: 'eco10', label: '🥇 Eco-Held 10kg', unlocked: s.co2Grams >= 10000 },
  ]

  return (
    <div className="picker">
      <div className="picker-top">
        <span>Meine Fahrten & Stat</span>
        <button className="picker-x" onClick={onClose}>
          <CloseIcon size={14} /> ZURÜCK
        </button>
      </div>

      <div className="hist-body">
        <div className="hist-stats">
          <div className="hist-stat">
            <span className="hist-num">{s.count}</span>
            <span className="hist-cap">Fahrten</span>
          </div>
          <div className="hist-stat">
            <span className="hist-num">{s.minutes}</span>
            <span className="hist-cap">Minuten</span>
          </div>
          <div className="hist-stat">
            <span className="hist-num">{s.bikeMinutes}</span>
            <span className="hist-cap">Min auf dem Rad</span>
          </div>
          <div className="hist-stat accent">
            <span className="hist-num">{s.savedEuro} €</span>
            <span className="hist-cap">gespart</span>
          </div>
        </div>

        {s.count > 0 && (
          <>
            <div className="eco-banner">
              <span>🔥 <b>{s.calories}</b> kcal verbrannt</span>
              <span className="eco-dot">·</span>
              <span>🌿 <b>{co2Label}</b> CO₂ gespart</span>
            </div>

            {favorite && (
              <div className="top-route-box">
                ⭐ Lieblingstrecke: <b>{favorite}</b>
              </div>
            )}

            <div className="chart-box">
              <div className="chart-title">Wochenübersicht (Rad-Minuten):</div>
              <div className="chart-bars">
                {chartData.map(d => {
                  const hPct = Math.round((d.mins / maxMins) * 100)
                  return (
                    <div key={d.day} className="chart-bar-col">
                      <div className="chart-bar-track">
                        <div
                          className="chart-bar-fill"
                          style={{ height: `${Math.max(d.mins > 0 ? 15 : 0, hPct)}%` }}
                          title={`${d.mins} Min`}
                        />
                      </div>
                      <span className="chart-bar-day">{d.day}</span>
                    </div>
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
            Noch keine Fahrten. Nach „Angekommen" landet jede Fahrt hier — nur auf diesem Gerät.
          </div>
        ) : (
          <div className="hist-list">
            {trips.map(t => (
              <div className="hist-item" key={t.id}>
                <div className="hist-when">{whenLabel(t.at)}</div>
                <div className="hist-main">
                  <div className="hist-route">
                    {t.from} → {t.to}
                  </div>
                  <div className="hist-meta">
                    {Math.max(1, Math.round(t.seconds / 60))} Min · {t.legs} Etappen
                    {t.bikeMinutes > 0 && (
                      <>
                        {' · '}
                        <BikeIcon size={11} /> {t.bikeMinutes} Min
                      </>
                    )}
                    {t.electric && ' · E-Bike'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {trips.length > 0 && (
        <div className="picker-bottom">
          <button
            className="btn-block ghost"
            onClick={() => {
              clearTrips()
              setTrips([])
            }}
          >
            Verlauf löschen
          </button>
        </div>
      )}
    </div>
  )
}
