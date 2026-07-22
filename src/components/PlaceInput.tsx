import { useEffect, useRef, useState } from 'react'
import { geocode } from '../api'
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

  function pick(name: string, lat: number, lon: number) {
    const p = { name, lat, lon }
    saveRecent(p)
    onSelect(p)
    setQuery('')
    setMatches([])
    setOpen(false)
  }

  const recents = !text.trim() ? loadRecents() : []

  return (
    <div className="place">
      <input
        value={text}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
      />
      {value && (
        <button
          className="clear"
          onClick={() => {
            onSelect(null)
            setQuery('')
          }}
        >
          ✕
        </button>
      )}
      {open && (matches.length > 0 || recents.length > 0) && (
        <div className="dropdown">
          {matches.map(m => (
            <button
              key={`${m.name}-${m.lat}-${m.lon}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(m.name, m.lat, m.lon)}
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
          {matches.length === 0 &&
            recents.map(r => (
              <button
                key={r.name}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(r.name, r.lat, r.lon)}
              >
                <span className="p-name">🕘 {r.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
