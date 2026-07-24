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
  fromStationName?: string // пусто = свободностоящий велик
  toStationName?: string
  rentalUriWeb?: string // deep-link на станцию/велик в приложении nextbike
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
  duration: number // seconds
  startTime: string
  endTime: string
  scheduledStartTime?: string // плановое время (для расчёта задержки)
  realTime?: boolean // есть данные реального времени
  cancelled?: boolean // рейс отменён
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

/** Живая станция MyRadl из GBFS. */
export interface Station extends LatLon {
  id: string
  name: string
  bikes: number // классические велики (бесплатные 30 мин с абонементом)
  ebikes: number // e-bike — платные, показываем отдельно
  docks: number | null
}

export interface BikeLegInfo {
  startStation: Station | null
  endStation: Station | null
  tooLong: boolean // дольше бесплатного окна
  electric: boolean // e-bike — платный всегда
  freeFloating: boolean // велик не на станции
  swapStation: Station | null // «веломарафон»: где сменить велик, чтобы остаться в 30 мин
  nearby: { station: Station; dist: number }[] // станции рядом со стартом этапа (для группы)
}

export interface ItineraryView {
  it: Itinerary
  hasBike: boolean
  warnLong: boolean
  hasElectric: boolean
  bikeLegs: Map<number, BikeLegInfo> // индекс этапа -> live-данные
}
