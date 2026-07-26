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
    appName: 'RADL NAVI',
    appSub: 'MyRadl + MVV · München',
    menuTitle: 'Hauptmenü',
    // Untere Reiter
    tabRoute: 'Route',
    tabBikes: 'Räder',
    tabTrips: 'Fahrten',
    dry: 'trocken',
    lightMode: '☀️ Heller Modus',
    darkMode: '🌙 Dunkler Modus',
    myTrips: '📖 Meine Fahrten',
    langToggle: '🇬🇧 English',
    soundOn: '🔊 Töne an',
    soundOff: '🔇 Töne stumm',
    managePlaces: '📍 Orte verwalten',

    // Inputs & Presets
    von: 'VON',
    nach: 'NACH',
    startPlaceholder: 'Startpunkt',
    toPlaceholder: 'Ziel',
    home: 'Zuhause',
    work: 'Arbeit',
    uni: 'Uni',

    // Time & Controls
    time: 'Zeit',
    now: 'Jetzt',
    depart: 'Abfahrt',
    arrive: 'Ankunft',
    bike: 'Rad',
    standard: 'Standard',
    ebike: 'E-Bike',
    limit: 'Limit',
    noLimit: '∞ Limit',
    saveRoute: 'Strecke merken',
    bikesNearby: 'Räder in der Nähe',
    routeBtn: 'Route',
    change: 'Ändern',

    // Badges & Filters
    fastest: '⚡ Schnellste',
    free100: '🚲 100% Gratis',
    fewestTransfers: '🚶 Wenigste Umstiege',

    // Filter Modal
    filterTitle: 'Rad-Filter & Zeitlimit',
    bikeTypeLabel: 'FAHRRAD-TYP',
    standardSub: '30 Min. frei mit Abo',
    ebikeSub: 'Alle Radtypen erlaubt',
    maxBikeTime: 'MAX. FAHRZEIT PRO ETAPPE',
    applyFilter: '✓ Filter anwenden',

    // Messages
    welcomeMsg: 'Wähle Start und Ziel — dann berechne ich Kombinationen aus Rad + MVV mit deinen 30 Freiminuten im Blick.',
    calculating: 'Berechne Rad + MVV …',
    noRoutesFound: 'Keine passenden Routen gefunden — passe die Filter an.',
    networkError: 'Keine Verbindung — prüfe dein Internet.',
    retry: 'Erneut versuchen',

    // Navigation & Map
    borrowBtn: 'Leihen',
    startAsPoint: 'Als Start übernehmen',

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
    bmSelectStart: '✓ Als Start übernehmen',
    bmEmptyHint: 'Tippe auf einen Pin — Details & Räder anzeigen',

    // JourneyMode
    jmGoMode: 'Los-Modus',
    jmLeg: 'ETAPPE',
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

    // History
    histTitle: 'Meine Fahrten & Stat',
    histTrips: 'Fahrten',
    histMinutes: 'Minuten',
    histBikeMin: 'Min auf dem Rad',
    histSaved: 'gespart',
    histWeekTitle: 'Wochenübersicht (Rad-Minuten):',
    histEmpty: 'Noch keine Fahrten. Nach „Angekommen" landet jede Fahrt hier — nur auf diesem Gerät.',
    histClear: 'Verlauf löschen',

    // ItineraryCard
    freeWithSub: '0 € mit Deutschlandticket',
    eBikeCost: 'E-Bike · 1,50 €/30 Min',
    bikeTooLong: 'Rad länger als 30 Freiminuten',
    direction: 'Richtung:',
    startNav: 'LOS — Navigation starten',
    departNow: 'Abfahrt jetzt',
    departIn: 'Abfahrt in',

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
    weatherRain: (time: string, mm: string, temp: number) => `🌧️ Regen um ${time} (${mm} mm) · ${temp}° — bei Radetappen lieber MVV`,
    weatherDry: (time: string, temp: number) => `☀️ Trocken um ${time} · ${temp}° — gute Radzeit`,
  },
  en: {
    // Header & Menu
    appName: 'RADL NAVI',
    appSub: 'MyRadl + MVV · Munich',
    menuTitle: 'Main Menu',
    // Bottom tabs
    tabRoute: 'Route',
    tabBikes: 'Bikes',
    tabTrips: 'Trips',
    dry: 'dry',
    lightMode: '☀️ Light Mode',
    darkMode: '🌙 Dark Mode',
    myTrips: '📖 My Trips',
    langToggle: '🇩🇪 Deutsch',
    soundOn: '🔊 Sound On',
    soundOff: '🔇 Mute Sound',
    managePlaces: '📍 Manage Places',

    // Inputs & Presets
    von: 'FROM',
    nach: 'TO',
    startPlaceholder: 'Starting point',
    toPlaceholder: 'Destination',
    home: 'Home',
    work: 'Work',
    uni: 'Uni',

    // Time & Controls
    time: 'Time',
    now: 'Now',
    depart: 'Depart',
    arrive: 'Arrive',
    bike: 'Bike',
    standard: 'Standard',
    ebike: 'E-Bike',
    limit: 'Limit',
    noLimit: '∞ Unlimited',
    saveRoute: 'Save Route',
    bikesNearby: 'Bikes Nearby',
    routeBtn: 'Route',
    change: 'Change',

    // Badges & Filters
    fastest: '⚡ Fastest',
    free100: '🚲 100% Free',
    fewestTransfers: '🚶 Fewest Transfers',

    // Filter Modal
    filterTitle: 'Bike Filter & Time Limit',
    bikeTypeLabel: 'BIKE TYPE',
    standardSub: '30 min free with subscription',
    ebikeSub: 'All bike types allowed',
    maxBikeTime: 'MAX RIDING TIME PER LEG',
    applyFilter: '✓ Apply Filter',

    // Messages
    welcomeMsg: 'Select origin and destination — I will find combinations of bike + MVV transit keeping your 30 free minutes in mind.',
    calculating: 'Calculating Bike + MVV …',
    noRoutesFound: 'No suitable routes found — try adjusting your filters.',
    networkError: 'No connection — check your internet.',
    retry: 'Retry',

    // Navigation & Map
    borrowBtn: 'Rent',
    startAsPoint: 'Set as Start',

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
    bmSelectStart: '✓ Set as Start',
    bmEmptyHint: 'Tap a pin — see details & bikes',

    // JourneyMode
    jmGoMode: 'Go Mode',
    jmLeg: 'LEG',
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

    // History
    histTitle: 'My Trips & Stats',
    histTrips: 'Trips',
    histMinutes: 'Minutes',
    histBikeMin: 'Min on bike',
    histSaved: 'saved',
    histWeekTitle: 'Weekly overview (bike minutes):',
    histEmpty: 'No trips yet. After pressing "Arrived" each trip appears here — only on this device.',
    histClear: 'Clear history',

    // ItineraryCard
    freeWithSub: '0 € with subscription',
    eBikeCost: 'E-Bike · €1.50/30 min',
    bikeTooLong: 'Bike ride > 30 free mins',
    direction: 'Direction:',
    startNav: 'GO — Start Navigation',
    departNow: 'Depart now',
    departIn: 'Depart in',

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
    weatherRain: (time: string, mm: string, temp: number) => `🌧️ Rain at ${time} (${mm} mm) · ${temp}° — consider MVV for bike legs`,
    weatherDry: (time: string, temp: number) => `☀️ Dry at ${time} · ${temp}° — great biking weather`,
  },
} as const

export type TranslationKey = {
  [K in keyof typeof dict['de']]: typeof dict['de'][K] extends string ? K : never
}[keyof typeof dict['de']]

export function t(key: TranslationKey, lang: Language): string {
  return (dict[lang]?.[key] ?? dict['de'][key] ?? key) as string
}
