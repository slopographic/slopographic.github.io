# shared/drop: drop feedback (window.SlopDrop)

One module that gives every app's drop zone the same feedback: the outline and "Drop to add N files" label while a file
drag is over the window, a refusal that says why (`notes.txt is not a picture`), a progress row per file (name, size, a bar
while reading, then Ready or the error), a Choose files button (keyboard too), a toast with the result, and the new item
scrolled into view. Classic scripts, no network, no storage. The app keeps its own file reading: the module only routes the
files and reports progress.

## Files (load in this order, before the app's own scripts)

- `shared/intake/rules.js` (moved there; also `SlopDrop.rules`), and the rest of `shared/intake` before panel.js: every
  file a zone takes goes through `SlopIntake.take` (shared/intake/HANDOFF.md). `rules`: Pure: `check(file, rules)` (accept or refuse, with the reason), `typeOk`, `maybeOk` (drag
  time), `acceptAttr(rules)`, `describe(summary)` (the toast words), `dragLabel(types, rules)`, `size(bytes)`, `ext(name)`.
- `panel.js`: `SlopDrop.panel`. The DOM: the zone (message, Choose files, progress list, status line), the outlines
  (`showHints`, `placeHints`, `hideHints`), the toast (one at a time, 6 s, click to dismiss). Its CSS is injected once.
- `drop.js`: `SlopDrop.attach(zone, options)`. Routes the files and runs the batch.
- `folders.js` (optional, after drop.js): `SlopDrop.folders.read(dataTransfer)` → Promise of Files, whole folders walked
  (webkitGetAsEntry, every readEntries batch, sub-folders). A file from a folder gets `slopPath` (and `webkitRelativePath`
  when empty) = its path from the dropped folder, `Trip/Day 1/a.jpg`, as a folder input gives it. Use it as the `files`
  hook: `files: (dt) => SlopDrop.folders.read(dt)`. `hasFolder(dt)` says whether a drop holds a folder. Tested in
  `tests/node/drop-folders.test.mjs`. (Gallery and Drive still have their own walkers, which also keep their own shapes.)

## Use (one call)

```js
const drop = SlopDrop.attach($('my-zone'), {
  accept: { types: ['image/*', 'video/*'], exts: ['.heic'], noun: 'a picture or video' },
  targets: [$('my-stage')],                 // where drops are taken (default: the zone); outlined during a file drag
  process: async (file, progress, ctx) => { // the app's own reader, one accepted file at a time
    progress(0.5);                          // optional: 0..1 for the bar (without it the bar shows motion)
    const id = await myAddFile(file);       // resolve with a value (an item id), or throw Error(reason)
    return id;
  },
  begin: (files) => {},                     // optional, before the first file
  done: (summary) => {},                    // optional: { added: [{ name, value }], skipped: [{ name, reason }] }
  reveal: (summary) => document.querySelector('#list li:last-child'), // optional: scrolled into view and flashed
});
```

Options: `accept` (rules: `types` are MIME patterns `image/*` or exact; `exts` apply only when the browser gives no type;
`noun` makes the refusal read "x is not <noun>"; `maxBytes`; `any: true` takes every type; `allowEmpty: true` takes
zero-byte files). `input`: an existing `<input type=file>` to use for Choose files (its change event runs the same batch).
`limit`: most files taken in one drop (the rest refused with a reason). `files(dataTransfer)`: the app reads the drop itself
(folders); it is called inside the drop event, so entries can be read there, and may return a Promise. `compact`: one row
for a strip. `window: false`: leave the rest of the page alone (only the targets take drops, marked `.sd-over`). `overlay:
false`: no outlines or label. `toast: false`. `label`, `hint`, `chooseLabel`, `multiple`.

