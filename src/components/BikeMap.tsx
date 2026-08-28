import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getGeolocation, loadFreeBikes, loadStations } from '../api'
import { clusterFreeBikes, haversine, nearbyStations } from '../geo'
import { pickRentalUri } from '../format'
import { BikeIcon, BoltIcon, CloseIcon, ExternalIcon, TargetIcon, WalkIcon } from '../icons'
import { addCycleLayer, mapStyleUrl } from '../mapStyle'
import { stadt } from '../stadt'
import type { ThemeMode } from '../mapStyle'
import type { LatLon, Place, Station } from '../types'
import { dict, t } from '../i18n'
import { useBackGuard } from '../hooks/useBackGuard'
import type { Language } from '../i18n'
import { kachelpufferEinrichten, kartenAnfrage } from '../kachelpuffer'

interface Props {
  userPos: LatLon | null
  theme?: ThemeMode
  lang?: Language
  /** Radwege-Ebene einblenden */
  cycleLayer?: boolean
  /** als Reiter eingebettet (ohne Vollbild-Overlay und Schließen-Knopf) */
  embedded?: boolean
  /** Station als Startpunkt übernehmen */
  onSelectPlace: (p: Place) => void
  onClose: () => void
}

const RADIUS_M = 2500
/** So viele gezeichnete Pillen bleiben vorrätig, auch wenn sie gerade nicht
 *  zu sehen sind — Zurückschieben nutzt sie dann wieder. */
const ICON_VORRAT = 300



/** Fahrrad von der Seite: zwei Räder plus Rahmendreieck. Gezeichnet statt
 *  Emoji — die rutschten auf manchen Android-Geräten von der Grundlinie und
 *  änderten dabei die Breite der Pille. */
function drawBike(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const r = s * 0.19
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, s * 0.1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.arc(x + r, y + s * 0.22, r, 0, Math.PI * 2)
  ctx.moveTo(x + s - r + r, y + s * 0.22)
  ctx.arc(x + s - r, y + s * 0.22, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + r, y + s * 0.22)
  ctx.lineTo(x + s * 0.42, y - s * 0.24) // Sattelstrebe
  ctx.lineTo(x + s * 0.74, y - s * 0.24) // Oberrohr
  ctx.lineTo(x + s - r, y + s * 0.22) // Gabel
  ctx.moveTo(x + s * 0.42, y - s * 0.24)
  ctx.lineTo(x + s * 0.55, y + s * 0.22) // Sitzrohr zum Tretlager
  ctx.lineTo(x + r, y + s * 0.22) // Kettenstrebe
  ctx.stroke()
  ctx.restore()
}

/** Blitz für E-Bikes — gefüllt, damit er auch klein noch trägt. */
function drawBolt(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x + s * 0.66, y - s * 0.5)
  ctx.lineTo(x + s * 0.16, y + s * 0.08)
  ctx.lineTo(x + s * 0.44, y + s * 0.08)
  ctx.lineTo(x + s * 0.34, y + s * 0.5)
  ctx.lineTo(x + s * 0.84, y - s * 0.08)
  ctx.lineTo(x + s * 0.56, y - s * 0.08)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function generatePillBadgeCanvas(bikes: number, ebikes: number, selected: boolean, filterType: string): ImageData {
  const showE = ebikes > 0 && filterType !== 'classic'
  const showC = bikes > 0 && filterType !== 'ebike'

  const dpr = 2
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const ICON = 14
  const GAP = 4 // zwischen Symbol und Zahl
  const SPLIT = 9 // zwischen den beiden Gruppen
  const FONT = 'bold 13px system-ui, -apple-system, sans-serif'

  ctx.font = FONT
  const cW = showC ? ICON + GAP + ctx.measureText(String(bikes)).width : 0
  const eW = showE ? ICON + GAP + ctx.measureText(String(ebikes)).width : 0
  const inner = cW + eW + (showC && showE ? SPLIT : 0)

  const w = Math.max(52, Math.ceil(inner) + 22)
  const h = 32

  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.scale(dpr, dpr)

  ctx.shadowColor = 'rgba(0, 0, 0, 0.22)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  ctx.beginPath()
  const r = 13
  const x = 3, y = 2, width = w - 6, height = h - 6
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()

  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.lineWidth = selected ? 3 : 2
  // Petrol für die gewählte Station, Tinte für die übrigen — wie in der Oberfläche
  ctx.strokeStyle = selected ? '#1f7a6f' : '#24211c'
  ctx.stroke()

  const mid = h / 2 - 1
  let cur = (w - inner) / 2

  ctx.font = FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  if (showC) {
    drawBike(ctx, cur, mid, ICON, '#24211c')
    ctx.fillStyle = '#24211c'
    ctx.fillText(String(bikes), cur + ICON + GAP, mid)
    cur += cW + SPLIT
  }
  if (showE) {
    // Terracotta wie überall, wo etwas Geld kostet
    drawBolt(ctx, cur, mid, ICON, '#b4552a')
    ctx.fillStyle = '#b4552a'
    ctx.fillText(String(ebikes), cur + ICON + GAP, mid)
  }

  return ctx.getImageData(0, 0, w * dpr, h * dpr)
}

