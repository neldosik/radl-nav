# Handoff: Radl Navi — правки дизайна поверх «Papier & Petrol»

## Overview

Приложение уже переехало на визуальную систему «Papier & Petrol» (палитра `--paper/--accent/--warn`,
Newsreader + Public Sans, нижние табы, тёмная тема). Этот пакет описывает **следующий слой правок**,
который в репозиторий ещё не внесён: контраст, семантика цвета, отказ от эмодзи, компоновка контролов
на главной, стык карты со строкой состояния и вывод карты под системную шапку.

Целевой репозиторий: `neldosik/radl-nav`, ветка `main`, база — коммит `b96bb499cc4d`, код в `src/`.

## About the Design Files

`radl-navi-screens.dc.html` — **дизайн-референс, а не продакшн-код.** Это HTML-макет восьми экранов
в корпусе Pixel 10 Pro XL (448 × 997 CSS px), собранный по текущему коду: разметка повторяет структуру
компонентов, но написана инлайновыми стилями и без React. Не копируйте разметку в приложение —
переносите значения (цвета, размеры, порядок элементов) в существующие `src/index.css` и `.tsx`.

Файл открывается в браузере как есть; рядом должен лежать `support.js`.

Структура макета сверху вниз:
- **turn 5** — карточки 5a/5b/5c: карта под шапкой, стык шапки и карты, оставшиеся наблюдения;
- **turn 3** — карточки 3a–3f: по каждой правке слева «как сейчас», справа предложение;
- **экраны** — восемь экранов уже с применёнными правками.

## Fidelity

**High-fidelity.** Все цвета, размеры, начертания и отступы окончательные и указаны ниже точными
значениями. Расхождения между макетом и текущим кодом — это и есть задание.

---

## 1. `src/index.css` — токены и контраст

```css
:root {
  --faint: #7d7368;        /* было #9a9287 — 2,6:1 на --paper, не проходит AA */
  --alert: #a8341f;        /* НОВЫЙ: сбои, задержки, ошибки */
  --alert-soft: rgba(168, 52, 31, 0.12);
  --scrim-top: rgba(244, 241, 234, 0.94);   /* верхний скрим над картой */
}

.dark-theme {
  --faint: #8d857a;
  --alert: #e0603f;
  --alert-soft: rgba(224, 96, 63, 0.16);
  --scrim-top: rgba(27, 25, 23, 0.92);
}
```

