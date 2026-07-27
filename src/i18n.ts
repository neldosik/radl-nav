export type Language = 'de' | 'en'

const KEY = 'radl.lang'

export function loadLanguage(): Language {
  const saved = localStorage.getItem(KEY)
  return saved === 'en' ? 'en' : 'de'
}

export function saveLanguage(lang: Language) {
  localStorage.setItem(KEY, lang)
  applyDocumentLang(lang)
}

/** `<html lang>` mitführen — Vorleseprogramme und die Silbentrennung des
 *  Browsers richten sich danach. Vorher stand dort fest „de", auch wenn die
 *  Oberfläche auf Englisch lief. */
export function applyDocumentLang(lang: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

/**
 * Alle sichtbaren Texte an einer Stelle.
 *
 * Beide Wörterbücher haben denselben Satz Schlüssel — `i18n.test.ts` prüft das,
 * weil ein fehlender Schlüssel sonst erst auffällt, wenn jemand auf Englisch
 * umschaltet und plötzlich deutsche Wörter dazwischenstehen. Genau das war
 * vorher der Fall: ein Teil der Oberfläche lief über `t()`, ein anderer stand
 * fest im Code.
 *
 * Texte mit Zahlen oder Namen sind Funktionen, damit die Wortstellung je
 * Sprache stimmen kann — im Deutschen steht die Zahl oft woanders als im
 * Englischen.
 */
export const dict = {
  de: {
    // ── Kopfzeile und Menü ──
    appSub: 'MyRadl + MVV · München',
    menuTitle: 'Hauptmenü',
    tabRoute: 'Route',
    tabBikes: 'Räder',
    tabTrips: 'Fahrten',
    dry: 'trocken',
    dryCap: 'Trocken',
    lightMode: 'Heller Modus',
    darkMode: 'Dunkler Modus',
    langToggle: 'Auf Englisch umschalten',
    soundOn: 'Töne an',
    soundOff: 'Töne stumm',

    // ── Eingabefelder und Schnellwahl ──
    von: 'VON',
    nach: 'NACH',
    startPlaceholder: 'Startpunkt',
    toPlaceholder: 'Ziel',
    home: 'Zuhause',
    work: 'Arbeit',
    uni: 'Schule',
    swapPlaces: 'Start und Ziel tauschen',
    clearSavedPlaces: 'Gespeicherte Orte löschen',
    savedPlacesCleared: 'Gespeicherte Orte gelöscht',
    presetSaved: (ort: string, slot: string) => `»${ort}« als ${slot} gespeichert`,
    presetNeedsTarget: (slot: string) => `Ziel wählen, dann als ${slot} speichern`,
    presetSaveAs: (slot: string) => `Als ${slot} speichern`,
    presetGoto: (ort: string) => `Ziel: ${ort}`,

    // ── Zeit und Bedienelemente ──
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

    // ── Filter ──
    filterTitle: 'Rad-Filter & Zeitlimit',
    bikeTypeLabel: 'Fahrrad-Typ',
    standardSub: '30 Min. frei mit Abo',
    ebikeSub: 'Alle Radtypen erlaubt',
    maxBikeTime: 'Max. Fahrzeit pro Etappe',
    bikeCount: 'Anzahl Räder',
    bikeCountHint: 'Für Gruppen — MyRadl gibt höchstens 4 Räder pro Konto aus.',
    applyFilter: 'Filter anwenden',

    // ── Meldungen ──
    welcomeMsg: 'Wähle Start und Ziel — dann berechne ich Kombinationen aus Rad + MVV mit deinen 30 Freiminuten im Blick.',
    calculating: 'Berechne Rad + MVV …',
    noRoutesFound: 'Keine passenden Routen gefunden — passe die Filter an.',
    networkError: 'Keine Verbindung — prüfe dein Internet.',
    locationDenied: 'Kein Standort — Startpunkt bitte von Hand eingeben.',
    retry: 'Erneut versuchen',
    resultsStale: 'Orte oder Filter geändert — Ergebnisse sind veraltet',

    // ── Karte allgemein ──
    mapUnavailable: 'Karte nicht verfügbar',
    mapUnavailableHint: 'Dieses Gerät kann kein WebGL. Verbindungen, Zeiten und Radbestand funktionieren weiterhin.',
    pickStartOnMap: 'Startpunkt auf Karte wählen',
    pickDestOnMap: 'Zielpunkt auf Karte wählen',

    // ── Räder in der Nähe ──
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
    bmBattery: (pct: number, km: number) => `Max ${pct} % · ~${km} km`,
    bmWalkTime: (m: number, min: number) => `${m} m · ~${min} Min. Fußweg`,

    // ── Los-Modus ──
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
    jmCost: 'Kosten',
    jmTimerFree: 'Rad-Timer: Noch',
    jmTimerFreeMin: 'Min Freifahrt (Puffer bis 28 Min)',
    jmDropoff: 'Rückgabestation in',
    jmDropoffAction: '— Rad abstellen & sperren',
    jmExitNext: 'Nächste Station aussteigen:',
    jmReturnOnly: 'Rückgabe nur an Station:',
    jmNoReturnStation: 'Keine Rückgabestation in der Nähe — frei abstellen kostet 20 €',
    jmHeadTowards: 'Fahre Richtung',
    jmGpsLost: 'Kein GPS-Signal — Entfernung nicht aktuell',
    jmGpsDenied: 'Standort nicht freigegeben — kein Etappenwechsel',
    jmFollowing: 'Folgt dir',
    jmRecenter: 'Zentrieren',
    jmOpenNextbike: 'In Nextbike öffnen',
    jmStart: 'Start',
    jmGoal: 'Ziel',
    jmMin: 'Min',
    jmLeft: 'übrig',
    jmOffRoute: 'Du bist von der Route abgekommen',
    jmReroute: 'Neu berechnen',
    jmRerouting: 'Route wird neu berechnet …',
    jmTurnLeft: 'links',
    jmTurnRight: 'rechts',
    jmTurnSlightLeft: 'leicht links',
    jmTurnSlightRight: 'leicht rechts',
    jmTurnSharpLeft: 'scharf links',
    jmTurnSharpRight: 'scharf rechts',
    jmTurnIn: (m: number, richtung: string) => `In ${m} m ${richtung}`,
    jmTurnNow: (richtung: string) => `Jetzt ${richtung}`,
    jmBikesAt: (n: number, station: string) => `${n} an »${station}«`,
    jmReturnTo: (station: string) => ` → zurück: »${station}«`,
    jmFreeFloating: 'Freistehendes Rad',
    jmSwapAt: (station: string) => `Rad wechseln bei »${station}« — bleibt gratis`,
    jmReturnStation: (station: string, m: number) => `»${station}« (+${m} m)`,
    jmOnlyXofY: (got: number, need: number, art: string, e: number, c: number) =>
      `Nur ${got} von ${need} ${art} · ${e} E-Bikes, ${c} Standard in der Nähe`,
    jmPickupPlan: (need: number, art: string, plan: string) => `${need} ${art}: ${plan}`,

    // ── Routenkarte ──
    cardFastest: 'Schnellste',
    cardFree100: '100 % gratis',
    cardFewestChanges: 'Wenigste Umstiege',
    cardMin: 'Min',
    cardFreeWithAbo: '0 € mit Deutschlandticket',
    cardEbikePrice: 'E-Bike · 1,50 €/30 Min',
    cardTooLong: 'Rad länger als 30 Freiminuten',
    cardDepartNow: 'Abfahrt jetzt',
    cardDepartIn: (min: number) => `Abfahrt in ${min} Min`,
    cardStartNav: 'LOS — Navigation starten',
    cardDirection: 'Richtung:',
    cardPickup: 'Ausleihe:',
    cardReturn: 'Rückgabe',
    cardReturnWarn: 'Keine Rückgabestation in der Nähe (20 € Strafe)',
    cardCancelled: 'Ausfall',
    cardDelay: (min: number) => `${min > 0 ? '+' : ''}${min} Min`,
    cardElevationTitle: 'Echtes Höhenprofil (Open-Meteo)',
    cardOpenNextbike: 'Auf Nextbike öffnen',
    cardEbikeNoBattery: '· 1,50 €/30 Min',
    cardEbikeBattery: (pct: number, km: number) => `· Max ${pct} % · ~${km} km`,
    cardTooLongWarn: 'Fahrt dauert länger als 30 Min — kleine Aufzahlung.',
    cardOnlyXofY: (got: number, need: number, art: string) => `Nur ${got} von ${need} ${art} in der Nähe`,
    cardHighDemand: (n: number, wort: string) => `Hohe Nachfrage: nur noch ${n} ${wort} frei`,
    cardFreeWithBikes: (n: number, wort: string) => `0 € mit Deutschlandticket · ${n} ${wort} frei`,
    cardPickupAt: (n: number, station: string, dist: number | null) =>
      `${n} an »${station}«${dist != null ? ` (${dist} m)` : ''}`,

    // ── Fahrtenbuch ──
    histTitle: 'Meine Fahrten & Statistik',
    histTrips: 'Fahrten',
    histMinutes: 'Minuten',
    histBikeMin: 'Min auf dem Rad',
    histSaved: 'gespart',
    histWeekTitle: 'Wochenübersicht (Rad-Minuten):',
    histEmpty: 'Noch keine Fahrten. Nach „Angekommen" landet jede Fahrt hier — nur auf diesem Gerät.',
    histMinPerDay: 'Min/Tag',
    histDeleteTrip: 'Fahrt löschen',
    histBadgeKm: (km: number) => `${km} km Radler`,
    histBadgeSaved: (eur: number) => `${eur} € gespart`,
    histBadgeEco: (kg: number) => `Eco-Held ${kg} kg`,
    histTripMeta: (min: number, legs: number) => `${min} Min · ${legs} Etappen`,
    histToday: 'heute',
    histYesterday: 'gestern',
    histMinutesAgo: (min: number) => `vor ${min} Min`,

    // ── Ortseingabe ──
    myLocation: 'Mein Standort',
    locating: 'Bestimme…',
    pickOnMap: 'Auf der Karte wählen',
    saveAs: 'Speichern als',
    customName: 'Eigener Name…',
    mapPoint: 'Kartenpunkt',
    placeDelete: 'Löschen',
    placeReplace: '· ersetzen',

    // ── Kartenwähler ──
    moveMapHint: 'Karte verschieben — Pin zeigt dein Ziel',
    confirm: 'Übernehmen',

    // ── Wetter ──
    weatherTitle: 'Wetter-Radar & Niederschlag',
    weatherRain: (time: string, mm: string, temp: number) => `Regen um ${time} (${mm} mm) · ${temp}° — bei Radetappen lieber MVV`,
    weatherDry: (time: string, temp: number) => `Trocken um ${time} · ${temp}° — gute Radzeit`,
    weatherHour: (time: string) => `${time} Uhr`,
    weatherPrecip: (mm: string) => `${mm} mm/h`,

    // ── Verkehrsmittel (früher fest in format.ts) ──
    modeWalk: 'zu Fuß',
    modeBike: 'Rad',
    modeSubway: 'U-Bahn',
    modeTram: 'Tram',
    modeBus: 'Bus',
    modeSuburban: 'S-Bahn',
    modeTrain: 'Zug',

    // ── Ein Rad, zwei Räder ──
    bikeOne: 'Rad',
    bikeMany: 'Räder',
    ebikeMany: 'E-Bikes',
  },

  en: {
    // ── Header and menu ──
    appSub: 'MyRadl + MVV · Munich',
    menuTitle: 'Main menu',
    tabRoute: 'Route',
    tabBikes: 'Bikes',
    tabTrips: 'Trips',
    dry: 'dry',
    dryCap: 'Dry',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    langToggle: 'Switch to German',
    soundOn: 'Sound on',
    soundOff: 'Mute sound',

    // ── Inputs and presets ──
    von: 'FROM',
    nach: 'TO',
    startPlaceholder: 'Starting point',
    toPlaceholder: 'Destination',
    home: 'Home',
    work: 'Work',
    uni: 'School',
    swapPlaces: 'Swap start and destination',
    clearSavedPlaces: 'Clear saved places',
    savedPlacesCleared: 'Saved places cleared',
    presetSaved: (ort: string, slot: string) => `Saved “${ort}” as ${slot}`,
    presetNeedsTarget: (slot: string) => `Pick a destination, then save it as ${slot}`,
    presetSaveAs: (slot: string) => `Save as ${slot}`,
    presetGoto: (ort: string) => `Destination: ${ort}`,

    // ── Time and controls ──
    time: 'Time',
    now: 'Now',
    depart: 'Depart',
    arrive: 'Arrive',
    standard: 'Standard',
    ebike: 'E-Bike',
    noLimit: '∞ Unlimited',
    saveRoute: 'Save route',
    routeBtn: 'Route',
    change: 'Change',

    // ── Filters ──
    filterTitle: 'Bike filter & time limit',
    bikeTypeLabel: 'Bike type',
    standardSub: '30 min free with subscription',
    ebikeSub: 'All bike types allowed',
    maxBikeTime: 'Max riding time per leg',
    bikeCount: 'Number of bikes',
    bikeCountHint: 'For groups — MyRadl allows at most 4 bikes per account.',
    applyFilter: 'Apply filter',

    // ── Messages ──
    welcomeMsg: 'Select origin and destination — I will find combinations of bike + MVV transit keeping your 30 free minutes in mind.',
    calculating: 'Calculating bike + MVV …',
    noRoutesFound: 'No suitable routes found — try adjusting your filters.',
    networkError: 'No connection — check your internet.',
    locationDenied: 'No location — please enter the starting point yourself.',
    retry: 'Retry',
    resultsStale: 'Places or filters changed — results are out of date',

    // ── Map ──
    mapUnavailable: 'Map unavailable',
    mapUnavailableHint: 'This device has no WebGL. Connections, times and bike availability still work.',
    pickStartOnMap: 'Select start on map',
    pickDestOnMap: 'Select destination on map',

    // ── Bikes nearby ──
    bmTitle: 'Bikes nearby',
    bmBack: 'BACK',
    bmLoading: 'Loading bikes …',
    bmSummary: (classic: number, ebike: number) => `${classic} standard bikes · ${ebike} e-bikes nearby`,
    bmAll: 'All',
    bmClassic: 'Bike',
    bmEbike: 'E-Bike',
    bmLocateTitle: 'Center on my location',
    bmStandard: 'Standard',
    bmWalk: 'walk',
    bmOpenNextbike: 'Open in Nextbike',
    bmSelectStart: 'Set as start',
    bmEmptyHint: 'Tap a pin — see details & bikes',
    bmBattery: (pct: number, km: number) => `max ${pct} % · ~${km} km`,
    bmWalkTime: (m: number, min: number) => `${m} m · ~${min} min walk`,

    // ── Navigation mode ──
    jmEnd: 'END',
    jmPrev: 'Previous',
    jmNext: 'Next',
    jmArrived: 'Arrived',
    jmArrivedBtn: 'Arrived',
    jmFinish: 'Done',
    jmGoalReached: 'Destination reached',
    jmTravelTime: 'Travel time',
    jmLegs: 'legs',
    jmCalBurned: 'kcal burned',
    jmCo2Saved: 'CO₂ saved',
    jmCost: 'cost',
    jmTimerFree: 'Bike timer:',
    jmTimerFreeMin: 'min free ride left (28 min buffer)',
    jmDropoff: 'Drop-off station in',
    jmDropoffAction: '— lock & return bike',
    jmExitNext: 'Get off at next stop:',
    jmReturnOnly: 'Return only at station:',
    jmNoReturnStation: 'No return station nearby — parking elsewhere costs 20 €',
    jmHeadTowards: 'Head towards',
    jmGpsLost: 'No GPS signal — distance not current',
    jmGpsDenied: 'Location not granted — no automatic leg change',
    jmFollowing: 'Following you',
    jmRecenter: 'Recenter',
    jmOpenNextbike: 'Open in Nextbike',
    jmStart: 'Start',
    jmGoal: 'Destination',
    jmMin: 'min',
    jmLeft: 'left',
    jmOffRoute: 'You have left the route',
    jmReroute: 'Recalculate',
    jmRerouting: 'Recalculating route …',
    jmTurnLeft: 'left',
    jmTurnRight: 'right',
    jmTurnSlightLeft: 'slightly left',
    jmTurnSlightRight: 'slightly right',
    jmTurnSharpLeft: 'sharp left',
    jmTurnSharpRight: 'sharp right',
    jmTurnIn: (m: number, richtung: string) => `In ${m} m ${richtung}`,
    jmTurnNow: (richtung: string) => `Now ${richtung}`,
    jmBikesAt: (n: number, station: string) => `${n} at “${station}”`,
    jmReturnTo: (station: string) => ` → return to “${station}”`,
    jmFreeFloating: 'Free-floating bike',
    jmSwapAt: (station: string) => `Swap bikes at “${station}” — stays free`,
    jmReturnStation: (station: string, m: number) => `“${station}” (+${m} m)`,
    jmOnlyXofY: (got: number, need: number, art: string, e: number, c: number) =>
      `Only ${got} of ${need} ${art} · ${e} e-bikes, ${c} standard nearby`,
    jmPickupPlan: (need: number, art: string, plan: string) => `${need} ${art}: ${plan}`,

    // ── Route card ──
    cardFastest: 'Fastest',
    cardFree100: '100 % free',
    cardFewestChanges: 'Fewest changes',
    cardMin: 'min',
    cardFreeWithAbo: '0 € with subscription',
    cardEbikePrice: 'E-Bike · 1.50 €/30 min',
    cardTooLong: 'Bike ride exceeds 30 free minutes',
    cardDepartNow: 'Depart now',
    cardDepartIn: (min: number) => `Depart in ${min} min`,
    cardStartNav: 'GO — start navigation',
    cardDirection: 'Towards:',
    cardPickup: 'Pick up:',
    cardReturn: 'Return',
    cardReturnWarn: 'No return station nearby (20 € penalty)',
    cardCancelled: 'Cancelled',
    cardDelay: (min: number) => `${min > 0 ? '+' : ''}${min} min`,
    cardElevationTitle: 'Real elevation profile (Open-Meteo)',
    cardOpenNextbike: 'Open in Nextbike',
    cardEbikeNoBattery: '· 1.50 €/30 min',
    cardEbikeBattery: (pct: number, km: number) => `· max ${pct} % · ~${km} km`,
    cardTooLongWarn: 'Ride takes longer than 30 min — small surcharge.',
    cardOnlyXofY: (got: number, need: number, art: string) => `Only ${got} of ${need} ${art} nearby`,
    cardHighDemand: (n: number, wort: string) => `High demand: only ${n} ${wort} left`,
    cardFreeWithBikes: (n: number, wort: string) => `0 € with subscription · ${n} ${wort} free`,
    cardPickupAt: (n: number, station: string, dist: number | null) =>
      `${n} at “${station}”${dist != null ? ` (${dist} m)` : ''}`,

    // ── Trip log ──
    histTitle: 'My trips & stats',
    histTrips: 'Trips',
    histMinutes: 'Minutes',
    histBikeMin: 'Min on bike',
    histSaved: 'saved',
    histWeekTitle: 'This week (bike minutes):',
    histEmpty: 'No trips yet. After “Arrived” every trip lands here — on this device only.',
    histMinPerDay: 'min/day',
    histDeleteTrip: 'Delete trip',
    histBadgeKm: (km: number) => `${km} km rider`,
    histBadgeSaved: (eur: number) => `${eur} € saved`,
    histBadgeEco: (kg: number) => `Eco hero ${kg} kg`,
    histTripMeta: (min: number, legs: number) => `${min} min · ${legs} legs`,
    histToday: 'today',
    histYesterday: 'yesterday',
    histMinutesAgo: (min: number) => `${min} min ago`,

    // ── Place input ──
    myLocation: 'My location',
    locating: 'Locating…',
    pickOnMap: 'Pick on map',
    saveAs: 'Save as',
    customName: 'Custom name…',
    mapPoint: 'Map point',
    placeDelete: 'Clear',
    placeReplace: '· replace',

    // ── Map picker ──
    moveMapHint: 'Move map — pin marks your destination',
    confirm: 'Confirm',

    // ── Weather ──
    weatherTitle: 'Weather radar & precipitation',
    weatherRain: (time: string, mm: string, temp: number) => `Rain at ${time} (${mm} mm) · ${temp}° — consider MVV for bike legs`,
    weatherDry: (time: string, temp: number) => `Dry at ${time} · ${temp}° — great biking weather`,
    weatherHour: (time: string) => `${time}`,
    weatherPrecip: (mm: string) => `${mm} mm/h`,

    // ── Modes of transport ──
    modeWalk: 'on foot',
    modeBike: 'Bike',
    modeSubway: 'Subway',
    modeTram: 'Tram',
    modeBus: 'Bus',
    modeSuburban: 'S-Bahn',
    modeTrain: 'Train',

    // ── One bike, two bikes ──
    bikeOne: 'bike',
    bikeMany: 'bikes',
    ebikeMany: 'e-bikes',
  },
} as const

/** Schlüssel, hinter denen eine einfache Zeichenkette steht (für `t`). */
export type TranslationKey = {
  [K in keyof typeof dict['de']]: typeof dict['de'][K] extends string ? K : never
}[keyof typeof dict['de']]

export function t(key: TranslationKey, lang: Language): string {
  return (dict[lang]?.[key] ?? dict['de'][key] ?? key) as string
}
