export type Language = 'de' | 'en'

const KEY = 'radl.lang'

export function loadLanguage(): Language {
  const saved = localStorage.getItem(KEY)
  return saved === 'en' ? 'en' : 'de'
}

export function saveLanguage(lang: Language) {
  localStorage.setItem(KEY, lang)
}

export const dict = {
  de: {
    // Header & Menu
    appSub: 'MyRadl + MVV · München',
    menuTitle: 'Hauptmenü',
    // Untere Reiter
    tabRoute: 'Route',
    tabBikes: 'Räder',
    tabTrips: 'Fahrten',
    dry: 'trocken',
    lightMode: 'Heller Modus',
    darkMode: 'Dunkler Modus',
    langToggle: 'Auf Englisch umschalten',
    soundOn: 'Töne an',
    soundOff: 'Töne stumm',

    // Inputs & Presets
    von: 'VON',
    nach: 'NACH',
    startPlaceholder: 'Startpunkt',
    toPlaceholder: 'Ziel',
    home: 'Zuhause',
    work: 'Arbeit',
    uni: 'Schule',

    // Time & Controls
    time: 'Zeit',
    now: 'Jetzt',
    depart: 'Abfahrt',
    arrive: 'Ankunft',
    standard: 'Standard',
    ebike: 'E-Bike',
    noLimit: '∞ Limit',
    saveRoute: 'Strecke merken',
    routeBtn: 'Route',
    change: 'Ändern',

    // Badges & Filters

    // Filter Modal
    filterTitle: 'Rad-Filter & Zeitlimit',
    bikeTypeLabel: 'Fahrrad-Typ',
    standardSub: '30 Min. frei mit Abo',
    ebikeSub: 'Alle Radtypen erlaubt',
    maxBikeTime: 'Max. Fahrzeit pro Etappe',
    bikeCount: 'Anzahl Räder',
    bikeCountHint: 'Für Gruppen — MyRadl gibt höchstens 4 Räder pro Konto aus.',
    applyFilter: 'Filter anwenden',

    // Messages
    welcomeMsg: 'Wähle Start und Ziel — dann berechne ich Kombinationen aus Rad + MVV mit deinen 30 Freiminuten im Blick.',
    calculating: 'Berechne Rad + MVV …',
    noRoutesFound: 'Keine passenden Routen gefunden — passe die Filter an.',
    networkError: 'Keine Verbindung — prüfe dein Internet.',
    retry: 'Erneut versuchen',

    // Navigation & Map

    // BikeMap
    bmTitle: 'Räder in der Nähe',
    bmBack: 'ZURÜCK',
    bmLoading: 'Lade Räder …',
    bmSummary: (classic: number, ebike: number) => `${classic} Standard-Räder · ${ebike} E-Bikes im Umkreis`,
    bmAll: 'Alle',
    bmClassic: 'Fahrrad',
    bmEbike: 'E-Bike',
    bmLocateTitle: 'Auf meinen Standort zentrieren',
    bmStandard: 'Standard',
    bmWalk: 'Fußweg',
    bmOpenNextbike: 'In Nextbike öffnen',
    bmSelectStart: 'Als Start übernehmen',
    bmEmptyHint: 'Tippe auf einen Pin — Details & Räder anzeigen',

    // JourneyMode
    jmEnd: 'ENDE',
    jmPrev: 'Vorherige',
    jmNext: 'Nächste',
    jmArrived: 'Angekommen',
    jmArrivedBtn: 'Angekommen',
    jmFinish: 'Fertig',
    jmGoalReached: 'Ziel erreicht',
    jmTravelTime: 'Reine Fahrzeit',
    jmLegs: 'Etappen',
    jmCalBurned: 'kcal verbrannt',
    jmCo2Saved: 'CO₂ gespart',
    jmTimerFree: 'Rad-Timer: Noch',
    jmTimerFreeMin: 'Min Freifahrt (Puffer bis 28 Min)',
    jmDropoff: 'Rückgabestation in',
    jmDropoffAction: '— Rad abstellen & sperren',
    jmExitNext: 'Nächste Station aussteigen:',
    mapUnavailable: 'Karte nicht verfügbar',
    mapUnavailableHint: 'Dieses Gerät kann kein WebGL. Verbindungen, Zeiten und Radbestand funktionieren weiterhin.',
    jmReturnOnly: 'Rückgabe nur an Station:',
    jmNoReturnStation: 'Keine Rückgabestation in der Nähe — frei abstellen kostet 20 €',
    cardReturn: 'Rückgabe',
    cardReturnWarn: 'Keine Rückgabestation in der Nähe (20 € Strafe)',

    // History
    histTitle: 'Meine Fahrten & Statistik',
    histTrips: 'Fahrten',
    histMinutes: 'Minuten',
    histBikeMin: 'Min auf dem Rad',
    histSaved: 'gespart',
    histWeekTitle: 'Wochenübersicht (Rad-Minuten):',
    histEmpty: 'Noch keine Fahrten. Nach „Angekommen" landet jede Fahrt hier — nur auf diesem Gerät.',

    // ItineraryCard

    // PlaceInput
    myLocation: 'Mein Standort',
    locating: 'Bestimme…',
    pickOnMap: 'Auf der Karte wählen',
    saveAs: 'Speichern als',
    customName: 'Eigener Name…',
    mapPoint: 'Kartenpunkt',

    // MapPicker
    moveMapHint: 'Karte verschieben — Pin zeigt dein Ziel',
    confirm: 'Übernehmen',

    // Weather
    weatherRain: (time: string, mm: string, temp: number) => `Regen um ${time} (${mm} mm) · ${temp}° — bei Radetappen lieber MVV`,
    weatherDry: (time: string, temp: number) => `Trocken um ${time} · ${temp}° — gute Radzeit`,
  },
  en: {
    // Header & Menu
    appSub: 'MyRadl + MVV · Munich',
    menuTitle: 'Main Menu',
    // Bottom tabs
    tabRoute: 'Route',
    tabBikes: 'Bikes',
    tabTrips: 'Trips',
    dry: 'dry',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    langToggle: 'Switch to German',
    soundOn: 'Sound on',
    soundOff: 'Mute sound',

    // Inputs & Presets
    von: 'FROM',
    nach: 'TO',
    startPlaceholder: 'Starting point',
    toPlaceholder: 'Destination',
    home: 'Home',
    work: 'Work',
    uni: 'Schule',

    // Time & Controls
    time: 'Time',
    now: 'Now',
    depart: 'Depart',
    arrive: 'Arrive',
    standard: 'Standard',
    ebike: 'E-Bike',
    noLimit: '∞ Unlimited',
    saveRoute: 'Save Route',
    routeBtn: 'Route',
    change: 'Change',

    // Badges & Filters

    // Filter Modal
    filterTitle: 'Bike Filter & Time Limit',
    bikeTypeLabel: 'Bike type',
    standardSub: '30 min free with subscription',
    ebikeSub: 'All bike types allowed',
    maxBikeTime: 'Max riding time per leg',
    bikeCount: 'Number of bikes',
    bikeCountHint: 'For groups — MyRadl allows at most 4 bikes per account.',
    applyFilter: 'Apply filter',

    // Messages
    welcomeMsg: 'Select origin and destination — I will find combinations of bike + MVV transit keeping your 30 free minutes in mind.',
    calculating: 'Calculating Bike + MVV …',
    noRoutesFound: 'No suitable routes found — try adjusting your filters.',
    networkError: 'No connection — check your internet.',
    retry: 'Retry',

    // Navigation & Map

    // BikeMap
    bmTitle: 'Bikes Nearby',
    bmBack: 'BACK',
    bmLoading: 'Loading bikes …',
    bmSummary: (classic: number, ebike: number) => `${classic} standard bikes · ${ebike} E-Bikes nearby`,
    bmAll: 'All',
    bmClassic: 'Bike',
    bmEbike: 'E-Bike',
    bmLocateTitle: 'Center on my location',
    bmStandard: 'Standard',
    bmWalk: 'walk',
    bmOpenNextbike: 'Open in Nextbike',
    bmSelectStart: 'Set as start',
    bmEmptyHint: 'Tap a pin — see details & bikes',

    // JourneyMode
    jmEnd: 'END',
    jmPrev: 'Previous',
    jmNext: 'Next',
    jmArrived: 'Arrived',
    jmArrivedBtn: 'Arrived',
    jmFinish: 'Done',
    jmGoalReached: 'Destination reached',
    jmTravelTime: 'Travel time',
    jmLegs: 'Legs',
    jmCalBurned: 'kcal burned',
    jmCo2Saved: 'CO₂ saved',
    jmTimerFree: 'Bike timer: ',
    jmTimerFreeMin: 'min free ride left (28 min buffer)',
    jmDropoff: 'Drop-off station in',
    jmDropoffAction: '— lock & return bike',
    jmExitNext: 'Get off at next stop:',
    mapUnavailable: 'Map unavailable',
    mapUnavailableHint: 'This device has no WebGL. Connections, times and bike availability still work.',
    jmReturnOnly: 'Return only at station:',
    jmNoReturnStation: 'No return station nearby — parking elsewhere costs 20 €',
    cardReturn: 'Return',
    cardReturnWarn: 'No return station nearby (20 € penalty)',

    // History
    histTitle: 'My Trips & Stats',
    histTrips: 'Trips',
    histMinutes: 'Minutes',
    histBikeMin: 'Min on bike',
    histSaved: 'saved',
    histWeekTitle: 'Weekly overview (bike minutes):',
    histEmpty: 'No trips yet. After pressing "Arrived" each trip appears here — only on this device.',

    // ItineraryCard

    // PlaceInput
    myLocation: 'My Location',
    locating: 'Locating…',
    pickOnMap: 'Pick on map',
    saveAs: 'Save as',
    customName: 'Custom name…',
    mapPoint: 'Map point',

    // MapPicker
    moveMapHint: 'Move map — pin marks your destination',
    confirm: 'Confirm',

    // Weather
    weatherRain: (time: string, mm: string, temp: number) => `Rain at ${time} (${mm} mm) · ${temp}° — consider MVV for bike legs`,
    weatherDry: (time: string, temp: number) => `Dry at ${time} · ${temp}° — great biking weather`,
  },
} as const

export type TranslationKey = {
  [K in keyof typeof dict['de']]: typeof dict['de'][K] extends string ? K : never
}[keyof typeof dict['de']]

export function t(key: TranslationKey, lang: Language): string {
  return (dict[lang]?.[key] ?? dict['de'][key] ?? key) as string
}
