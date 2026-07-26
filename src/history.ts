/** Abgeschlossene Fahrten — bleiben nur lokal im Browser. */
export interface TripRecord {
  id: string
  /** ISO-Zeitpunkt der Ankunft */
  at: string
  from: string
  to: string
  /** tatsächlich gebrauchte Zeit in Sekunden */
  seconds: number
  legs: number
  /** Minuten auf dem Rad laut Route */
  bikeMinutes: number
  /** Fahrt enthielt ein kostenpflichtiges E-Bike */
  electric: boolean
}

const KEY = 'radl.trips'
const MAX = 100

export function loadTrips(): TripRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function addTrip(t: Omit<TripRecord, 'id' | 'at'>): TripRecord[] {
  const rec: TripRecord = { ...t, id: `${Date.now()}`, at: new Date().toISOString() }
  const next = [rec, ...loadTrips()].slice(0, MAX)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

export function clearTrips(): void {
  localStorage.removeItem(KEY)
}

export interface TripStats {
  count: number
  minutes: number
  bikeMinutes: number
  savedEuro: number
  calories: number
  co2Grams: number
}

export function tripStats(trips: TripRecord[]): TripStats {
  const stats = { count: trips.length, minutes: 0, bikeMinutes: 0, savedEuro: 0, calories: 0, co2Grams: 0 }
  for (const t of trips) {
    stats.minutes += Math.round(t.seconds / 60)
    stats.bikeMinutes += t.bikeMinutes
    // Ohne Abo kostet jede angefangene halbe Stunde 1 € (E-Bike zählt nicht als gespart)
    if (!t.electric && t.bikeMinutes > 0) stats.savedEuro += Math.ceil(t.bikeMinutes / 30)
    // ~5 kcal per bike minute and ~38g CO2 saved per bike minute vs car
    stats.calories += Math.round(t.bikeMinutes * 5.2)
    stats.co2Grams += Math.round(t.bikeMinutes * 38)
  }
  return stats
}

/** „vor 5 Min", „gestern", „12.07." — kurze Zeitangabe für die Liste. */
export function whenLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  const diffMin = Math.round((now - d.getTime()) / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min`
  const sameDay = new Date(now).toDateString() === d.toDateString()
  if (sameDay) return `heute ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  const yesterday = new Date(now - 86400000).toDateString() === d.toDateString()
  if (yesterday) return `gestern ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
