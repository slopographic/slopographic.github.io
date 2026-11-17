# Slopculator (calculator/)

A calculator with brackets, percentages, powers, roots, units, currency, dates and times, a paper tape, a searchable
history, and "save to Slop Drive". Browser only, no build, no network calls. Registered in `shared/apps.js` as
`calculator` (tool, business group, status building).

## Files (all ≤300 lines)
- `js/lexer.js`: tokens and `CalcError` (every stage throws it; `code` is syntax, unit, type, math or rate).
- `js/exact.js`: exact arithmetic. Decimal text to a BigInt fraction, conversion with no rounding, and back to text.
  Terminating answers are exact; others are rounded to 12 places and marked ≈. Temperatures go through kelvin.
- `js/units.js`: the one unit table, used by the expression language and by the Convert panel. Unit words (`km`, `lb`,
  `gal`, `C`/`F`/`K`, `s`, `min`, `h`, `days`/`weeks`/`months`/`years`, `KB`/`MiB`), the dimension of each, and the exact
  factor (a decimal such as `0.0254`, or a fraction such as `1/60`). A three-letter ISO currency code is a currency unit. Table words win, so
  `m` is metres.
- `js/dates.js`: calendar arithmetic in UTC (no DST effects). Months clamp to the month's last day.
- `js/parser.js`: text to a syntax tree (Pratt parser). Precedence, lowest first: `in`/`to`, `+ −`, `× ÷`, `of`, `^`
  (right-assoc), unary `−` and `√` (looser than `^`, so `-2^2` is -4). Postfix `%` binds to the number before it.
- `js/evaluate.js`: tree to value. Values: number, quantity (with dimension and unit), date, time of day, percentage.
- `js/format.js`: display text (`2 h 45 min`, `Sat 2026-01-31`, `09:30`, `90.00 EUR`).
- `js/calc.js`: `calc(text, { today, ans, rate })` returns `{ ok, value, text }` or `{ ok:false, error:{ code, message, pos } }`.
- `js/rates.js`: exchange rates (see below). `js/keep.js`: the versioned envelope in localStorage.
- `js/panels.js`: history (searchable) and manual rates. `js/app.js`: the page. `js/commands.js`: SlopCmd.
- `js/calendar.js` (`SlopCalcCalendar`): "Add to Calendar" shows only when the last calculation is a date. It saves an all-day
  event through the shared store (`SlopEvents`, `shared/calendar/store.js`). Numbers and times of day are not added.
- `js/convert.js`: the Convert panel (value, category, from, to, swap). Same table and exact engine as `in`.
- Test: `node tests/run.mjs calculator` covers `tests/calculator/calendar.test.html` (a date result lands on the calendar)
  and `tests/calculator/convert.test.html` (exact conversions, `1 km in m` is 1,000 m, and the Convert panel).

## Syntax, by example
- Precedence: `2 + 3 * 4` is 14; `2 ^ 3 ^ 2` is 512; `-2 ^ 2` is -4; brackets as usual.
- Percentages: `200 + 20%` is 240; `200 - 15%` is 170; `20% of 150` is 30; `50%` shows `50%`.
  Helpers: `tax(200, 8)` is 216; `discount(200, 15)` is 170; `markup(100, 25)` is 125. The rate is a percent: write 8 or 8%.
  A comma separates arguments, so write numbers without thousands separators (`1000`, not `1,000`).
- Roots and powers: `sqrt(16)`, `√9`, `cbrt(27)`, `2 ** 3`. Names: `pi`, `e`, `ans` (last result), `today`.
- Units: `5 km in mi`, `100 C in F`, `2 gal to L`, `12 inches in ft`, `500 ms in s`, `2 GB in MB`. Adding needs one dimension (`5 km + 300 m` is 5.3 km).
  Temperatures only convert: they cannot be added or multiplied.
- Currency: `100 USD in EUR`, `100 USD + 50 EUR`. The rate comes from the manual rates first, then Slop Ledger.
- Dates: `2026-01-31 + 1 month` is 2026-02-28; `2026-03-01 - 2 weeks`; `2026-12-25 - 2026-10-11` is 75 days;
  `… in weeks` or `… in years` converts it (years are 365.2425 days). `today + 90 days`. Whole days, months or years only.
- Times: `09:30 + 2h 45m` is 12:15; `17:00 - 08:15` is 8 h 45 min; `2h 45m in min` is 165. `m` after an hour is minutes,
  so `2h 45m` works. A lone `45m` is metres: write `45 min`. Times wrap past midnight.

## Currency rates
1. A manual rate the person entered (the "Exchange rates" panel). It is stored as `1 FROM = factor TO` and works both ways.
2. Otherwise Slop Ledger's rows, read on demand through `window.SlopData.fx.rateOn` (the stored rate is scaled by
   1,000,000). The page loads the same `shared/data` scripts as Slop Ledger.
3. Otherwise the error says to add a manual rate. The evaluator throws `code: 'rate'` with `from` and `to`, and the page
   fetches that pair and runs the expression again.

## Storage (per viewer, versioned envelope `{ v:1, data }`)
- `slopcalc.history`: up to 200 finished calculations (expression, result, time). Search and click to reuse.
- `slopcalc.rates`: manual rates.
- The paper tape lives in memory for the page visit only (Clear tape empties it; history is kept).

## Save to Slop Drive
Each saved calculation is one Markdown file in the app's Drive folder. Its meta is
`{ type: 'notes', kind: 'calc', title, expression, result, saved }`. Slop Notes ignores records whose kind it does
not handle, so these files show in Slop Drive, not in the Notes tree.

## Commands (SlopCmd)
Calculate, Copy result (Mod+Alt+C), Save to Slop Drive (Mod+Alt+S), Clear, Focus (Mod+Alt+K), insert ans / tax / discount /
markup, Clear the paper tape, Exchange rates.

## Keyboard
Enter calculates. Up and Down bring back earlier lines of the tape. Esc clears the expression.

## Tests
- `node tests/run.mjs calc`: `tests/node/calc-parser.test.mjs` (precedence, percentages, roots, units, currency with a
  supplied rate, dates, time arithmetic, error codes). Loaded through `tests/node/calc-env.mjs`.
- The page was checked in headless Chromium at 390 px (no sideways scroll, no console errors).

## Not done / follow-ups
- Slop Calendar does not exist in this repo, so there is no link from it.
- `service-worker.js` is not updated. Its PRECACHE list is generated by `node tools/pwa-precache.mjs`, and it must be
  regenerated before the page works offline.

## Assistant commands
`js/ai-commands.js` (loaded by `SlopCmd.prepare()` from `commands.js`): `calc.ai.add_calculation` (expression → the result, onto the tape), `clear_tape` (destructive), `save_calculation` (the last one to Slop Drive as Save does), `export_tape` (csv or txt, to, name). `SlopCalcApp.setExpr`, `snapshot` and `restoreTape` serve them. Test: `tests/calculator/ai-commands.test.html`.