Words: `label`, `hint`, `chooseLabel`, `preview.steps[i]`, `preview.picture.alt` and `sample.label` take an i18n key
(`'diff.drop.label'`), a function, or plain text (`SlopI18n.label`). A key is translated when drawn and again on every
language change (the zone listens to `slopi18n`; `destroy()` stops it), so an app passes keys, not `t(key)`, and never
marks the zone's nodes itself (the per-app `markDrop` helpers are gone). `SlopDrop.panel.preview(o)` drawn on its own
(an app's intro) follows a change too.

`preview: { picture, steps }`: an empty page explains itself. Above the prompt the zone shows what the app makes
(`picture`: `{ src, alt }`, usually `assets/shots/<app>.jpg`, a screenshot of a finished result; `{ flow: { from, to } }`
for a converter, drawn by SlopFlow; or an element) and how (`steps`: three short lines). Not drawn in a `compact` strip.
`sample: { label?, files }`: a "Try it with a sample" button. `files()` returns the sample files (or a Promise of them),
which go through the same batch as a drop, so the sample shows exactly what a real file does. `shared/samples/samples.js`
(`SlopSamples`) makes them: `photos(n)` paints scenes as JPEGs, `file(name, text, type)` makes a text file, and
`asset(path)` loads a real file kept in `assets/samples/` (a PDF, a voice clip).

`process` receives `ctx = { at: { x, y } | null, index }`: the client point of the drop (null from Choose files) and the
file's place among the accepted ones (for placing files one after another at the drop point).

Returns `{ choose(), run(files), destroy() }`. `run` takes a file list (or a Promise of one) and queues a batch.

## Drop events between apps

- The module ignores drags without files, so item drags (a bin clip, a tree row) are untouched.
- A target that takes files itself sets `e.sdHandled = true` on the drop event. An outer target (the app area) then skips
  the drop (no second batch), and SlopDrop does not toast "Drop files on the highlighted area". Slop Cut's timeline uses this.
- A file drop outside every target (with `window` on) gets the toast "Drop files on the highlighted area".

## Where it is used

Each row is one `attach` call (plus the three script tags in the page):

| App | Where | What the file goes to |
|---|---|---|
| Reel Remix (`remix/js/ui.js` wireDrop) | bin and stage | `RM.addFiles` per file; Choose files is `#rm-file` |
| Slop Cut (`slopcut/js/ui/app.js` wireDrop) | the app (`#app`); a strip at the top of the monitor | `A.importFiles` per file (a timeline lane takes the drop itself, sets `sdHandled`, and SlopDrop skips it) |
| PhotoSlop (`photoslop/js/app/tabs.js` bindFileDrop) | the document area (tabs and viewport); the strip only shows progress | open as tabs, or place as layers: the zone the drop itself lands on (`SlopDropChoice.zones`, `files(dt, e)`) |
| Slop Vector (`slopvector/js/io/files.js` bindDrop) | page; a strip over the stage | `placeFiles` at the drop point |
| Slop Resize (`resize/js/app/main.js` wireDrop) | a zone above the queue | `NS.queue.add` (an unreadable file is an error row) |
| Slop Upscale (`upscale/js/app/main.js` wire) | a zone above the stage, `limit: 1` | `open(file)` (returns true or false now) |
| Slop Isolate (`slopisolate/js/io/files.js` F.init) | a strip above the stage | `CO.process.add`, waits for the cut-out; videos `CO.video.addItem` |
| Slop Gallery (`gallery/js/ui/main.js` bindDrop) | a strip above the grid | `files` hook = `G.source.fromDrop` (folders); `importItems` per file |
| Slop Label (`label/js/ui/boot.js`) | page; a strip over the stage | `openFiles` per file; a picture on the stage lands at the drop point |
| Slop Photo Sorter (`sorter/js/app.js` wire) | the drop zone; `input` is `#soPick` | `files` hook = `SlopDrop.folders.read` (folders keep their path); `add([file])` per file |
| Slop Music (`music/js/ui/library.js`) | a zone above the library | `M.lib.addFiles` per file |
| Slop Convert (`convert/js/ui/tool.js`, every converter page) | the drop zone; `input` is the page's own picker | `addFiles([file])` per file |
| Slop OCR (`ocr/js/app.js` wire) | the drop zone; `input` is the page's own picker | `addFiles([file])` per file |
| Slop Drive (`drive/js/ui/dnd.js` wireDropUpload) | a strip above the pane; targets the main area and the tree | `files` hook (readDrop; a lone `.slop` asks about the backup); `DR.importFiles` per file into the folder the drop lands on |
| Slop PDF (`pdf/js/ui/drop.js` S.setupDrop) | the empty page's zone; targets the stage and the tab strip | a tab per file on the strip; on the document `SlopDropChoice.ask` (Add to current, one undo step, or Create new); SVG offered Convert |
| Slop Press (`press/js/ui/main.js` dropSetup) | a compact zone over the foot of the stage; target the stage | `PR.place.files([file], { frame })` per file; the frame is the image under the drop point |
| Slop Contacts (`contacts/js/app/drop-import.js`) | a zone at the head of the contact list; target the column | vCard and CSV files gathered in `process`, then `importFlow.run` once in `done` (one preview) |
| Slop EML (`eml/js/main.js`) | the strip under the header; targets the strip and the message area | `EmlApp.openFile` per file; a file already open is refused with its reason |
| Slop Hex (`hex/js/main.js`) | the strip under the tabs; targets the tabs, the strip and the main area; `limit: 1` | `openBlob` per file; a file already open is refused with its reason |
| Slop Calendar import (`calendar/js/ui/ics-ui.js` pick) | a dialog with a zone | the file goes to the preview as before (no picker when SlopDrop is there) |
| Slop Contacts import (`contacts/js/app/io-dialogs.js` importPick) | a zone in the import dialog | `importFiles([file])` per file |
| Config import (`shared/config/dialog.js` importZone) | a zone in the import dialog (`window: false`) | `C.importFile`; the page-wide drop of a `.slop.json` is unchanged |

Slop Code takes no files from the computer (its drop only moves tree items), so it has no zone.

Pages that open the Config import dialog load the three scripts (13 pages: effects, tables, slopvector, label, slides, 3d,
slopisolate, photoslop, docs, calendar, slopcut, todo, remix). Without them the dialog has no zone and works as before.

## Add to current or Create new (window.SlopDropChoice, shared/drop/choice.js)

Loads after `drop.js`. Two parts:

- `SlopDropChoice.ask({ files, hasDocument, labels })` resolves `'current' | 'new' | null`. No document open: `'new'` at
  once. Otherwise a dialog (Add to current, Create new, Cancel; Escape and a backdrop click cancel; Tab stays inside).
  `labels`: `{ title, message, current, new, cancel }`.
- `SlopDropChoice.zones(host, { labels, accept })` is the drop-zone helper: while a file drag is over `host`, two zones
  show over it. `at(e)` gives the zone the event is over (`'new' | 'current' | null`). Read it in the drop event (the
  `files(dt, e)` hook); it looks at that event's target, so a drop never inherits an earlier hover. Returns
  `{ at, hide, destroy }`. `labels`: `{ new, current, newHint, currentHint }` (a hint may be a function).

PhotoSlop uses `zones` (its Place as layers and Open as new tabs zones). Slop PDF uses `ask` (a drop on the open
document: Add to current or Create new, `pdf/js/ui/drop.js`); with no document open it is not shown.

## Missing elements (why a call can fail)

`attach(zone, o)` returns `null` when `zone` is missing (nothing is attached, no error). A `targets` entry that is missing
(`$('some-id')` returns null) is skipped; with no target left, the zone itself takes the drops, so the zone always works.
The first version of this module threw `Cannot read properties of null (reading 'addEventListener')` when a target was
null. The cause was in Slop Resize: `resize/js/app/main.js` passed `targets: [$('rs-left')]`, but the column was a class
(`class="rs-left"`), not an id. The column now has `id="rs-left"`. Drive, Upscale and the config dialog were checked: their
zones exist (or are created) before attach, and attach runs after DOMContentLoaded, so they were not the cause.

## Tests

- `tests/drop/zones.test.html` (every migrated app's zone: one drop opens once, a file dropped on the bare page is not taken,
  the zone is not over a bar; EML and Hex refuse a file that is already open).
- `node tests/run.mjs drop`: `tests/node/drop.test.mjs` (a refused file and a limit through a drop, a reader error as a row,
  `attach` with a missing zone (null, no throw) and with a missing target (skipped; the zone takes drops when none is left),
  destroy, the drag label for `any: true`), `tests/node/drop-rules.test.mjs` (accept and refuse rules, drag-time labels, toast words, sizes)
  and the browser pages `tests/shared/drop.test.html` (zone, refusal toast, limit, progress, files hook, window off, `.sd-over`)
  `tests/drop/drop-apps.test.html` (real apps in iframes, simulated DataTransfer drops: a picture on Drive's pane is added
  to the folder with a highlight, a progress row and the toast; on Remix's stage it is added to the bin; on Upscale's stage it
  is opened (Run enabled) and a second file is refused; on Resize's column it is queued),
  and `tests/remix/remix-drop.test.html` (a picture dropped on the stage shows a progress row, then the new clip in the bin;
  a refused file is named in the toast; a drop outside the bin and stage says where to drop).

## Fixes in this round

- Upscale `open()` called `updateButtons()` after `return true`, so Run stayed disabled after a picture was opened (by drop
  or by Open). Moved before the return.
- `R.maybeOk` ignored `rules.any`, so Drive's drag label said "(N will be refused)" for every type it takes. Fixed.
- Resize's column id (above).

## Limits

- An app whose reader reports its own errors with a toast and does not throw shows the row as Ready. Upscale now throws
  (its `open` returns false), Hex's `openBlob` throws, PhotoSlop's `handleFiles` returns its failures; Vector, Label and Slop Cut do not, so a failed file there shows Ready.
- `service-worker.js` precaches the app files by list; the new `shared/drop/*.js` files are not in that list (the list was
  not edited here). Offline, these scripts are missing until the list is updated.
- Progress is per file while the app's reader reports it (`progress` in `process`). Isolate reports the cut-out's progress;
  the others show motion.

## On the intake pipeline

SlopDrop is the zone UI and the drop, Choose files and sample source of the one intake (shared/intake). `attach(zone, {
intake: id, … })` makes the zone the UI of a spec the app registered; without `intake` it registers a spec from the
options, so the callers below work unchanged. A paste of a file the rules accept goes through the same pipeline. See
`shared/intake/HANDOFF.md`. Set `paste: false` in the options to turn that off for an app; `paste: { hasOpen, openName, onAdd }`
to ask Add or New when something is open.
