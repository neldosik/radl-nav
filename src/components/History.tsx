import { useEffect, useRef, useState } from 'react'
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
import type { TripRecord } from '../history'
import { BikeIcon, BookmarkIcon, CloseIcon, ShareIcon, TrashIcon } from '../icons'
import { dict, t } from '../i18n'
import type { Language } from '../i18n'
import {
  dateiName,
  dateiSpeichern,
  gpxErzeugen,
  sicherungEinlesen,
  sicherungErzeugen,
} from '../sicherung'
import { co2Label, preisBekannt } from '../stats'

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
  /** Kurze Rückmeldung zu Sichern/Einlesen — sonst passiert scheinbar nichts. */
  const [hinweis, setHinweis] = useState<string | null>(null)
  const dateiFeld = useRef<HTMLInputElement>(null)
  const s = tripStats(trips)
  const chartData = weeklyChartData(trips)
  const avgMins = weeklyAverage(chartData)
  const favorite = topRoute(trips)

  useEffect(() => {
    if (!hinweis) return
    const id = window.setTimeout(() => setHinweis(null), 4000)
    return () => window.clearTimeout(id)
  }, [hinweis])

  function sichern() {
    dateiSpeichern(dateiName('radl-fahrten', 'json'), sicherungErzeugen(trips), 'application/json')
    setHinweis(t('histExported', lang))
  }

  async function einlesen(datei: File) {
    const ergebnis = sicherungEinlesen(await datei.text())
    if (!ergebnis.ok) {
      setHinweis(t(ergebnis.grund === 'leer' ? 'histImportEmpty' : 'histImportBroken', lang))
      return
    }
    setTrips(loadTrips())
    setHinweis(dict[lang].histImported(ergebnis.added ?? 0))
  }

  function gpxSichern(trip: TripRecord) {
    const gpx = gpxErzeugen(trip)
    if (!gpx) return
    dateiSpeichern(dateiName(`radl-${trip.id}`, 'gpx'), gpx, 'application/gpx+xml')
  }

  const maxMins = Math.max(1, ...chartData.map(c => c.mins))
  // ohne Antippen bleibt sonst kein einziger Wert sichtbar
  const shownDay = pickedDay ?? chartData.reduce((a, b) => (b.mins > a.mins ? b : a)).day
  const co2 = co2Label(s.co2Grams, lang)

  // Abzeichen — jetzt an dem gemessen, was draufsteht. „50 km" prüfte vorher
  // `bikeMinutes >= 120`, also zwei Stunden statt Kilometern.
  const badges = [
    { id: 'km50', label: dict[lang].histBadgeKm(50), unlocked: s.bikeKm >= 50 },
    // Das Sparabzeichen rechnet mit dem Münchner Tarif — wo keiner hinterlegt
    // ist, bliebe es eine erfundene Zahl.
    ...(preisBekannt()
      ? [{ id: 'save25', label: dict[lang].histBadgeSaved(25), unlocked: s.savedEuro >= 25 }]
      : []),
    { id: 'eco10', label: dict[lang].histBadgeEco(10), unlocked: s.co2Grams >= 10000 },
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
            <span className="hist-num">{preisBekannt() ? `${s.savedEuro} €` : s.bikeKm}</span>
            <span className="hist-cap">{t(preisBekannt() ? 'histSaved' : 'histKm', lang)}</span>
          </div>
        </div>

        {s.count > 0 && (
          <>
            <div className="eco-banner">
              <span><b>{s.calories}</b> {t('jmCalBurned', lang)}</span>
              <span className="eco-dot" />
              <span><b>{co2}</b> {t('jmCo2Saved', lang)}</span>
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
                  ⌀ {avgMins} {t('histMinPerDay', lang)}
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
                      <span className="chart-bar-val">{d.mins} {t('jmMin', lang)}</span>
                      <div className="chart-bar-track">
                        <div
                          className="chart-bar-fill"
                          style={{ height: `${Math.max(d.mins > 0 ? 15 : 0, hPct)}%` }}
                        />
                      </div>
                      <span className="chart-bar-day">{dict[lang].histDay(d.day)}</span>
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

        {/* Das Fahrtenbuch liegt nur in diesem Browser — mit den Browserdaten
            ist es sonst ersatzlos weg. */}
        <div className="hist-backup">
          <button className="hist-backup-btn" onClick={sichern} disabled={!trips.length}>
            {t('histExport', lang)}
          </button>
          <button className="hist-backup-btn" onClick={() => dateiFeld.current?.click()}>
            {t('histImport', lang)}
          </button>
          <input
            ref={dateiFeld}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            // Das Feld ist versteckt, steht aber im Baum: ohne Namen meldet
            // ein Vorleseprogramm nur „Auswahl Datei".
            aria-label={t('histImport', lang)}
            tabIndex={-1}
            onChange={e => {
              const datei = e.target.files?.[0]
              // Zurücksetzen: dieselbe Datei ein zweites Mal löste sonst kein
              // `change` mehr aus.
              e.target.value = ''
              if (datei) einlesen(datei)
            }}
          />
        </div>
        {hinweis && <div className="preset-hint">{hinweis}</div>}

        {trips.length === 0 ? (
          <div className="msg">
            {t('histEmpty', lang)}
          </div>
        ) : (
          <div className="hist-list">
            {trips.map(tRec => (
              <div className="hist-item" key={tRec.id}>
                <div className="hist-when">
                  {whenLabel(tRec.at, Date.now(), lang)}
                  <span className="hist-exact">{exactWhen(tRec.at, lang)}</span>
                </div>
                <div className="hist-main">
                  <div className="hist-route">
                    {tRec.from} → {tRec.to}
                  </div>
                  <div className="hist-meta">
                    {dict[lang].histTripMeta(Math.max(1, Math.round(tRec.seconds / 60)), tRec.legs)}
                    {tRec.bikeMinutes > 0 && (
                      <>
                        {' · '}
                        <BikeIcon size={11} /> {tRec.bikeMinutes} {t('jmMin', lang)}
                      </>
                    )}
                    {tRec.electric && ' · E-Bike'}
                  </div>
                </div>
                {tRec.track && tRec.track.length >= 2 && (
                  <button
                    className="hist-del gpx"
                    title={t('histGpx', lang)}
                    aria-label={t('histGpx', lang)}
                    onClick={() => gpxSichern(tRec)}
                  >
                    <ShareIcon size={13} />
                  </button>
                )}
                <button
                  className="hist-del"
                  title={t('histDeleteTrip', lang)}
                  aria-label={t('histDeleteTrip', lang)}
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
