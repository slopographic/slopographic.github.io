# SlopTour: guided tours for every app

A tour is data. One engine (`window.SlopTour`) draws the spotlight and the step panel for all 28 app tours.
Tours only point, scroll and focus. No step changes app data, and closing a tour leaves the page as it was.

## Files (all at most 300 lines)
- `core.js`: the namespace, `SlopTour.logic` (tour validation, the word keys and `words()`, clamping, the saved progress envelope).
- `spot.js`: the spotlight (`SlopTour.spot`). It dims the page, cuts a hole round the target and draws a floating tip beside it. Every layer has `pointer-events: none`.
- `panel.js`: the step panel (`SlopTour.panel`). Counter, Back, Skip, Next, Restart, a queue of all steps, and the keys.
- `engine.js`: `define`, `load`, `start`, Next, Back, Skip, jump, Restart, close and finish, plus progress storage and events.
- `mount.js`: the one script each app page loads. It adds the Tour button, registers `Start tour: <name>` in the palette, opens the tour for `?tour=1`, and on the homepage (`data-home="1"`) adds a Tours menu. It loads the engine and `tour.css` only when a tour starts.
- `tour.css`: styles, themed through the `--sui-*` tokens. On screens of 640px or less the panel is a bottom sheet.
- `tours/<app>.js`: one tour per app. The file name is the folder name, which is also the app id (for example `slopcut` for Slop Cut, `3d` for Slop 3D).

## Tour data
A tour file is data only. It holds no words: no title, no step text, no English.
```js
SlopTour.define({
  app: 'slopcut',              // lowercase folder id; must match the file name
  ns: 'slopedit',              // only when the app's registry id (its table namespace) differs from the folder
  steps: [
    { id: 'bin', target: '#bin', // id: lowercase, unique in the tour; target: a selector in <app>/index.html
      action: 'scroll',        // optional: 'scroll' (default), 'focus' (also focus it), 'none'
      check: 'visible' },      // optional: 'visible' (default with a target), 'exists', 'none'
  ],
});
```
- 4 to 8 steps per tour. A step whose target is missing or hidden (for example a control hidden at phone width) shows the panel with a hint. Next still works.
- `define()` refuses an invalid tour with a console warning, including a tour or step that carries `title` or `text`. `SlopTour.logic.problems(tour)` lists the problems.

## The words: one key scheme
The words live in the app's own string tables (`<app>/i18n/<code>/*.js`, usually a `tour.js` part), with `ns` = the
tour's `ns`, else its `app` (the registry id: `slopedit` for slopcut, `cutout` for slopisolate, `vector` for slopvector):

| What | Key |
| --- | --- |
| Panel header (tour name) | `<ns>.tour.title` |
| Step title (panel, tip, queue) | `<ns>.tour.<step>_title` |
| Step text | `<ns>.tour.<step>_text` |

`<step>` is the step id with `-` as `_` (`from-order` → `invoices.tour.from_order_title`). English and Swedish hold every
key; other languages fall back to English. `SlopTour.logic.keyOf(tour, 'title')`, `stepKey(tour, step, 'title' | 'text')`
build the keys, and `words(tour)` reads them through `SlopI18n.t` in the current language.

The engine reads the words on every render, never at load time, and re-renders the open step on `SlopI18n.on` (the
panel, the queue, the counter and the tip, without scrolling or moving focus), so an open tour follows a live language
switch. The app's tables are already in: every app page loads `shared/i18n/i18n.js` and its `i18n/index.js` in `<head>`,
and the engine loads only when a tour starts.

The engine's own words are shared keys in `shared/i18n/ui/<code>.js`: `ui.tour.*` (panel, close, all_steps, restart,
skip, finish, counter `{i} of {n}`, offscreen hint, start_cmd `Start tour: {name}`, the homepage list) plus `ui.back`,
`ui.next`; the header buttons use `shell.tour`, `shell.tour_title` (`Start the {app} tour`), `shell.tours`,
`shell.tours_title` (`shared/i18n/strings.js`). No English fallback sits in the code: without SlopI18n a key shows.

## Adding a tour's words
Add `<app>/i18n/en/tour.js` and `<app>/i18n/sv/tour.js` with `<ns>.tour.title` and a `_title` and `_text` per step,
then `node tools/i18n/i18n.mjs index <ns>`.

## Behaviour
- Buttons: Back (disabled on step 1), Skip (moves on without ticking the step), Next (ticks the step; "Finish" on the last step), Restart, and × to close.
- Keys: Left and Right move, Enter goes Next, Escape closes. Keys are ignored while the viewer types in a field, while an app dialog or the palette is open, or while focus is on another app control.
- The queue lists every step; click one to jump ahead or back. A ticked step shows ✓.
- Progress: `localStorage['slop.tour.<app>'] = { v: 1, data: { index, done, status, at } }`. Reopening resumes at the saved step. Finishing and Restart start from step 1. Every storage call is in try/catch, so a blocked store only means no memory.
- Layers ignore the pointer, so the app stays usable while a tour is open.
- Events: `SlopTour.on(fn)` calls `fn(info, closedApp)` on every step change (`info` = `{ app, index, n, status }`) and on close (`info` = null).

## API
`define(tour)`, `load(app)`, `start(app)` (also `resume`), `restart(app)`, `next()`, `back()`, `skip()`, `close()`, `reset(app)` (forget saved progress), `current()`, `status(app)`, `isOpen()`, `on(fn)`.

## Wiring a new app
1. Add `shared/tour/tours/<folder>.js` with 4 to 8 steps, and its words in the app tables (above). Targets must be ids or selectors that exist in the static `<folder>/index.html` (containers that JavaScript fills are fine).
2. Add `<script src="../shared/tour/mount.js" data-app="<folder>"></script>` before `</body>`, and add the app to `TOURS` in `mount.js` with its display name.
3. `node tests/run.mjs tour` must pass.

## Tests
- `tests/node/tour-data.test.mjs`: every tour file is valid (through the engine's validator), has 4 to 8 steps, each app's id matches its file, each target exists in that app's `index.html` (checked in headless Chromium with scripts and styles stripped), and each app page loads `mount.js`.
- `tests/node/tour-words.test.mjs`: no tour file carries words or reads SlopI18n, the validator refuses words, `ns` is the app's registry id, and every key of every tour is in the English and the Swedish tables (and short enough: titles 40, text 160 characters in English).
- `tests/i18n/tour-sv.test.html`: Slop Hex in Swedish shows the Swedish tour and panel, and a live switch to English re-renders the same step in English, and back.
- `tests/shared/tour.test.html`: loads the real PhotoSlop page in an iframe. It checks the Tour button and palette command, that the first target is spotlit, that Next reaches step 2, that the queue jump reaches step 4, the keys, close and resume, and Restart.

## Limits
- Offline single-file builds of an app do not include the tour files. The Tour button only fails quietly there.
- The tour files load on demand from `shared/tour/`. The service worker was not changed. Add these paths to its precache, and bump its version, if offline use of tours matters.
- Slop Upscale, Slop AI Tools and Slop Image to 3D did not load the command palette. `mount.js` loads `commands/commands.js` for them, which registers the tour command without key handling.
