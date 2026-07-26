repo: neldosik/radl-nav
branch: main
path: src

## Last sync

date: 2026-07-26T19:37:02Z
commit: b96bb499cc4d

### Updated in this project

- Редизайн внедрён в код: палитра «Papier & Petrol» (`--paper #f4f1ea`, `--accent #1f7a6f`, `--warn #b4552a`), Newsreader + Public Sans
- Пересобран `Radl Navi — текущий UI.dc.html` по актуальному коду (8 экранов, нижние табы, складной блок поиска)
- Новое с прошлого синка: `src/hooks/useTheme.ts` — тёмная тема + окраска нативной статус-строки
- Экраны 01/05/06/08 сверены с реальным кодом: кнопки `.in-btn` в строках ввода, `picker-top` в BikeMap, чипы «Alle / Fahrrad / E-Bike», строки из `i18n.ts`, иконки взяты из `src/icons.tsx`
- Найдено 6 проблем дизайна (контраст `--faint`, двойное значение `--warn`, эмодзи в бейджах, чёрная кнопка в модалке, перенос `.controls` в 3 ряда, мёртвый CSS) — правки показаны как 3a–3f

## Screen map

| Экран в проекте | Файлы репозитория |
|---|---|
| 01 Start | src/App.tsx, src/components/PlaceInput.tsx, src/index.css, src/icons.tsx, src/i18n.ts |
| 02 Results | src/App.tsx, src/components/ItineraryCard.tsx, src/components/MapView.tsx, src/mapStyle.ts, src/format.ts |
| 03 Los-Modus | src/components/JourneyMode.tsx, src/hooks/useJourney.ts, src/components/MapView.tsx |
| 04 Ankunft | src/components/JourneyMode.tsx, src/history.ts |
| 05 BikeMap | src/components/BikeMap.tsx, src/geo.ts, src/api.ts |
| 06 MapPicker | src/components/MapPicker.tsx, src/mapStyle.ts |
| 07 History | src/components/History.tsx, src/history.ts |
| 08 FilterModal | src/components/FilterModal.tsx, src/i18n.ts |
| 3a–3f правки | src/index.css, src/components/ItineraryCard.tsx, src/components/FilterModal.tsx, src/App.tsx |
| Тёмная тема | src/hooks/useTheme.ts, src/index.css (`.dark-theme`) |

## Sync history

- 2026-07-26T17:07:15Z — первая копия экранов (тогда ещё #f3f2f2 / #ec3013 / Archivo), разбор токенов и иконок, начат редизайн главной
