# SlopCmd: shared command palette and customizable shortcuts

## Files (all ≤300 lines)
- `args.js`: argument schemas (validate, clamp, defaults, JSON schema, hints). Loaded on demand by `exec`.
- `commands.js`: the core. It covers key parsing and display (`Mod` = Ctrl or ⌘, chords, ⌘⇧⌥ on Mac), the registry, per-app overrides (`localStorage 'slop.keys.<app>'`), recents/frecency (`'slop.cmd.recent.<app>'`), providers and the single capturing keydown dispatcher. Missing UI parts load on demand.
- `search.js`: fuzzy ranking over title, keywords, group and id. Acronyms count, every word must match, enabled items rank first and recent use boosts. It also builds "Go to <app>" entries from `SLOP_APPS` and the provider sections.
- `palette.js`: the Spotlight palette. It uses the ARIA combobox + listbox pattern with `aria-activedescendant`, traps focus, restores focus on close and is a full-width sheet at ≤640 px. The floating search button is opt-in: `init({ fab: true | 'touch' })`.
- `recorder.js`: shortcut recording (chords; Esc cancels) and `assign`, which asks "Replace?" on a conflict. Also export and import of JSON.
- `keymap.js`: the shortcut editor, a SlopUI dialog with search, click-to-record, + to add, × to remove, reset one or all, conflict warnings and import/export.
- `commands.css`: themed through `--sui-*`, plus a Win98 skin under `[data-theme=paint|classic]`. Checked in SlopLabel's Pro, Light and Classic 98 themes and in Paint Classic.

## API
Load it after `slopui.js`:
`<link rel="stylesheet" href="…/shared/commands/commands.css">`
`<script src="…/shared/commands/commands.js">`
List `search.js`, `palette.js`, `recorder.js` and `keymap.js` too if the app builds an offline single file; otherwise they load lazily.

- `init({ app, target?, fab?, paletteKeys? })`
- `register([{ id, title, group, keys, icon, keywords, when, checked, run(ctx), repeat?, global?, hidden?, args?, tool?, description?, destructive? }])`
- `exec(id, args, ctx)` → `Promise<{ ok, value, args, notes } | { ok: false, error }>`; `provide({ state, checkpoint, prepare })`, `state()`, `checkpoint()`, `prepare()`
- `unregister(id)`, `run(id, ctx)`, `list()`, `get(id)`
- `keyFor(id)`, `keysFor(id)`, `bindings(id)`
- `open(q)`, `close()`, `openKeymap()`, `isOpen`
- `on('change' | 'run' | 'open' | 'close' | 'dismiss', fn)` returns an off function
- `setKeys(id, keys)`, `resetKeys(id?)`, `conflicts(binding, exceptId)`, `allConflicts()`
- `exportKeys()` / `importKeys(obj)`, `recent()`, `frecency(id)`
- `addProvider({ id, title, search(q) → [{ id, title, run }] })`
- `parse`, `canon`, `format`, `eventSteps`, `search(q)`

`run(ctx)` receives `{ source: 'key' | 'palette' | 'api', event }`.

### Arguments and app state (for the Slop AI assistant)
`args.js` (`window.SlopCmdArgs`, also a CommonJS module) describes what a command takes. Every existing command keeps
working unchanged; only a command that sets `args` is called differently.

```js
SlopCmd.register([{ id: 'ps.ai.gaussian-blur', tool: 'gaussian_blur', title: 'Gaussian blur', hidden: true, destructive: false,
  description: 'Blur the active layer, or only the selection.',
  args: [{ name: 'radius', type: 'number', min: 0.1, max: 250, default: 4, step: 0.1, description: 'px' }],
  run: (args, ctx) => blur(args ? args.radius : 4) }]);      // args is null from keys and the palette
SlopCmd.provide({
  state: () => ({ document: …, layers: […], selection: … }),   // small JSON: what the assistant reads with app_state
  checkpoint: () => { const mark = history.now(); return () => history.goTo(mark); },  // "Undo all AI changes"
  prepare: () => import('./ai-commands.js'),                     // optional: load the AI commands when first needed
});
const r = await SlopCmd.exec('ps.ai.gaussian-blur', { radius: '900px' });  // { ok, value, args: { radius: 250 }, notes: […] }
```
- Types: `number` (`min`, `max`, `step`, `integer`), `string` (`maxLength`), `enum` (`values` or `options: [[value, label]]`),
  `boolean`, `color` (hex or a basic name → `#rrggbb`), `json` (an object or list, or its JSON text; `schema` is its JSON
  schema for tool definitions; macros keep it), `array` (`items`: a JSON Schema per item, `maxItems`; JSON text is parsed,
  plain text is one item per line), `object` (`properties`; JSON text is parsed). The command checks what is inside an array or
  object. `required`, `default`, `description` on any. A map `{ radius: {…} }` works too.
