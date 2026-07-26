import { useEffect, useRef, useState } from 'react'
import { geocode, getGeolocation, reverseGeocode } from '../api'
import { loadSaved, PRESET_SLOTS, removeSaved, upsertSaved } from '../places'
import { CloseIcon, PinIcon, SlotIcon, StarIcon, TargetIcon } from '../icons'
import type { GeocodeMatch, Place } from '../types'
import { t } from '../i18n'
import type { Language } from '../i18n'

interface Props {
  placeholder: string
  value: Place | null
  lang?: Language
  onSelect: (p: Place | null) => void
  onPickOnMap?: () => void
}

const RECENTS_KEY = 'radl.recents'

/**
 * Untertitel für einen Treffer: der kleinste sinnvolle Bereich zuerst.
 * „Deutschland, Bayern" steht bei jedem Münchner Treffer und hilft nicht —
 * der Stadtteil (adminLevel 9) unterscheidet Olympiapark Süd/Ost/West.
 */
function areaLabel(m: GeocodeMatch): string {
  const areas = (m.areas ?? []).filter(a => a.name)
  const byDetail = [...areas].sort((a, b) => (b.adminLevel ?? 0) - (a.adminLevel ?? 0))
  // Staat (2) und Bundesland (4) nur zeigen, wenn es nichts Genaueres gibt
  const useful = byDetail.filter(a => (a.adminLevel ?? 0) > 4)
  return (useful.length ? useful : byDetail).slice(0, 2).map(a => a.name).join(' · ')
}

function loadRecents(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveRecent(p: Place) {
  const list = [p, ...loadRecents().filter(r => r.name !== p.name)].slice(0, 6)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list))
}

export default function PlaceInput({ placeholder, value, lang = 'de', onSelect, onPickOnMap }: Props) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodeMatch[]>([])
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const timer = useRef<number | undefined>(undefined)
  const abortControllerRef = useRef<AbortController | null>(null)

  const text = value ? value.name.replace(/^📍\s*/, '') : query

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  function onChange(v: string) {
    if (value) onSelect(null)
    setQuery(v)
    window.clearTimeout(timer.current)
    if (v.trim().length < 2) {
      setMatches([])
      abortControllerRef.current?.abort()
      return
    }
    timer.current = window.setTimeout(async () => {
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      try {
        setMatches(await geocode(v, controller.signal))
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          setMatches([])
        }
      }
    }, 300)
  }

  function select(p: Place, remember = true) {
    if (remember) saveRecent(p)
    onSelect(p)
    setQuery('')
    setMatches([])
    setOpen(false)
  }

  async function useMyLocation() {
    setLocating(true)
    try {
      const pos = await getGeolocation()
      const name = await reverseGeocode(pos.lat, pos.lon).catch(() => t('myLocation', lang))
      select({ name, lat: pos.lat, lon: pos.lon }, false)
    } catch {
      // Ruhig: Zugriff verweigert oder Zeitüberschreitung
    } finally {
      setLocating(false)
    }
  }

  function saveAs(slot: { id: string; label: string }) {
    if (!value) return
    upsertSaved(slot, { name: value.name.replace(/^📍\s*/, ''), lat: value.lat, lon: value.lon })
    setSaveOpen(false)
    setRefresh(x => x + 1)
  }

  function saveCustom() {
    if (!value) return
    const label = window.prompt(t('customName', lang), '')?.trim()
    if (!label) return
    saveAs({ id: `custom-${Date.now()}`, label })
  }

  const saved = loadSaved()
  const usedIds = new Set(saved.map(s => s.id))
  const showSuggestions = !text.trim()
  const recents = showSuggestions ? loadRecents() : []
  void refresh

  return (
    <div className="place">
      <input
        className="in-field"
        value={text}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
      />
      {value ? (
        <>
          <button
            className="in-btn star"
            title={t('saveAs', lang)}
            onMouseDown={e => e.preventDefault()}
            onClick={() => setSaveOpen(o => !o)}
          >
            <StarIcon size={16} />
          </button>
          <button
            className="in-btn"
            title="Löschen"
            onClick={() => {
              onSelect(null)
              setQuery('')
              setSaveOpen(false)
            }}
          >
            <CloseIcon size={14} />
          </button>
        </>
      ) : (
        <button
          className="in-btn"
          title={t('myLocation', lang)}
          onMouseDown={e => e.preventDefault()}
          onClick={useMyLocation}
        >
          <TargetIcon size={17} />
        </button>
      )}

      {saveOpen && value && (
        <div className="drop">
          <div className="save-title">{t('saveAs', lang)}</div>
          {PRESET_SLOTS.map(s => (
            <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => saveAs(s)}>
              <span className="d-main">
                <span className="d-name">
                  <SlotIcon id={s.id} size={13} /> {s.label}
                  {usedIds.has(s.id) ? ' · ersetzen' : ''}
                </span>
              </span>
            </button>
          ))}
          <button onMouseDown={e => e.preventDefault()} onClick={saveCustom}>
            <span className="d-main">
              <span className="d-name">＋ {t('customName', lang)}</span>
            </span>
          </button>
        </div>
      )}

      {open && !saveOpen && (matches.length > 0 || showSuggestions) && (
        <div className="drop">
          {matches.map(m => (
            <button
              key={`${m.name}-${m.lat}-${m.lon}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => select({ name: m.name, lat: m.lat, lon: m.lon })}
            >
              <span className="d-main">
                <span className="d-name">{m.name}</span>
                {areaLabel(m) ? <span className="d-area">{areaLabel(m)}</span> : null}
              </span>
            </button>
          ))}

          {matches.length === 0 && showSuggestions && (
            <>
              <button onMouseDown={e => e.preventDefault()} onClick={useMyLocation}>
                <span className="d-ico">
                  <TargetIcon size={16} />
                </span>
                <span className="d-main">
                  <span className="d-name">{locating ? t('locating', lang) : t('myLocation', lang)}</span>
                </span>
              </button>

              {onPickOnMap && (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setOpen(false)
                    onPickOnMap()
                  }}
                >
                  <span className="d-ico">
                    <PinIcon size={16} />
                  </span>
                  <span className="d-main">
                    <span className="d-name">{t('pickOnMap', lang)}</span>
                  </span>
                </button>
              )}

              {saved.map(s => (
                <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => select(s.place)}>
                  <span className="d-main">
                    <span className="d-name">
                      <SlotIcon id={s.id} size={13} /> {s.label}
                    </span>
                    <span className="d-area">{s.place.name}</span>
                  </span>
                  <span
                    className="d-del"
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      e.stopPropagation()
                      removeSaved(s.id)
                      setRefresh(x => x + 1)
                    }}
                  >
                    <CloseIcon size={12} />
                  </span>
                </button>
              ))}

              {recents.map(r => (
                <button key={r.name} onMouseDown={e => e.preventDefault()} onClick={() => select(r)}>
                  <span className="d-main">
                    <span className="d-name">{r.name}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
