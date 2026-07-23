import { useEffect, useRef, useState } from 'react'
import { geocode, getGeolocation, reverseGeocode } from '../api'
import { loadSaved, PRESET_SLOTS, removeSaved, upsertSaved } from '../places'
import { CloseIcon, PinIcon, StarIcon, TargetIcon } from '../icons'
import type { GeocodeMatch, Place } from '../types'

interface Props {
  placeholder: string
  value: Place | null
  onSelect: (p: Place | null) => void
  onPickOnMap?: () => void
}

const RECENTS_KEY = 'radl.recents'

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

export default function PlaceInput({ placeholder, value, onSelect, onPickOnMap }: Props) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodeMatch[]>([])
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const text = value ? value.name.replace(/^📍\s*/, '') : query

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function onChange(v: string) {
    if (value) onSelect(null)
    setQuery(v)
    window.clearTimeout(timer.current)
    if (v.trim().length < 2) {
      setMatches([])
      return
    }
    timer.current = window.setTimeout(async () => {
      try {
        setMatches(await geocode(v))
      } catch {
        setMatches([])
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
      const name = await reverseGeocode(pos.lat, pos.lon).catch(() => 'Mein Standort')
      select({ name, lat: pos.lat, lon: pos.lon }, false)
    } catch {
      // тихо: доступ отклонён / таймаут
    } finally {
      setLocating(false)
    }
  }

  function saveAs(slot: { id: string; emoji: string; label: string }) {
    if (!value) return
    upsertSaved(slot, { name: value.name.replace(/^📍\s*/, ''), lat: value.lat, lon: value.lon })
    setSaveOpen(false)
    setRefresh(x => x + 1)
  }

  function saveCustom() {
    if (!value) return
    const label = window.prompt('Name des Ortes:', '')?.trim()
    if (!label) return
    saveAs({ id: `custom-${Date.now()}`, emoji: '⭐', label })
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
            title="Ort speichern"
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
          title="Mein Standort"
          onMouseDown={e => e.preventDefault()}
          onClick={useMyLocation}
        >
          <TargetIcon size={17} />
        </button>
      )}

      {saveOpen && value && (
        <div className="drop">
          <div className="save-title">Speichern als</div>
          {PRESET_SLOTS.map(s => (
            <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => saveAs(s)}>
              <span className="d-main">
                <span className="d-name">
                  {s.emoji} {s.label}
                  {usedIds.has(s.id) ? ' · ersetzen' : ''}
                </span>
              </span>
            </button>
          ))}
          <button onMouseDown={e => e.preventDefault()} onClick={saveCustom}>
            <span className="d-main">
              <span className="d-name">＋ Eigener Name…</span>
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
                {m.areas?.length ? (
                  <span className="d-area">
                    {m.areas.map(a => a.name).filter(Boolean).slice(0, 2).join(', ')}
                  </span>
                ) : null}
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
                  <span className="d-name">{locating ? 'Bestimme…' : 'Mein Standort'}</span>
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
                    <span className="d-name">Auf der Karte wählen</span>
                  </span>
                </button>
              )}

              {saved.map(s => (
                <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => select(s.place)}>
                  <span className="d-main">
                    <span className="d-name">
                      {s.emoji} {s.label}
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
