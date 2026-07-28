/**
 * Blickrichtung aus dem Magnetfeldsensor.
 *
 * Bisher kam die Richtung ausschließlich aus dem Standort: entweder als `heading`
 * des Anbieters oder aus zwei aufeinanderfolgenden Messungen. Beides ist ein
 * *Kurs über Grund* — er sagt, wohin man fährt, nicht wohin man schaut. Steht man,
 * gibt es ihn gar nicht, und das Telefon in der Hand zu drehen ändert nichts.
 * Genau das war die Beobachtung auf der Fahrt.
 *
 * Der Sensor liefert dagegen die Himmelsrichtung der Geräteoberkante, auch im
 * Stand. Kartendienste mischen beides: in Fahrt führt der Kurs (ruhiger und
 * unbeeinflusst von Metall in der Nähe), im Stand der Sensor.
 *
 * Grenzen, die bleiben:
 * — iOS verlangt eine ausdrückliche Freigabe, und die geht nur aus einer
 *   Bedienhandlung heraus. Deshalb `freigeben()` getrennt vom Start.
 * — Der Sensor wird von Metall gestört: Lenkerhalterung, Fahrradrahmen,
 *   Magnete in Hüllen. Abweichungen von einigen zehn Grad sind normal, dagegen
 *   hilft nur Kalibrieren durch den Nutzer (die bekannte Achterbewegung).
 * — Ein Browser bekommt fertige Winkel, keine Rohwerte. Eine eigene Fusion mit
 *   dem Drehratensensor, wie sie native Navigationsprogramme fahren, ist damit
 *   nicht möglich.
 */

interface KompassEreignis extends DeviceOrientationEvent {
  /** iOS: bereits rechtweisende Nordrichtung in Grad. */
  webkitCompassHeading?: number
  /** iOS: Unsicherheit in Grad; negativ heißt „nicht kalibriert". */
  webkitCompassAccuracy?: number
}

type MitFreigabe = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

/** Verlangt dieses Gerät eine ausdrückliche Freigabe? (iOS ab 13) */
export function kompassBrauchtFreigabe(): boolean {
  const K = window.DeviceOrientationEvent as unknown as MitFreigabe | undefined
  return typeof K?.requestPermission === 'function'
}

/**
 * Freigabe holen. Muss aus einer Bedienhandlung heraus aufgerufen werden —
 * iOS lehnt den Aufruf sonst ohne Nachfrage ab.
 */
export async function kompassFreigeben(): Promise<boolean> {
  const K = window.DeviceOrientationEvent as unknown as MitFreigabe | undefined
  if (typeof K?.requestPermission !== 'function') return true
  try {
    return (await K.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

/** Drehung des Bildschirms gegenüber der Geräteoberkante. */
function schirmwinkel(): number {
  const w = screen.orientation?.angle
  if (typeof w === 'number') return w
  const alt = (window as { orientation?: number }).orientation
  return typeof alt === 'number' ? alt : 0
}

export interface Kompass {
  stop: () => void
}

export interface Rohwerte {
  /** iOS: bereits rechtweisend. */
  webkitCompassHeading?: number | null
  webkitCompassAccuracy?: number | null
  /** Drehung um die Hochachse, gegen den Uhrzeigersinn ab Norden. */
  alpha?: number | null
  /** Ist `alpha` am Erdmagnetfeld ausgerichtet? */
  absolut: boolean
  /** `screen.orientation.angle` — Drehung des Inhalts gegen das Gerät. */
  schirmwinkel: number
}

/**
 * Blickrichtung aus den Rohwerten eines Lageereignisses.
 *
 * Warum der Schirmwinkel **addiert** wird — hergeleitet an einem Beispiel:
 * Das Telefon liegt hochkant, Oberkante nach Norden. Dreht man es um 90° im
 * Uhrzeigersinn, zeigt die Geräteoberkante nach Osten (90). Der Inhalt bleibt
 * für den Betrachter aufrecht, seine Oberkante zeigt also weiter nach Norden
 * (0), und das Betriebssystem meldet `screen.orientation.angle` 270. Gesucht
 * ist die Richtung, in die der *Inhalt* zeigt, denn in dessen Koordinaten wird
 * die Karte gezeichnet: (90 + 270) mod 360 = 0. Ebenso in der anderen
 * Querlage (270 + 90) und über Kopf (180 + 180).
 *
 * Gibt `null` zurück, wenn sich aus dem Ereignis keine Himmelsrichtung ableiten
 * lässt — ein `alpha` ohne Ausrichtung am Erdmagnetfeld hat auf manchen Geräten
 * eine willkürliche Nullrichtung und wäre als Kompass wertlos.
 */
export function kursAusEreignis(r: Rohwerte): { grad: number; unsicherheit: number | null } | null {
  let roh: number | null = null
  let unsicherheit: number | null = null

  const ios = r.webkitCompassHeading
  if (typeof ios === 'number' && Number.isFinite(ios)) {
    roh = ios
    const g = r.webkitCompassAccuracy
    // Negativ heißt bei Apple „nicht kalibriert", nicht „null Grad Fehler".
    unsicherheit = typeof g === 'number' && g >= 0 ? g : null
  } else if (r.absolut && typeof r.alpha === 'number' && Number.isFinite(r.alpha)) {
    // `alpha` zählt gegen den Uhrzeigersinn, ein Kompass mit ihm.
    roh = 360 - r.alpha
  }
  if (roh == null) return null

  const w = Number.isFinite(r.schirmwinkel) ? r.schirmwinkel : 0
  return { grad: (((roh + w) % 360) + 360) % 360, unsicherheit }
}

/**
 * Blickrichtung verfolgen. `onKurs` bekommt Grad im Uhrzeigersinn ab Norden.
 *
 * `deviceorientationabsolute` zuerst: nur dieses Ereignis ist am Erdmagnetfeld
 * ausgerichtet. Das schlichte `deviceorientation` liefert auf manchen Geräten
 * eine willkürliche Nullrichtung — als Kompass wäre es wertlos, außer iOS legt
 * seinen eigenen Wert bei.
 */
export function kompassStarten(onKurs: (grad: number, unsicherheit: number | null) => void): Kompass {
  if (typeof window.addEventListener !== 'function') return { stop: () => {} }

  let absolutGesehen = false

  const auswerten = (e: KompassEreignis, absolut: boolean) => {
    const k = kursAusEreignis({
      webkitCompassHeading: e.webkitCompassHeading,
      webkitCompassAccuracy: e.webkitCompassAccuracy,
      alpha: e.alpha,
      absolut,
      schirmwinkel: schirmwinkel(),
    })
    if (k) onKurs(k.grad, k.unsicherheit)
  }

  const aufAbsolut = (e: Event) => {
    absolutGesehen = true
    auswerten(e as KompassEreignis, true)
  }
  // Nur solange kein absolutes Ereignis kommt — und nur für den iOS-Wert,
  // der auch ohne `absolute` rechtweisend ist.
  const aufRelativ = (e: Event) => {
    if (absolutGesehen) return
    auswerten(e as KompassEreignis, false)
  }

  window.addEventListener('deviceorientationabsolute', aufAbsolut)
  window.addEventListener('deviceorientation', aufRelativ)

  return {
    stop: () => {
      window.removeEventListener('deviceorientationabsolute', aufAbsolut)
      window.removeEventListener('deviceorientation', aufRelativ)
    },
  }
}
