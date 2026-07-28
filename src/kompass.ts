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
    let roh: number | null = null
    let unsicher: number | null = null

    if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
      roh = e.webkitCompassHeading
      const g = e.webkitCompassAccuracy
      unsicher = typeof g === 'number' && g >= 0 ? g : null
    } else if (absolut && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
      // `alpha` zählt gegen den Uhrzeigersinn ab Norden, ein Kompass mit ihm.
      roh = 360 - e.alpha
    }
    if (roh == null) return

    // Der Winkel gilt für die Geräteoberkante. Liegt das Telefon quer, ist der
    // Bildschirm dagegen verdreht — ohne diesen Ausgleich zeigt die Karte im
    // Querformat 90 Grad daneben.
    onKurs((roh + schirmwinkel() + 360) % 360, unsicher)
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
