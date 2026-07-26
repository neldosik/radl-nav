import { useState } from 'react'
import { clearTrips, loadTrips, tripStats, whenLabel } from '../history'
import { BikeIcon, CloseIcon } from '../icons'

interface Props {
  onClose: () => void
}

/** Fahrtenbuch: was gefahren wurde, wie lange und wie viel dabei gespart wurde. */
export default function History({ onClose }: Props) {
  const [trips, setTrips] = useState(() => loadTrips())
  const s = tripStats(trips)

  return (
    <div className="picker">
      <div className="picker-top">
        <span>Meine Fahrten</span>
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