Смысл разделения: `--warn` (терракота #b4552a) означает **платно** — E-Bike, доплата за 30+ минут.
`--alert` означает **сбой** — задержка, отмена, нехватка рёбер, сетевая ошибка. Сейчас оба смысла
красит один `--warn`, из-за чего бейдж «E-Bike · 1,50 €» читается как ошибка.

Перевести на `--alert`:

```css
.delay            { background: var(--alert); }   /* было var(--warn) */
.msg.error        { color: var(--alert); }
.bike-warn        { color: var(--alert); }
.leg-sub.warn     { color: var(--alert); }
.j-info.warn      { color: var(--alert); }
.timer-banner.urgent { background: var(--alert); }
.route-tag.alert  { color: var(--alert); font-size: 12px; font-weight: 700; }  /* новый класс */
```

`.route-tag.warn` (терракота) остаётся только для E-Bike и доплаты.

Контраст и мелочи:

```css
.tab                { color: var(--muted); font-weight: 500; }   /* было var(--faint) */
.app-footer, .sig   { font-size: 11.5px; }                        /* было 10.5px */
.hist-exact         { font-size: 10.5px; }                        /* было 10px */
.achieve-badge.locked { color: var(--faint); opacity: 0.8; }      /* было 0.65 */
.filter-modal       { background: var(--card); }                  /* было var(--paper) — лист должен читаться поднятым */
```

Кнопка «Применить» в листе фильтра: удалить перекрытие цвета, чтобы она осталась петролевой,
как все главные действия.

```css
/* УДАЛИТЬ: */
.filter-modal-apply { background: var(--ink); color: var(--paper); }
/* .filter-modal-apply уже входит в группу с .btn-route-chip и получает background: var(--accent) */
```

Уборка мёртвого кода:
- `.route-timeline-bar` объявлен дважды (высота 6px, затем 5px) — удалить первое объявление;
- удалить пустое правило `.j-etappe, .j-next-wrap, .j-next-row, .j-next-cap, .j-legcard .j-dist-badge {}`;
- `.picker-x`, `.j-end`, `.in-label` прячут текст через `font-size: 0` — заменить на визуально
  скрытый span (`clip-path: inset(50%)`), иначе любой добавленный текстовый узел исчезает молча.

## 2. `src/index.css` + `App.tsx` — контролы главной в два ряда

Проблема: сегмент времени (~212px) и чип фильтра (~160px) не влезают в 350px контентной ширины,
`.controls` разваливается на три строки, и кнопка «Route» уезжает на ~140px вниз.

Целевая раскладка: **ряд 1** — сегмент времени во всю ширину, справа две круглые кнопки 40 × 40
(фильтр и «запомнить маршрут»); **ряд 2** — кнопка «Route berechnen» во всю ширину.

```css
.controls        { flex-direction: column; align-items: stretch; gap: 10px; }
.ctl-group       { display: flex; align-items: center; gap: 8px; }
.seg-auto        { flex: 1; }
.seg-auto .seg-btn { flex: 1; justify-content: center; padding: 6px 4px; }

/* фильтр — только иконка, состояние показывает точка */
.filter-chip     { position: relative; width: 40px; padding: 0; margin-left: 0; justify-content: center; }
.filter-chip::after {
  content: ''; position: absolute; top: 6px; right: 6px;
  width: 6px; height: 6px; border-radius: 3px; background: var(--accent);
}

.ctl-row-actions { margin-left: 0; }
.fav-chip.save   { width: 40px; padding: 0; justify-content: center; }
.btn-route-chip  { width: 100%; }
```

В `App.tsx`: у кнопки фильтра оставить только иконку (`BikeIcon`/`BoltIcon`), текст «Standard · ≤ 20′»
и `ChevronDown` убрать из разметки, добавить `aria-label={t('filterTitle', lang)}` и `title` с текущим
значением. У кнопки «Route merken» оставить `BookmarkIcon` и `aria-label`. Кнопку поиска положить
отдельным блоком под `.ctl-group`, надпись — `t('routeBtn')` («Route berechnen»).

## 3. Отказ от эмодзи

Эмодзи — цветные растровые пятна поверх серифа и петроля; в `src/icons.tsx` уже есть штриховой набор.

**Добавить в `src/icons.tsx`** (тот же `base(size)`, `stroke: currentColor`, `strokeWidth: 2`):

```
ClockIcon   <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
SunIcon     <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
RainIcon    <path d="M6 15a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.4A3.6 3.6 0 0 1 17 15z" /><path d="M8 18.5 7 21M12 18.5 11 21M16 18.5 15 21" />
HomeIcon    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
FilterIcon  <path d="M3 6h18M7 12h10M10 18h4" />
DotsIcon    fill="currentColor" stroke="none": <circle cx="5" cy="12" r="1.9" /><circle cx="12" cy="12" r="1.9" /><circle cx="19" cy="12" r="1.9" />
```

**`src/App.tsx`**
- `⋯` в шапке → `<DotsIcon size={18} />` (сейчас глиф моношрифтом 12px в круге 36px — выглядит пустым);
- погодная плашка: `☀️` → `<SunIcon size={13} />`, `🌧️` → `<RainIcon size={13} />`; текст остаётся
  `24° · trocken` / `24° · 1,2 mm`;
- модалка погоды: `🌦️` в заголовке убрать, в строках часов `wh-icon` → `SunIcon`/`RainIcon`;
- чипы быстрых мест: `＋` оставить (это знак плюса, не эмодзи), `⚡` у «умного» чипа заменить на
  точку-состояние `.preset-dot`, `✕` очистки → `<CloseIcon size={12} />`;
- эмодзи слотов лежат в `src/places.ts` (`PRESET_SLOTS[].emoji`) — заменить поле на компонент иконки
  (`home → HomeIcon`, `work → BookmarkIcon`, `uni → StarIcon`) либо оставить поле пустым и выбирать
  иконку по `id`.

**`src/components/ItineraryCard.tsx`**
- `'⚡ Schnellste'` → `'Schnellste'`;
- `'🚲 100% gratis'` → `<><BikeIcon size={11} /> 100 % gratis</>`, у `.badge-highlight.free`
  добавить `display: inline-flex; align-items: center; gap: 4px;`;
- `'🚶 Wenigste Umstiege'` → `'Wenigste Umstiege'`;
- `⚠️ Hohe Nachfrage: …` → без эмодзи, и этой ветке выставить `tagKind = 'alert'` (не `'warn'`);
- ветке «Nur N von M Rädern» тоже `tagKind = 'alert'`;
- `📍 Ausleihe:` → `<PinIcon size={12} />`;
- `⚡ E-Bike …` → `<BoltIcon size={12} />`, текст `E-Bike · Max 87 % · ~25 km`;
- `⚠️ Fahrt dauert länger als 30 Min` → без эмодзи (цвет уже несёт смысл).

**`src/components/JourneyMode.tsx`**
- `⏱️ Gratis noch …` → `<ClockIcon size={14} />`;
- `📍 Rückgabe …` → `<PinIcon size={14} />`;
- `🚉 Aussteigen …` → `<TargetIcon size={14} />`.

**`src/components/History.tsx`**
- ачивки: `'🥉 50 km Radler'` → `'50 km Radler'`, `'🥈 25 € Gespart'` → `'25 € gespart'`,
  `'🥇 Eco-Held 10kg'` → `'Eco-Held 10 kg'`;
- эко-строка: `🔥` и `🌿` убрать, оставить `<b>1290</b> kcal verbrannt · <b>9,4 kg</b> CO₂ gespart`,
  разделитель — существующий `.eco-dot` (уменьшить до 5 × 5px);
- любимый маршрут: `⭐` → `<BookmarkIcon size={12} />` цветом `var(--accent)`.

**`src/components/BikeMap.tsx`**
- плашки листа станции: `🚲` → `<BikeIcon size={13} />`, `⚡` → `<BoltIcon size={13} />`,
  `🚶` → `<WalkIcon size={13} />`; `(🔋 Max: 87% · ~25 km)` → `· Max 87 % · ~25 km`;
  плашкам добавить `display: inline-flex; align-items: center; gap: 5px;`;
- **`generatePillBadgeCanvas`** рисует эмодзи прямо в canvas (`⚡ ${ebikes}`, `🚲 ${bikes}`) — на части
  Android они уезжают по базовой линии и меняют ширину пилюли. Заменить на текст без эмодзи:
  `${bikes}` для обычных, `${ebikes} E` для электрических, разделитель `·`; шрифт оставить
  `bold 12px system-ui`, ширину считать как сейчас через `measureText`.

**`src/i18n.ts`**
- `bmSelectStart: '✓ Als Start übernehmen'` и `applyFilter: '✓ Filter anwenden'` — галочку можно
  оставить (это не эмодзи), но она дублирует смысл кнопки; при желании убрать в обоих языках;
- `bikeTypeLabel: 'FAHRRAD-TYP'` и `maxBikeTime: 'MAX. FAHRZEIT PRO ETAPPE'` записаны капсом,
  хотя `.filter-label` уже делает `text-transform: uppercase` — перевести строки в обычный регистр,
  иначе перевод на другие языки будет кричать.

## 4. Стык карты и шапки + карта под системную строку

**Ошибка, которую видно на «Räder in der Nähe»:** фон шапки был бумажным, карта — глиняной, на стыке
шла ровная полоса во всю ширину. В CSS всё уже верно (`.picker { background: var(--map-bg) }`),
проверьте, что ни `.picker.embedded`, ни родительский `.app` не перекрывают его на `--paper`:
у встроенного в таб `BikeMap` корпус должен быть `--map-bg`, а `--paper` остаётся только у
`.picker.embedded .screen-title` в `History`.

**Скрим над картой.** Карта светлая, и по ней идут тёмные глифы строки состояния плюс плавающие
карточки. Нужен мягкий градиент сверху:

```css
.picker-map::before,
.journey::before {
  content: '';
  position: absolute;
  left: 0; right: 0; top: 0;
  height: calc(110px + env(safe-area-inset-top, 0px));
  background: linear-gradient(180deg, var(--scrim-top) 0%, transparent 100%);
  pointer-events: none;
  z-index: 2;
}
```

Порядок слоёв критичен — иначе скрим замывает карточки:

```css
.j-poster        { z-index: 10; }   /* уже есть, не терять */
.picker-top      { position: relative; z-index: 10; }
.bm-filter-bar   { position: relative; z-index: 10; }
.bm-summary, .bm-locate, .picker-hint { z-index: 10; }
.maplibregl-marker { z-index: 3; }  /* маркеры выше скрима */
```

**Вывод карты под шапку (edge-to-edge).** Технически возможно, половина уже есть — `useTheme.ts`
красит нативную строку через `@capacitor/status-bar`. Что дописать:

1. `index.html` — во `meta[name=viewport]` добавить `viewport-fit=cover`.
2. В `paintNativeStatusBar` (`src/hooks/useTheme.ts`) рядом с `setBackgroundColor` вызвать
   `StatusBar.setOverlaysWebView({ overlay: true })`, а цвет фона выставить прозрачным
   (`'#00000000'`). Стиль глифов оставить по теме: `Style.Light` для светлой темы.
3. Все верхние отступы уже считаются от `env(safe-area-inset-top)` (`.poster`, `.picker-top`,
   `.screen-title`, `.j-poster`) — новых правок не нужно, но проверьте на устройстве:
   при `overlay: true` инсет становится ненулевым и раскладка сдвинется вниз.
4. Скрим из предыдущего пункта обязателен: без него часы и иконки теряются на светлой карте.
   Сравнение «без скрима / со скримом» — карточка **5a** в макете.
5. Нижний жест-бар: `.tabbar` и `.j-panel` уже добавляют `env(safe-area-inset-bottom)`.

## 5. Наблюдения, требующие вашего решения (карточка 5c)

- **Дубль расстояния в Los-Modus.** `j-dist-badge` показан и в верхней карточке, и в строке этапа
  (`{hasGeo && distText && <span className="j-dist-badge">≈ {distText}</span>}`). Предложение — убрать
  нижний, верхний крупнее и всегда на виду.
- **Высота нижней панели Los-Modus** — около трети экрана (прогресс, этап, подсказка, кнопка Nextbike,
  навигация, чипы этапов). На ходу нужны «сколько осталось» и «дальше»; остальное можно спрятать
  за потягивание вверх.
- **Лист станции стоит вплотную к панели табов** — две светлые плоскости подряд. Либо тень листа
  над табами, либо скрывать табы, пока лист открыт.
- **График недели** показывает минуты только по тапу (`.chart-bar-val { opacity: 0 }`), поэтому на
  статичном экране он без чисел. Предложение — по умолчанию подсвечивать самый высокий столбец:
  `const shownDay = pickedDay ?? chartData.reduce((a, b) => (b.mins > a.mins ? b : a)).day`
  и сравнивать с `shownDay` вместо `pickedDay`.

## Design Tokens

| Токен | Светлая | Тёмная | Назначение |
|---|---|---|---|
| `--paper` | `#f4f1ea` | `#1b1917` | фон экрана |
| `--card` | `#fffdf8` | `#242120` | карточки, листы |
| `--ink` | `#24211c` | `#f4f1ea` | текст |
| `--muted` | `#6b6459` | `#a9a196` | второй уровень, подписи табов |
| `--faint` | **`#7d7368`** | **`#8d857a`** | третий уровень, даты, сноска |
| `--accent` | `#1f7a6f` | `#35a091` | активное, бесплатное, велосипед |
| `--warn` | `#b4552a` | `#d9793f` | **платно**: E-Bike, доплата |
| `--alert` | **`#a8341f`** | **`#e0603f`** | **сбой**: задержка, отмена, ошибка |
| `--map-bg` | `#e7e2d6` | `#2a2724` | подложка карты и корпус картовых экранов |
| `--scrim-top` | `rgba(244,241,234,0.94)` | `rgba(27,25,23,0.92)` | градиент над картой |

Радиусы: `--r-card 14px`, `--r-pill 20px`, `--r-sheet 22px`.
Шрифты: `--font-body 'Public Sans'`, `--font-display 'Newsreader'`, `--font-mono 'JetBrains Mono'`.
Тени: `--shadow-card`, `--shadow-lift`, `--shadow-sheet`, `--shadow-float` — без изменений.

Корпус в макете: 448 × 997 CSS px, радиус углов 44px, строка состояния 38px с отверстием камеры
по центру, жест-бар 134 × 4px внизу. Это Pixel 10 Pro XL; в приложении эти величины приходят из
`env(safe-area-inset-*)`, хардкодить их не нужно.

## Assets

Своих изображений нет. Иконки — `src/icons.tsx` (штриховые SVG, 24 × 24, `stroke: currentColor`),
плюс шесть новых из раздела 3. Карты — OpenFreeMap через MapLibre, стиль в `src/mapStyle.ts`.
Шрифты — Google Fonts (Newsreader, Public Sans, JetBrains Mono).

## Порядок работ

1. Токены и контраст (раздел 1) — самое дешёвое и заметное.
2. Разделение `--warn` / `--alert` (раздел 1) — правка CSS плюс `tagKind` в `ItineraryCard`.
3. Эмодзи (раздел 3) — механически, но затрагивает шесть файлов; `generatePillBadgeCanvas` не забыть.
4. Контролы главной в два ряда (раздел 2).
5. Скрим и edge-to-edge (раздел 4) — проверять на устройстве, не в браузере.
6. Пункты из раздела 5 — после вашего решения.

## Files

- `radl-navi-screens.dc.html` — макет: 8 экранов с правками + карточки 3a–3f и 5a–5c
- `support.js` — рантайм для макета, должен лежать рядом
- `github.md` — привязка к репозиторию, карта «экран → файлы», история синков

Файлы репозитория, которые правятся: `src/index.css`, `src/icons.tsx`, `src/App.tsx`,
`src/i18n.ts`, `src/places.ts`, `src/hooks/useTheme.ts`, `index.html`,
`src/components/{ItineraryCard,JourneyMode,History,BikeMap,FilterModal}.tsx`.
