# 🚲 Radl Navi — велик (MyRadl) + MVV

Мюнхенский мультимодальный навигатор: строит маршруты «пешком → велик MyRadl →
общественный транспорт» с живым наличием великов и контролем бесплатных 30 минут.
То, чего нет ни в Google Maps, ни в MVGO.

**Дизайн:** modernist / Swiss-бруталист (из Claude Design `RadlNavi.dc.html`) —
светлый фон `#f3f2f2`, красный акцент `#ec3013`, шрифт Archivo 800, острые углы,
2px-разделители, крупная типографика, SVG-иконки, **немецкий UI**. Токены живут в
`src/index.css`, иконки в `src/icons.tsx`.

**Без бэкенда**: статичная PWA, все API открытые и с CORS `*`.

**Живёт здесь: https://neldosik.github.io/radl-nav/** (GitHub Pages, ветка `gh-pages`).

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173/radl-nav/
npm run deploy     # build + push dist/ в gh-pages → обновляет прод за ~30 сек
```

## Данные

| Источник | Что даёт | Примечания |
|---|---|---|
| `api.transitous.org/api/v5/plan` | интермодальный роутинг (MOTIS, вся Германия) | без ключа; fair-use, некоммерческое; нужен вменяемый User-Agent при серверном использовании |
| `api.transitous.org/api/v1/geocode` | автокомплит адресов/остановок | `place=48.137,11.575&placeBias=3` — иначе результаты не мюнхенские |
| `gbfs.nextbike.net/.../nextbike_ml/de/*` | станции MyRadl + живое наличие (ttl 60 с) | e-bike отличаем по `propulsion_type != human` |
| Google Maps deep-links | turn-by-turn по каждому этапу | `/maps/dir/?api=1&travelmode=bicycling\|walking\|transit` |

### Критичные параметры plan

- `preTransitRentalFormFactors=BICYCLE` (+ `post`, `direct`) — **обязательно**, иначе MOTIS суёт самокаты Dott в каждый маршрут;
- `maxPre/PostTransitTime=1800` — вело-подвоз до 30 мин (дефолт 15);
- `maxDirectTime=2700` — иначе прямые вело-варианты пропадают;
- полилинии: Google polyline, **precision 6** (API v2+).

## Правила MyRadl (проверено 21.07.2026, myradl.de)

- 30 бесплатных минут на классический велик — **pro Ausleihe** (за каждую аренду), только с абонементом ÖPNV (Deutschlandticket ок); дальше 1 €/30 мин, кап 9 €/сутки;
- e-bike платный всегда (1,50 €/30 мин с абонементом);
- кулдауна между арендами в AGB (nextbike 04/2024) и FAQ **нет** → чейнинг великов = легальные «бесплатные марафоны»;
- возврат только на официальных станциях, вне станции штраф 20 €;
- резервирование в приложении: max 15 мин; до 4 великов на аккаунт.

## Roadmap

- [x] деплой (GitHub Pages) + установка на телефон (PWA);
- [x] режим «Поехали»: пошаговое ведение, автопереход этапов по геолокации (<70 м), wake lock;
- [x] фильтр типа велика (обычные/электро): `*RentalPropulsionTypes=HUMAN` + клиентская страховка по `rental.propulsionType`;
- [x] deep-link на станцию в приложении MyRadl (`rental.rentalUriWeb`);
- [x] GPS «Моя геолокация» с reverse-geocode (реальный адрес) прямо в поле;
- [x] сохранённые места 🏠 Дом / 💼 Работа / 🎓 Школа + свои (localStorage `radl.saved`);
- [ ] «веломарафон»: автосплит вело-этапа >28 мин через промежуточную станцию;
- [ ] выбор времени отправления/прибытия (`time`, `arriveBy`);
- [ ] таймер «пора сдавать велик» (пуш/Telegram через бота);
- [ ] резервирование из приложения (исследовать nextbike booking API);
- [ ] велик между двумя транспортными этапами (склейка двух plan-запросов через via-точку);
- [ ] пресеты «дом/работа/универ».
