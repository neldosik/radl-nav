import { useEffect, useRef, useState } from 'react'
import { geocode, getGeolocation, reverseGeocode } from '../api'
import { loadSaved, PRESET_SLOTS, removeSaved, upsertSaved } from '../places'
import type { GeocodeMatch, Place } from '../types'

interface Props {
  placeholder: string
  value: Place | null
  onSelect: (p: Place | null) => void
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

export default function PlaceInput({ placeholder, value, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<GeocodeMatch[]>([])
  const [open, setOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [refresh, setRefresh] = useState(0) // форс-перерисовка после правки сохранённых
  const timer = useRef<number | undefined>(undefined)

  const text = value ? value.name : query

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
      const name = await reverseGeocode(pos.lat, pos.lon).catch(() => 'Моё местоположение')
      select({ name: `📍 ${name}`, lat: pos.lat, lon: pos.lon }, false)
    } catch {
      // тихо: пользователь отклонил доступ или таймаут
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
    const label = window.prompt('Название места:', '')?.trim()
    if (!label) return
    saveAs({ id: `custom-${Date.now()}`, emoji: '⭐', label })
  }

  const saved = loadSaved()
  const usedIds = new Set(saved.map(s => s.id))
  const showSuggestions = !text.trim()
  const recents = showSuggestions ? loadRecents() : []
  void refresh // держим зависимость от локального счётчика

  return (
    <div className="place">
      <input
        value={text}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
      />
      {value ? (
        <div className="place-actions">
          <button
            className="star"
            title="Сохранить место"
            onMouseDown={e => e.preventDefault()}
            onClick={() => setSaveOpen(o => !o)}
          >
            ☆
          </button>
          <button
            className="clear"
            onClick={() => {
              onSelect(null)
              setQuery('')
              setSaveOpen(false)
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          className="clear geo"
          title="Моя геолокация"
          onMouseDown={e => e.preventDefault()}
          onClick={useMyLocation}
        >
          {locating ? '…' : '📍'}
        </button>
      )}

      {saveOpen && value && (
        <div className="dropdown save-menu">
          <div className="save-title">Сохранить как:</div>
          {PRESET_SLOTS.map(s => (
            <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => saveAs(s)}>
              <span className="p-name">
                {s.emoji} {s.label}
                {usedIds.has(s.id) ? ' (заменить)' : ''}
              </span>
            </button>
          ))}
          <button onMouseDown={e => e.preventDefault()} onClick={saveCustom}>
            <span className="p-name">✏️ Своё название…</span>
          </button>
        </div>
      )}

      {open && !saveOpen && (matches.length > 0 || showSuggestions) && (
        <div className="dropdown">
          {matches.map(m => (
            <button
              key={`${m.name}-${m.lat}-${m.lon}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => select({ name: m.name, lat: m.lat, lon: m.lon })}
            >
              <span className="p-name">
                {m.type === 'STOP' ? '🚏 ' : '📍 '}
                {m.name}
              </span>
              {m.areas?.length ? (
                <span className="p-area">
                  {m.areas.map(a => a.name).filter(Boolean).slice(0, 2).join(', ')}
                </span>
              ) : null}
            </button>
          ))}

          {matches.length === 0 && showSuggestions && (
            <>
              <button
                className="geo-row"
                onMouseDown={e => e.preventDefault()}
                onClick={useMyLocation}
              >
                <span className="p-name">📍 {locating ? 'Определяю…' : 'Моя геолокация'}</span>
              </button>

              {saved.map(s => (
                <button
                  key={s.id}
                  className="saved-row"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => select(s.place)}
                >
                  <span className="p-name">
                    {s.emoji} {s.label}
                  </span>
                  <span className="p-area">{s.place.name}</span>
                  <span
                    className="row-del"
                    onMouseDown={e => e.preventDefault()}
                    onClick={e => {
                      e.stopPropagation()
                      removeSaved(s.id)
                      setRefresh(x => x + 1)
                    }}
                  >
                    ✕
                  </span>
                </button>
              ))}

              {recents.map(r => (
                <button
                  key={r.name}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => select(r)}
                >
                  <span className="p-name">🕘 {r.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