/**
 * Zurück-Geste/Zurück-Taste schließt diese Ansicht.
 *
 * Zwei Fehler steckten hier: Der Effekt hing an `onClose`, das in App.tsx als
 * Inline-Funktion übergeben wird — bei jedem Rerender (die Uhr tickt alle
 * 30 s) lief er erneut und schob einen weiteren History-Eintrag nach. Nach
 * fünf Minuten brauchte es zehn Drücke auf „Zurück", bis etwas passierte.
 * Und beim Schließen über X oder Auswahl blieb der Eintrag liegen, sodass der
 * nächste Zurück-Druck ins Leere ging.
 */

export default function BikeMap({
  userPos,
  theme = 'light',
  lang = 'de',
  cycleLayer = false,
  embedded = false,
  onSelectPlace,
  onClose,
}: Props) {
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const userMarker = useRef<maplibregl.Marker | null>(null)
  const [supply, setSupply] = useState<Station[] | null>(null)
  const [selected, setSelected] = useState<Station | null>(null)
  const [filterType, setFilterType] = useState<'all' | 'classic' | 'ebike'>('all')
  // Eigener Standort: der Reiter wird auch ohne laufende Navigation geöffnet,
  // dann liefert die App keine Position — also selbst nachfragen.
  const [ownPos, setOwnPos] = useState<LatLon | null>(null)
  const here = userPos ?? ownPos
  /** Mitte des sichtbaren Ausschnitts — danach richtet sich, welche Räder zu
   *  sehen sind. Vorher hing das am eigenen Standort: wer die Karte in einen
   *  Nachbarbezirk schob, bekam dort keine Pins, obwohl die Daten für ganz
   *  München längst im Speicher lagen. */
  const [mapCenter, setMapCenter] = useState<LatLon | null>(null)
  /** Welche Pillen-Symbole gerade im Sprite-Atlas liegen. Jede Kombination aus
   *  Radzahl, E-Bike-Zahl, Filter und Auswahl erzeugt eine eigene Grafik von
   *  gut 26 kB; ohne Freigabe wuchs der Atlas über die ganze Sitzung an. */
  const iconIds = useRef<Set<string>>(new Set())
  const home = here ?? stadt().mitte
  const center = mapCenter ?? home

  useEffect(() => {
    if (userPos) return
    let alive = true
    getGeolocation()
      .then(p => alive && setOwnPos(p))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [userPos])

  useBackGuard(!embedded, onClose)



  useEffect(() => {
    let alive = true
    Promise.all([loadStations(), loadFreeBikes()])
      .then(([st, free]) => {
        if (alive) setSupply([...st, ...clusterFreeBikes(free)])
      })
      .catch(() => alive && setSupply([]))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!canvas.current || map.current) return
    kachelpufferEinrichten(maplibregl.addProtocol)
    const m = new maplibregl.Map({
      container: canvas.current,
      style: mapStyleUrl(theme),
      center: [center.lon, center.lat],
      zoom: 14.5,
      attributionControl: { compact: true },
      transformRequest: kartenAnfrage,
    })
    // Nach jedem Schieben und Zoomen die Liste neu auf den Ausschnitt beziehen.
    const onMoveEnd = () => {
      const c = m.getCenter()
      setMapCenter({ lat: c.lat, lon: c.lng })
    }
    m.on('moveend', onMoveEnd)
    map.current = m
    // Das Set festhalten, solange der Effekt läuft: im Aufräumen zeigt das Ref
    // womöglich schon auf ein anderes.
    const ids = iconIds.current
    return () => {
      m.off('moveend', onMoveEnd)
      m.remove()
      map.current = null
      ids.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WebGL 60fps locked GeoJSON layer rendering with dynamic high-DPI canvas textures
  useEffect(() => {
    const m = map.current
    if (!m || !supply) return

    const filtered = nearbyStations(center, supply, RADIUS_M, 100).filter(({ station }) => {
      if (filterType === 'classic') return station.bikes > 0
      if (filterType === 'ebike') return station.ebikes > 0
      return station.bikes > 0 || station.ebikes > 0
    })

    // Welche Symbole dieser Durchgang braucht — alles andere wird danach frei.
    const gebraucht = new Set<string>()

    const geojson = {
      type: 'FeatureCollection' as const,
      features: filtered.map(({ station }) => {
        const uniqueId = station.id ?? `${station.lat}_${station.lon}`
        const isSel = selected ? (selected.id ? selected.id === uniqueId : selected.lat === station.lat && selected.lon === station.lon) : false
        const iconId = `pill-${station.bikes}-${station.ebikes}-${filterType}-${isSel ? 'sel' : 'norm'}`

        gebraucht.add(iconId)
        if (!m.hasImage(iconId)) {
          const imgData = generatePillBadgeCanvas(station.bikes, station.ebikes, isSel, filterType)
          m.addImage(iconId, imgData, { pixelRatio: 2 })
          iconIds.current.add(iconId)
        }

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [station.lon, station.lat],
          },
          properties: {
            id: uniqueId,
            name: station.name,
            bikes: station.bikes,
            ebikes: station.ebikes,
            iconId: iconId,
          },
        }
      }),
    }

    // Symbole nicht sofort wegwerfen, sondern erst wenn zu viele liegen.
    //
    // Vorher flog nach jedem Schieben alles raus, was gerade nicht sichtbar
    // war — und beim Zurückschieben wurde dieselbe Pille erneut auf ein
    // Canvas gezeichnet. Ein Vorrat kostet wenig (die Bilder sind winzig) und
    // spart bei jedem Hin und Her hundert Zeichenvorgänge. Erst über der
    // Grenze wird aufgeräumt, und zwar das, was dieser Durchgang nicht braucht.
    if (iconIds.current.size > ICON_VORRAT) {
      for (const id of [...iconIds.current]) {
        if (gebraucht.has(id)) continue
        if (m.hasImage(id)) m.removeImage(id)
        iconIds.current.delete(id)
        if (iconIds.current.size <= ICON_VORRAT) break
      }
    }

    const applyData = () => {
      const src = m.getSource('bikes-supply') as maplibregl.GeoJSONSource
      if (src) {
        src.setData(geojson)
      } else {
        m.addSource('bikes-supply', { type: 'geojson', data: geojson })

        m.addLayer({
          id: 'bikes-pill-symbols',
          type: 'symbol',
          source: 'bikes-supply',
          layout: {
            'icon-image': ['get', 'iconId'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-anchor': 'center',
          },
        })

        m.on('click', 'bikes-pill-symbols', e => {
          const f = e.features?.[0]
          if (f) {
            const stId = f.properties?.id
            const st = supply.find(s => (s.id && s.id === stId) || `${s.lat}_${s.lon}` === stId)
            if (st) setSelected(st)
          }
        })
        m.on('mouseenter', 'bikes-pill-symbols', () => {
          m.getCanvas().style.cursor = 'pointer'
        })
        m.on('mouseleave', 'bikes-pill-symbols', () => {
          m.getCanvas().style.cursor = ''
        })
      }
    }

    // `isStyleLoaded()` meldet die Renderbereitschaft, nicht den Stil: solange
    // noch Kacheln nachladen, bleibt es `false`, obwohl `addSource` längst geht.
    // Der Code landete deshalb im `else` und wartete auf `load` — ein Ereignis,
    // das zu dem Zeitpunkt schon durch war. Die Ebene entstand nie, die Karte
    // blieb ohne einen einzigen Rad-Pin. Also fragen wir, was wirklich zählt:
    // steht der Stil, dürfen Quelle und Ebene dazu.
    const styleReady = () => !!m.getStyle()?.layers?.length
    if (styleReady()) {
      addCycleLayer(m, cycleLayer)
      applyData()
    } else {
      // `styledata` feuert bei jeder Stiländerung erneut — anders als `load`
      // verpasst man es nicht, wenn man zu spät zuhört.
      const onStyle = () => {
        if (!styleReady()) return
        m.off('styledata', onStyle)
        addCycleLayer(m, cycleLayer)
        applyData()
      }
      m.on('styledata', onStyle)
    }

    if (here && !userMarker.current) {
      const me = document.createElement('div')
      me.className = 'mk-user'
      userMarker.current = new maplibregl.Marker({ element: me }).setLngLat([here.lon, here.lat]).addTo(m)
      // Karte einmalig auf den eigenen Standort holen, sobald er da ist
      m.easeTo({ center: [here.lon, here.lat], zoom: 14.5, duration: 500 })
    }
  }, [supply, filterType, selected, center, here, cycleLayer])

  // Für die Summe zählt der ganze Umkreis. Die Pins sind auf 100 begrenzt,
  // damit die Karte lesbar bleibt — die Zeile darunter behauptete aber
  // „im Umkreis" und zählte trotzdem nur diese 100.
  const imUmkreis = supply
    ? supply.filter(st => haversine(center, st) <= RADIUS_M && (st.bikes > 0 || st.ebikes > 0))
    : []
  const totalBikes = imUmkreis.reduce((n, st) => n + st.bikes, 0)
  const totalE = imUmkreis.reduce((n, st) => n + st.ebikes, 0)
  const walkDistM = selected && here ? Math.round(haversine(here, { lat: selected.lat, lon: selected.lon })) : null

  return (
    <div className={`picker${embedded ? ' embedded' : ''}`}>
      <div className="picker-top floating">
        <span>{t('bmTitle', lang)}</span>
        {!embedded && (
          <button className="picker-x" onClick={onClose}>
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      <div className="bm-filter-bar floating">
        <button
          className={`bm-filter-chip${filterType === 'all' ? ' active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          <BikeIcon size={14} /> {t('bmAll', lang)}
        </button>
        <button
          className={`bm-filter-chip${filterType === 'classic' ? ' active' : ''}`}
          onClick={() => setFilterType('classic')}
        >
          <BikeIcon size={14} /> {t('bmClassic', lang)}
        </button>
        <button
          className={`bm-filter-chip${filterType === 'ebike' ? ' active' : ''}`}
          onClick={() => setFilterType('ebike')}
        >
          <BoltIcon size={14} /> {t('bmEbike', lang)}
        </button>
      </div>

      <div className="picker-map">
        <div ref={canvas} className="picker-canvas" />
        <div className="bm-summary">
          {supply == null
            ? t('bmLoading', lang)
            : dict[lang].bmSummary(totalBikes, totalE)}
        </div>

        <button
          className="bm-locate"
          title={t('bmLocateTitle', lang)}
          // Zurück zum eigenen Standort — nicht zur aktuellen Kartenmitte,
          // sonst tut der Knopf nichts.
          onClick={() => map.current?.easeTo({ center: [home.lon, home.lat], zoom: 15 })}
        >
          <TargetIcon size={18} />
        </button>
      </div>

      <div className="picker-bottom">
        {selected ? (
          <>
            <div className="picker-name">{selected.name}</div>
            <div className="bm-counts-row">
              <span className="bm-count-pill classic">
                <BikeIcon size={13} /> {selected.bikes} {t('bmStandard', lang)}
              </span>
              {selected.ebikes > 0 && (
                <span className="bm-count-pill ebike">
                  <BoltIcon size={13} /> {selected.ebikes} E-Bike
                  {selected.maxChargePercent != null
                    ? ` · ${dict[lang].bmBattery(selected.maxChargePercent, selected.rangeKm ?? 25)}`
                    : ''}
                </span>
              )}
              {walkDistM != null && (
                <span className="bm-walk-tag">
                  <WalkIcon size={13} />{' '}
                  {dict[lang].bmWalkTime(walkDistM, Math.max(1, Math.ceil(walkDistM / 80)))}
                </span>
              )}
            </div>
            <div className="bm-actions">
              <button
                className="btn-block"
                onClick={() => onSelectPlace({ name: selected.name, lat: selected.lat, lon: selected.lon })}
              >
                {t('bmSelectStart', lang)}
              </button>
              {/* Deep-Link auf genau diese Station aus station_information.rental_uris */}
              <a
                className="bm-rent"
                href={pickRentalUri(selected.rentalUris)}
                target="_blank"
                rel="noreferrer"
                aria-label={t('bmOpenNextbike', lang)}
                title={t('bmOpenNextbike', lang)}
              >
                <ExternalIcon size={17} />
              </a>
            </div>
          </>
        ) : (
          <div className="bm-empty">{t('bmEmptyHint', lang)}</div>
        )}
      </div>
    </div>
  )
}
