export interface LatLon {
  lat: number
  lon: number
}

export interface Place extends LatLon {
  name: string
}

export interface GeocodeMatch {
  type: string // STOP | ADDRESS | PLACE
  name: string
  id?: string
  lat: number
  lon: number
  areas?: { name: string; adminLevel?: number }[]
}

export interface LegPlace extends LatLon {
  name: string
  departure?: string
  arrival?: string
}

export interface Rental {
  systemId?: string
  systemName?: string
  providerId?: string
  url?: string
  stationName?: string
  fromStationName?: string // leer = freistehendes Rad
  toStationName?: string
  rentalUriWeb?: string // Deep-Link zur Station/Rad in Nextbike App
  rentalUriAndroid?: string
  rentalUriIOS?: string
  formFactor?: string // BICYCLE | SCOOTER_STANDING | ...
  propulsionType?: string // HUMAN | ELECTRIC_ASSIST | ELECTRIC
  returnConstraint?: string
}

export interface Leg {
  mode: string // WALK | RENTAL | BUS | SUBWAY | TRAM | ...
  from: LegPlace
  to: LegPlace
  duration: number // Sekunden
  startTime: string
  endTime: string
  scheduledStartTime?: string // Geplante Zeit (für Verspätungsberechnung)
  realTime?: boolean // Echtzeitdaten vorhanden
  cancelled?: boolean // Fahrt storniert/ausgefallen
  distance?: number
  headsign?: string
  routeShortName?: string
  routeColor?: string
  routeTextColor?: string
  legGeometry?: { points: string; length?: number; precision?: number }
  rental?: Rental
}

export interface Itinerary {
  duration: number
  startTime: string
  endTime: string
  transfers: number
  legs: Leg[]
}

export interface PlanResponse {
  itineraries: Itinerary[]
  direct?: Itinerary[]
}

/** Freistehendes Rad (nicht an Station) aus GBFS free_bike_status. */
export interface FreeBike extends LatLon {
  id: string
  electric: boolean
  batteryPercent?: number
  rangeKm?: number
}

/** Live MyRadl-Station aus GBFS. */
export interface Station extends LatLon {
  id: string
  name: string
  /** Deep-Links aus `station_information.rental_uris` (alle 778 Stationen liefern sie) */
  rentalUris?: { android?: string; ios?: string; web?: string }
  bikes: number // klassische Räder (30 Freiminuten mit Abo)
  ebikes: number // E-Bike — kostenpflichtig
  docks: number | null
  /** Bester Akkustand der E-Bikes an dieser Station in Prozent. Hieß früher
   *  zusätzlich `batteryPercent` — zwei Felder mit demselben Wert. */
  maxChargePercent?: number
  rangeKm?: number
}

export interface BikeLegInfo {
  startStation: Station | null
  /** Station, an der das Rad zurückgegeben wird — Ziel der Navigation. */
  endStation: Station | null
  tooLong: boolean // länger als Freiminuten-Fenster (inkl. Umweg zur Station)
  electric: boolean // E-Bike — immer kostenpflichtig
  freeFloating: boolean // Rad steht frei
  /** MOTIS wollte das Rad frei abstellen (returnConstraint NONE) — wir haben
   *  das Etappenende auf `endStation` umgebogen, sonst 20 € Strafe. */
  returnSnapped: boolean
  /** Umweg vom MOTIS-Abstellpunkt bis zur echten Station in Metern. */
  returnDetourM: number
  /** Derselbe Umweg in Sekunden Fahrzeit. */
  returnDetourSec: number
  /** Frei abstellen verlangt, aber keine Station in Reichweite. */
  noReturnStation: boolean
  swapStation: Station | null // Wechselstation um im Freifenster zu bleiben
  nearby: { station: Station; dist: number }[] // Stationen nahe Etappenstart (für Gruppen)
}

export interface ItineraryView {
  it: Itinerary
  hasBike: boolean
  warnLong: boolean
  hasElectric: boolean
  /** Mindestens eine Radetappe ohne erreichbare Rückgabestation. */
  warnReturn: boolean
  /** Zusatzsekunden aller Umwege zu den Rückgabestationen. */
  extraSec: number
  bikeLegs: Map<number, BikeLegInfo> // Etappenindex -> Live-Daten
}