- `readOnly: true` (only reads; never asked) and `sends: true` (its value `{ text, media }` carries the app's content to the
  model; asked every time, like look_at_file) are passed on to the tools (shared/ai/cmdtools.js).
- `argform.js` (`SlopCmdForm.wrap(cmd)`): a command with args run from Ctrl+K or a key gets a form from its schema,
  prefilled by `cmd.prefill()`; a recording macro keeps the values chosen. Used by SlopCut and Reel Remix.
- `sources.js` (`window.SlopCmdSources`, loaded on demand): `driveFile(q)`, `siteFile(url)` (same origin only), `picture({ file, url })`
  and `put(blob, name, from)`: where commands with arguments get files from and save them to (Slop Slides and Slop Docs use it).
- `exec(id, args, ctx)` loads `args.js` if needed, checks the arguments (strings coerced, numbers clamped with a note,
  unknown names dropped with a note, defaults filled, a missing required or unreadable value is an error), runs the
  command and awaits it. `run(id, { args })` does the same check synchronously when `args.js` is on the page.
- `tool`: the tool name the model sees (default: the id without its app prefix). `destructive: true|false` overrides the
  word rule (delete, clear, new, merge, crop… ask first). `hidden: true` keeps a command that duplicates a menu item out
  of the palette; the assistant still sees it. `ai: false` keeps a command with args away from the assistant.
- `state()`, `checkpoint()` and `prepare()` call what the app provided (null / a resolved promise when it did not).
  `state()` may give a value or a promise (an app's state can be async, as aitools' is): every caller awaits it
  (shared/ai/cmdtools.js app_state, ai/js/ui/workspace.js); a failure comes back as `{ error }`.
- `aiAdder(prefix, list)` → `add(tool, title, args, run, extra)`, the one helper the apps' `ai-commands.js` use: id
  `<prefix>.ai.<tool-with-dashes>`, hidden, group AI, `destructive: false` unless extra says so, run with the defaults
  when called without arguments; pushed into `list` when given, and returned. Keep the name `add` (tools/ai-coverage.mjs reads `add('tool', …)`).
- `sources()` loads `sources.js` once and resolves `SlopCmdSources` (`driveFile(q)`, `driveAsFile(q)`, `siteFile`, `picture`,
  `put`): the one way a command finds a Slop Drive file by id or name. Tests: `tests/commands/spec-ai.js`.
- Make every command one step in the app's own undo history (PhotoSlop folds several commits into one with `aiOneStep`).
- Return a short sentence (or a promise of one) saying what happened; throw an `Error` with a plain message when it
  cannot run. Both reach the model and the panel's step list.
- Reference: `photoslop/js/app/ai-commands.js` (schemas), `ai-ops.js` (one-step operations, state, checkpoint) and
  `commands.js` (`provide({ prepare })`). Tests: `tests/node/cmd-args.test.mjs`, `tests/photoslop/ai-panel.test.html`.

Built-in commands:
- `cmd.palette`: Mod+K, Shift+Mod+P and `/` (`/` only outside text fields).
- `cmd.keymap`

Dispatch rules:
- Text fields only get bindings that use Mod/Ctrl/Meta.
- Nothing fires while a SlopUI dialog or the palette is open, except `global` commands (the palette toggle).
- When `when()` is false, the key falls through to the next command bound to it, or to the page.
- Auto-repeat only fires commands that set `repeat: true`.
- Punctuation also matches by `e.code`, so `Shift+Mod+]` works on US layouts.

## How to integrate
1. Add the tags.
2. Write `<app>/…/commands.js`, which calls `init({ app: '<SlopHub id>' })` and registers every discrete action. Keep held movement keys in the game's own input code.
3. Delete the old keydown branches.
4. Use `SlopCmd.keyFor(id)` for menu labels and tooltips.
5. Add Help ▸ Search commands… / Keyboard shortcuts…, or a search button.
6. For games, use `SlopCmd.on('open', pause)`.

## Integrated apps (tests green)
- **label**: every tool and menu action (~100), Help entries and a toolbar Search button; it is also in the offline build. 69 tests.
- **shots**: `tests/shots/commands.test.html`.
- **tank**, **lighter**, **unsubscribe** (light touch) and **photoslop/classic** (Win98 skin, Help entries): `tests/commands/apps.test.html`.
- **2100**: `/` stays the search shortcut through `paletteKeys`. Its own 38 tests passed; a palette page test is still to do.

Not integrated (owned by other agents): photoslop/, slopvector/, pdf/, press/, slopcut/, drive/ (drive already codes against it and uses `addProvider`), home/, reel/.

## Tests
- `node tests/run.mjs commands/commands`: 41 tests.
- `commands/apps`: 4 tests.

## Next steps
1. Integrate reel/ and the remaining apps.
2. Re-add a 2100 palette page test.
3. Drive's test `tests/drive/commands.test.html` swaps `window.SlopCmd` for a mock after the real one has already attached its listener, so its "private map" assertion fails. That test should stub before boot, or call `SlopCmd.resetKeys` / unregister.
