# shared/doctabs: the document tab strip

One tab strip for every document app: open documents as tabs, a + for a blank one, close with an unsaved-changes check,
drag to reorder, middle-click to close, Ctrl+Tab / Ctrl+Shift+Tab to switch, Ctrl+W to close, Ctrl+T for a blank document,
an overflow menu when the strip is full. The open tabs and their content survive a reload (per app, in this browser), and
any tab can be saved to or opened from Slop Drive. Classic scripts, no network, no build step.

## Files

- `tabs.js`: `SlopDocTabs.mount(hostEl, adapter, opts)`. The strip, the keys, the overflow menu.
- `drive.js`: `SlopDocTabs.drive`. Save to Slop Drive and Open from Slop Drive (through `window.SlopHub`).
- `session.js`: `SlopDocTabs.session(appId, api, opts)`. Remembers the tabs across reloads.
- `doctabs.css`: the strip's look. Colours are `--sl-*` tokens with fallbacks (`--sl-surface`, `--sl-text`, `--sl-accent`, `--sl-border`, `--sl-shadow`).

Load order in the app, before the app's own scripts: `tabs.js`, `drive.js`, `session.js`, and `doctabs.css` in the head.
`SlopUI` (shared/slopui.js) is used for the confirm dialog and toasts when it is on the page; otherwise `window.confirm`.

## The adapter

Each document is a plain object owned by the app. The strip keeps it in its tab and never reads inside it.

```js
const adapter = {
  newDoc(),                  // -> a new blank doc (Ctrl+T, the + button, and when the last tab closes)
  serialize(doc),            // -> JSON-safe object: everything needed to rebuild the doc (see below)
  restore(state),            // state (the serialize output) -> doc. Throw if the state is bad.
  title(doc),               // -> the tab title and the file name stem
  dirty(doc),                // -> true when the doc has changes not saved to a file (asks before closing)
  activate(doc),             // the doc is now the one on screen: attach its view, canvas, editor
  deactivate(doc),           // the doc is leaving the screen: detach the view (its data stays in the doc)
  saved(doc),                // optional: a save happened; clear the doc's dirty flag
  drive: {                   // needed for Save to / Open from Slop Drive
    ext: '.hex',             // the file extension (with the dot)
    mime: 'application/x-slop-hex',
    toBlob(doc),             // optional: -> Blob (or Promise) of the file. Default: JSON of serialize(doc)
    fromBlob(blob, name),    // optional: -> doc (or Promise). Default: restore(JSON.parse(text))
  },
};
```

`serialize` must hold everything the doc needs. Only what `serialize` returns comes back after a reload, so it must include
the document's data and its own settings, but not the view (zoom, scroll, selection) unless the app wants that back too.
Values must be structured-cloneable (plain objects, arrays, strings, numbers, booleans, null). It is written to IndexedDB,
so large pixels or bytes should be a `Blob` (IndexedDB stores it), not base64 in a string. Do not store functions, DOM
nodes or canvases; encode canvases as PNG Blobs and decode them in `restore`.

## The API that mount returns

- `openDoc(doc, { id, driveId, origName, name, activate = true, append = false })`: open a doc as a new tab after the active one.
  `origName` is the file's original name (for example `invoice-2026.pdf`): set it when a file is opened or imported, never by a save.
  A rename sets the display name (`name`) and, when linked, the Drive file's name; `origName` is never changed.
- `newTab()`, `activate(doc)`, `close(doc = current)` (async, resolves true when closed; a dirty tab asks first).
- `current()`, `tabs()` (`[{ id, doc, title, dirty, active, driveId }]`), `tabOf(doc)`, `driveIdOf(doc)`.
- `rename(doc, name)`: renames the tab (trimmed, 120 characters max; empty is refused). No name = edit in place. `nameOf(doc)`, `originalNameOf(doc)`.
- `changed(doc)`: call after every edit or rename. It redraws the title and the dirty dot and tells the session to save.
- `markSaved(doc)`, `setDriveId(doc, id)`, `on(fn)` (events: `open`, `close`, `activate`, `reorder`, `content`, `drive`),
  `overflowVisible()`, `destroy()`.
- `saveToDrive(doc = current)`: the Drive save (see below). Open from Slop Drive is the app's intake (`SlopIntake.fromDrive`, shared/intake), whose reader calls `openDoc(doc, { driveId, origName })`.

## Steps to add it to an app (second pass)

1. Markup: an empty host element above the canvas or editor, e.g. `<div id="tabs" class="doctabs-host"></div>`, and the
   two CSS and three script tags above.
2. Write the adapter (above). `serialize` and `restore` must round-trip the document exactly.
3. Mount once, after the app's own code is ready:

   ```js
   const tabs = SlopDocTabs.mount($('tabs'), adapter, { appId: 'hex' });
   const session = SlopDocTabs.session('hex', tabs, { notice: (msg) => SlopUI.toast(msg, 4200) });
   session.restore();          // reopens the stored tabs; with none stored it opens one blank doc
   ```

   Do not open a blank doc yourself before `restore()`: it opens one when nothing is stored.
4. Edits: call `tabs.changed(doc)` after each change to a document (and on rename). That is what saves it on this device.
5. Opening a file from the computer: `tabs.openDoc(doc)`. Opening from Drive: the app's intake reader (`SlopIntake.fromDrive`) calls `tabs.openDoc(doc, { driveId: rec.id, origName: rec.name })`.
6. Save: File > Save (Ctrl+S) calls `await tabs.saveToDrive()` and then the app's own file save. The first save asks for a
   folder; later saves write the same Drive file (in place, no copy). A new file in Drive is `tabs.saveToDrive(doc)`.
7. Remove the app's own tab code, its own autosave and its own tab restore, so there is one source of truth.
8. The offline single-file edition: keep the strip but turn Drive off (for example, `window.SlopHub` absent). The strip
   and the session already work without it.

## Storage

- localStorage `slop.doctabs.<appId>.v1` = `{ v: 1, data: { tabs: [{ id, title }], active } }`. Only ids, titles and the active id.
- IndexedDB `slop-doctabs`, store `docs`: key = tab id, value = `serialize(doc)`; key `<tab id>:drive` = `{ id }` for a tab
  linked to a Drive file. A closed tab's keys are deleted.
- Every storage access is wrapped and never throws. With storage blocked, the strip still works; saving is off.
- A tab whose content is missing (cleared site data, another browser) comes back as a blank doc, with a notice.
- Writes are debounced (about 0.8 s after the last change, and on pagehide). `session.flush()` writes now.

## Rename

- In place: double-click a tab, or F2 on the active tab. Enter or blur saves, Escape cancels. Empty names are refused (old name kept).
- `SlopDocTabs.rename(tabId, name)` renames from code (`tabId` null = the active tab; no name = edit in place). Each app's File menu calls it with null.
- A Drive-linked tab renames its Drive file through `SlopHub.update(id, { name })` (extension kept). If that fails, the tab keeps the new name and a toast says the Drive copy still has the old name.
- The original name is shown in the tab tooltip (`Original name: ...`). The session stores `name` and `orig` per tab, so both survive a reload.
