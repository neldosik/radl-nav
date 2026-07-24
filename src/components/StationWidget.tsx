import { useState } from 'react'
import { BikeIcon, BoltIcon, ChevronDown, ChevronUp, TargetIcon } from '../icons'
import { nearbyStations } from '../geo'
import type { LatLon, Place, Station } from '../types'

interface Props {
  userPos: LatLon | null
  stations: Station[]
  onSelectStation: (p: Place) => void
}

export default function StationWidget({ userPos, stations, onSelectStation }: Props) {
  const [open, setOpen] = useState(false)

  if (!stations.length) return null

  // Falls keine GPS-Position vorhanden: Münchner Zentrum Marienplatz als Fallback
  const pos = userPos ?? { lat: 48.137, lon: 11.575 }
  const nearest = nearbyStations(pos, stations, 2500, 2)

  if (!nearest.length) return null

  return (
    <div className={`station-widget-inline${open ? ' open' : ''}`}>
      <button
        className={`sw-inline-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        type="button"
        title="Nächste Stationen anzeigen"
      >
        <BikeIcon size={13} />
        <span>Stationen ({nearest.length})</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div className="sw-dropdown">
          <div className="sw-dropdown-head">
            <span>
              <BikeIcon size={13} /> NÄCHSTE MYRADL-STATIONEN
            </span>
            <span>{userPos ? 'GPS' : 'München'}</span>
          </div>
          <div className="sw-list">
            {nearest.map(({ station, dist }) => (
              <div key={station.id} className="sw-item">
                <div className="sw-info">
                  <div className="sw-name">»{station.name}«</div>
                  <div className="sw-meta">
                    <span>{dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`}</span>
                    <span className="sw-badge classic">
                      <BikeIcon size={11} /> {station.bikes} {station.bikes === 1 ? 'Rad' : 'Räder'}
                    </span>
                    {station.ebikes > 0 && (
                      <span className="sw-badge electric">
                        <BoltIcon size={11} /> {station.ebikes} E-Bike {station.maxChargePercent != null ? `⚡ ${station.maxChargePercent}%` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className="sw-btn"
                  onClick={() => {
                    onSelectStation({
                      name: `Station ${station.name}`,
                      lat: station.lat,
                      lon: station.lon,
                    })
                    setOpen(false)
                  }}
                  title="Als Startpunkt wählen"
                >
                  <TargetIcon size={13} /> Leihen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
