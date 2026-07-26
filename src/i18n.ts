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
    appSub: 'MYRADL + MVV',
    menuTitle: 'Hauptmenü',
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

    // Navigation & Map
    borrowBtn: 'Leihen',
    startAsPoint: 'Als Start übernehmen',
  },
  en: {
    // Header & Menu
    appName: 'RADL NAVI',
    appSub: 'MYRADL + MVV',
    menuTitle: 'Main Menu',
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

    // Navigation & Map
    borrowBtn: 'Rent',
    startAsPoint: 'Set as Start',
  },
} as const

export type TranslationKey = keyof typeof dict['de']

export function t(key: TranslationKey, lang: Language): string {
  return dict[lang]?.[key] ?? dict['de'][key] ?? key
}
