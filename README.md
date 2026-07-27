# 🚲 Radl Navi — MyRadl + MVV

Multimodaler Routenplaner für München: verbindet **Fußweg → MyRadl-Rad → ÖPNV**
zu einer durchgehenden Route, mit Live-Verfügbarkeit der Räder und einem Blick
auf die 30 Freiminuten. Diese Kombination bieten weder Google Maps noch MVGO.

Privates, nicht-kommerzielles Projekt. **Kein Backend**: statische PWA, alle
verwendeten Schnittstellen sind offen und liefern CORS `*`.

**Live: https://neldosik.github.io/radl-nav/** (GitHub Pages, Zweig `gh-pages`)

**Gestaltung** „Papier & Petrol": warme Papierflächen (`#f4f1ea`), Petrol als
Akzent für alles Kostenlose (`#1f7a6f`), Terracotta für alles Kostenpflichtige
(`#b4552a`), Newsreader für Zahlen und Überschriften, Public Sans für den Rest.
Deutschsprachige Oberfläche mit englischer Umschaltung. Gestaltungsvariablen in
`src/index.css`, Symbole in `src/icons.tsx`.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173/
npm test           # 126 Tests der Rechenlogik (vitest)
npm run build      # Produktionsbündel nach dist/
```

### Veröffentlichen und zurückrollen

`gh-pages` hängt als eigenes Arbeitsverzeichnis (`git worktree`) unter
`.gh-pages/`. Jedes Deployment ist ein normaler Commit obendrauf, der Push
kommt ohne `-f` aus, die Historie bleibt erhalten.

```bash
npm run deploy                    # bauen und veröffentlichen
npm run deploy:list               # letzte 20 Deployments: Zeit und Quell-Commit
npm run deploy:rollback           # ein Deployment zurück
npm run deploy:rollback -- a1b2c3 # auf ein bestimmtes Deployment
```

Der Rollback schreibt keine Historie um: der alte Dateibaum wird als **neuer**
Commit obenauf gelegt. So bleibt nachvollziehbar, wann zurückgegangen wurde,
und der Rollback des Rollbacks ist derselbe Handgriff.

Mit `DEPLOY_REMOTE=<remote>` lässt sich ein Deployment gegen ein Testrepository
fahren, ohne die Produktion anzufassen.

## Aufbau

| Datei | Zuständigkeit |
|---|---|
| `src/gbfs.ts` | reine GBFS-Parser: Standardräder von E-Bikes trennen, Stationsräder nicht doppelt zählen |
| `src/geo.ts` | Entfernungen, nächstgelegene Stationen, Abholplanung für Gruppen, Verdichtung freier Räder |
| `src/routing.ts` | Routenregeln: Filter (nur MyRadl, Zeitlimit, Radtyp), Rückgabestation, Suche |
| `src/stats.ts` | Kalorien (MET), CO₂ über die Strecke, Leihkosten — getrennt für E-Bike und Standardrad |
| `src/notify.ts` | Erinnerung „Rad zurückgeben" (LocalNotifications bzw. Notification API) |
| `src/api.ts` | ausschließlich Netz: Transitous, GBFS, Open-Meteo |
| `src/history.ts` | Fahrtenbuch und Statistik (localStorage) |
| `src/hooks/useJourney.ts` | Los-Modus: GPS, Etappenwechsel, Bildschirm wachhalten |
| `src/hooks/useWakeLock.ts` | Bildschirm an: Capacitor KeepAwake → Wake Lock API → Video-Notnagel |
| `src/hooks/useTheme.ts` | heller und dunkler Modus |
| `src/App.tsx` | Zusammensetzen der Ansichten und Zustand der Suche |

Getestet ist die Rechenlogik (`gbfs`, `geo`, `routing`, `stats`, `notify`,
`format`, `polyline`) — dort, wo ein Fehler nicht ins Auge fällt: Zählung der
Räder, die 30 Freiminuten, die Routenfilter.

## Datenquellen

| Quelle | Liefert | Anmerkung |
|---|---|---|
| `api.transitous.org/api/v5/plan` | intermodales Routing (MOTIS, deutschlandweit) | ohne Schlüssel; Fair Use, nicht-kommerziell |
| `api.transitous.org/api/v1/geocode` | Adress- und Haltestellensuche | `place=48.137,11.575&placeBias=3` — sonst schlägt Duisburg Münchner Haltestellen |
| `gbfs.nextbike.net/.../nextbike_ml/de/*` | MyRadl-Stationen und Live-Bestand (ttl 60 s) | E-Bikes über `propulsion_type != human` |
| `.../free_bike_status.json` | Fahrzeugliste | 4682 Einträge, davon 422 wirklich freistehend — die übrigen stehen an Stationen und sind bereits in `station_status` enthalten (Stand 27.07.2026) |
| Google-Maps-Deeplinks | Turn-by-turn je Etappe | `/maps/dir/?api=1&travelmode=bicycling\|walking\|transit` |

### Wichtige Parameter für `plan`

- `preTransitRentalFormFactors=BICYCLE` (samt `post` und `direct`) — **notwendig**, sonst setzt MOTIS Dott-Roller in jede Route;
- `maxPre/PostTransitTime=1800` — Radzubringer bis 30 Minuten statt der voreingestellten 15;
- `maxDirectTime=2700` — sonst fallen reine Radrouten weg;
- Polylinien: Google Polyline, **Precision 6** (ab API v2).

### `returnConstraint`: warum die Navigation zum falschen Ziel führte (geprüft 27.07.2026)

MOTIS übernimmt die Rückgaberegel aus dem GBFS-Feed. Für freistehende Räder
steht dort `returnConstraint: NONE` — „überall abstellbar" —, woraufhin MOTIS
die Radetappe an einem beliebigen Punkt beendet; in der Praxis genau dort, wo
ein **anderes** freistehendes Rad steht. Messung an einer echten Antwort:
Etappenende 0 m vom nächsten freien Rad entfernt, 317 m zur nächsten Station.

Für MyRadl ist das falsch — außerhalb einer Station werden 20 € fällig. Einen
Serverparameter „nur an Stationen zurückgeben" gibt es in MOTIS nicht
(`ignore*RentalReturnConstraints` wirkt nur in die andere Richtung). Deshalb
korrigiert `routing.ts` das clientseitig: Das Etappenende wird auf die nächste
echte Station umgehängt (`returnSnapped`, Suchradius 1500 m), der Umweg zählt
gegen Zeitlimit und Freiminuten, und die Navigation führt dorthin
(`legTarget`). Maßgeblich ist `returnConstraint ∈ {ANY_STATION,
ROUNDTRIP_STATION}`; `toStationName` ist auch bei korrekten Etappen mitunter
leer und taugt nur als Ersatzsignal.

### Offline und Datenschutz

- Schriften liegen im Bündel (`src/fonts`, SIL Open Font License) — kein Aufruf
  zu `fonts.googleapis.com`, also auch ohne Netz vollständig und ohne
  IP-Weitergabe an Dritte;
- der Service Worker hält zwei getrennte Puffer: App-Hülle (Dokument,
  gebündelte Dateien, Schriften) und Kartenkacheln. Die App startet ohne Netz,
  die Stationsliste kommt dann aus dem `localStorage`-Puffer;
- Startbündel 82 kB gzip; maplibre-gl (273 kB gzip) wird erst mit der ersten
  Karte nachgeladen.

## MyRadl-Konditionen (geprüft 21.07.2026, myradl.de)

Die App rechnet mit diesen Regeln; sie sind an einer Stelle hinterlegt
(`src/stats.ts`) und lassen sich dort anpassen.

- 30 Freiminuten je Ausleihe auf dem Standardrad, nur mit ÖPNV-Abo
  (Deutschlandticket genügt); danach 1 €/30 Min, gedeckelt bei 9 €/24 h;
- E-Bike ist immer kostenpflichtig (1,50 €/30 Min mit Abo);
- die Freiminuten gelten **je Ausleihe**. Bei langen Radetappen weist die App
  deshalb auf eine Station etwa in der Mitte hin, an der sich das Rad wechseln
  lässt — die Fahrt bleibt damit innerhalb der Freiminuten;
- Rückgabe ausschließlich an offiziellen Stationen, außerhalb 20 € Gebühr;
- Reservierung in der offiziellen App: max. 15 Minuten, bis zu 4 Räder je Konto.
