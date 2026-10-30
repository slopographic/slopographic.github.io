# App macros (shared/macros)

Record a run of an app's own commands, keep it under a name, play it again, and run it on many files as a Slop
Workflows step. One recorder, one store, one replay; the steps are the app's SlopCmd commands with args
(`shared/commands`), the same ones the Slop AI panel calls. There is no second action system.

## Files

| file | what |
|---|---|
| `core.js` | `SlopMacrosCore` (classic, ES side-effect import, CommonJS): the macro shape `{ kind: 'slopmacro', v: 1, id, app, name, steps: [{ cmd, args, title }], created, modified }`, `normalize`, `toText` / `fromText` (`.slopmacro`: one macro, or `{ kind: 'slopmacros', app, macros }`), `opId(app, id)` = `macro:<app>:<id>`, **`replay(steps, { exec, prepare, signal, onStep })`** and **`createRecorder(SlopCmd)`**. |
| `store.js` | `SlopMacroStore`: IndexedDB `slop-macros`, store `macros` (index `app`) through SlopDb; `list(app)`, `get`, `save`, `remove`, `onChange`. Tells the site's other open pages (BroadcastChannel `slop-macros`). Loads `shared/db` itself when the page has not. |
| `macros.js` | `SlopMacros` in an app: `init({ app, label, host })`, `record`, `stop` (asks for a name), `cancel`, `note(cmd, args, title, { merge })`, `play`, `rename`, `remove`, `exportFile`, `importFile`, `addToWorkflow`, `openPanel`, `on`. Commands `macro.record`, `macro.stop`, `macro.cancel`, `macro.panel` ("Macros…"), `macro.play` (arg `name`). With `?macro-host=1` it serves `window.SlopMacroHost`. |
| `panel.js`, `macros.css` | The UI from the shared pieces: the Macros panel (SlopList rows with a menu: Play, Add to a workflow…, Rename…, Export, Delete…; Record / Stop and save / Play; Import…, Export all), a bottom sheet on phones (SlopSheet, ≤ 640 px), not modal on a wide screen so the app can be used while recording; the recording bar (always in sight, Stop and save / Cancel); and the Macros ▾ menu button (SlopMenuButton). SlopUI prompts and confirms. |
| `frame.js` | Headless replay in a hidden copy of an app (below). |

## Recording

`createRecorder` wraps `SlopCmd.exec` and listens to SlopCmd's `run` event. It keeps:
- a command with an `args` schema run through `exec` (the AI panel, a macro command, a test), with its checked args;
- a command with args run from a key or the palette (its defaults);
- what the app reports with `SlopMacros.note(cmd, args, title)`: a menu item or a dialog that does the same as a command.
  `{ merge: true }` replaces the last step when it is the same command (a slider drag is one step).

Only the outermost command counts (a command that calls others inside is one step), Play never records its own steps,
and `cmd.*`, `macro.*`, commands without args (they open dialogs) and commands marked `macro: false` are never kept.

## Headless replay (how a workflow runs a macro)

`shared/ops/macros.js` is the app host adapter (`registry.provide`): each app with macros is in `HOSTS`; its saved macros
become operations of kind `macro` under that app in + Add step (`macroOp`), checked and run like any step. Two ways:

- **A hidden copy of the app** (`url`, PhotoSlop): the commands need the app (document model, filters, layers), so
  `frame.js runInHost` loads the app page itself in a same-origin iframe at `<app>/?macro-host=1`, drawn but out of sight
  (opacity 0, no pointer events, inert, aria-hidden; a hidden iframe would be slowed down by the browser). One iframe per
  app, reused for every file of a run, one file at a time, removed after a minute of rest. The page in host mode keeps
  nothing of its own: PhotoSlop (`photoslop/js/app/macros.js`) replaces autosave, the tabs index, recovery, the Slop Hub
  launch, the view state and the welcome with no-ops, never asks "leave the page?", and its consent loader adds no
  third-party script. `SlopMacroHost.run(file, steps, { format, quality })` opens the file (`readAnyFile`, `openDocument`
  in the one tab), replays with `SlopCmd.exec` after `SlopCmd.prepare()` (the AI commands load on demand), and writes the
  picture (`renderExport`, so a watermark that is on is in it). The parent copies the Blob into its own window.
- **Folded** (`op` + `fold`, SlopIsolate): the app's macro steps only set options. SlopIsolate's one command `co.look`
  takes Remove background's own options (`argsOf(slopisolate.remove-bg)`, mapped with `toLook` / `fromLook`), so the same
  replay gathers the args and `slopisolate.remove-bg` runs headless as it already does. A step that needs the window says
  "it only works in SlopIsolate itself".

## Apps

- **PhotoSlop**: Edit ▸ Macros (Record a Macro, Stop Recording and Save…, Cancel Recording, Macros…), the Macros ▾ button
  in the top bar, Ctrl+K. Recorded: filters from their menus and dialogs (`ps.ai.filter` with the dialog's settings, from
  `ui/filter-dialog.js`), Image Size and Canvas Size (`ps.ai.image-size`, `ps.ai.canvas-size`), Image ▸ Crop to Ratio
  (new: `ps.ai.crop`, 1:1 4:5 3:2 4:3 16:9 9:16 around the centre), rotate and flip (image and layer), crop to selection,
  select all / deselect / inverse / subject, new / duplicate / delete layer, fill with foreground or background, undo, and
  every AI-panel command. Not recorded: brush strokes, hand-drawn selections, moves with the mouse, Export (`macro: false`).
  Workflows step options: save as (same, PNG, JPG, WebP) and quality.
- **SlopIsolate**: Edit ▸ Record a macro / Macros…, Ctrl+K. The model and look you set in the panel are one `co.look` step
  (a drag is one step). Play sets them on the image on screen.
- **Slop Watermark** has no SlopCmd commands yet, so nothing to record; its "Add to a workflow…" already hands its whole
  setup to a Watermark step. Giving it commands with args first (one `wm.set` with `WATERMARK_OPTIONS` as args, folded like
  SlopIsolate) is the way in.

- **SlopCut**: Ctrl+K ▸ Record a macro / Macros…; every AI command (`slopcut/js/ai/`) is recorded. Its hidden copy
  (`slopcut/?macro-host=1`, `slopcut/js/ai/host.js`) opens a video (`open(file, { media, place })`: more media go in the
  bin), replays, and renders with SlopCut's export (`save({ format, width, height, aspect, fps, quality })`); a Workflows
  step makes MP4 or WebM. `runInHost` passes `progress` through, and `host.open` gets the options.

## Adding an app

1. Give the app commands with `args` for what should be repeatable (or reuse its AI commands).
2. Load `shared/db/query.js`, `db.js`, `shared/ui/list.js`, `menubutton.js`, `sheet.js` and `shared/macros/*.js`, and
   `macros.css`, `list.css`; call `SlopMacros.init({ app, label, host })`; note the menu items and dialogs that equal a command.
3. Add it to `HOSTS` in `shared/ops/macros.js`: `url` (a host mode page that keeps nothing) or `op` + `fold`.

## Tests

`tests/node/macros.test.mjs` (format, files, replay, recorder on a fake SlopCmd, store, steps and plan, folding),
`tests/photoslop/macros.test.html` (record menus, a dialog and a command; save, play, panel, rename, export, import, the
Macros ▾ menu; a hidden PhotoSlop makes a 300 × 300 JPG; an error names its step), `tests/slopisolate/macros.test.html`,
`tests/workflows/macros.test.html` (+ Add step lists them and sees a new one at once; a run through a hidden PhotoSlop;
Add to a workflow… with a macro step).
