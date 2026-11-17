# SlopBuffer: the shared copy and drop buffer

One buffer for the apps. It holds the last copied item in several formats, keeps it across reloads, tells other tabs
about changes, and writes it to the system clipboard so it pastes outside the site. Classic scripts, no build step.
`window.SlopBuffer` is the only global. No app imports another app's code: each app has one small converter file
that reads and writes `SlopBuffer`.

## Files

| File | What it does |
|---|---|
| `formats.js` | Record shape, kinds, `record()` (check and complete), `choose()` (format choice), CSV helpers. Pure. |
| `store.js` | The latest item in IndexedDB: database `slop-buffer`, store `latest`, key `current`. |
| `clipboard.js` | Rasterises SVG (`rasterize`, `toPng`), writes the system clipboard (`writeSystem`), `isSystemCopyOf`. |
| `buffer.js` | The API: `put`, `get`, `ready`, `onChange`, `clear`, `bindDrop`, `makeDraggable`, BroadcastChannel. |
| `tray.js` | `SlopBuffer.tray(host)`: a small chip that shows the buffer and can be dragged onto a canvas. |

Load order (every app does this): `formats.js`, `store.js`, `clipboard.js`, `buffer.js`, `tray.js`. Then the app's converter.

## The record

```
{ kind, formats, source, t }
  kind     'vector' | 'image' | 'text' | 'table' | 'clip'   (omit it and the kind is inferred from the formats)
  formats  'image/png'      Blob
           'image/svg+xml'  string
           'text/html'      string
           'text/plain'     string
           'text/csv'       string
  source   the app id: 'vector', 'photoslop', 'slides', 'docs', 'tables'
  t        Date.now() at the copy
```

`put()` rejects a record with an unknown format or kind, a PNG that is not a Blob, or no formats at all.

## API

- `SlopBuffer.put(input, { system })` stores an item. It updates memory at once, writes IndexedDB, tells other tabs
  after the write, and writes the system clipboard (unless `system: false`). Resolves the record.
- `SlopBuffer.get()` returns the current record (synchronous, from memory) or `null`.
- `SlopBuffer.ready` resolves when the stored item has been read. Wait for it before the first paste after a reload.
- `SlopBuffer.onChange(fn)` calls `fn(record)` on every change, local or from another tab (`null` after a clear).
- `SlopBuffer.clear()` empties it everywhere.
- `SlopBuffer.choose(record, accepts)` returns the first format in `accepts` the record holds, as
  `{ type, data, simplified, note }`, or `null`.
- `SlopBuffer.bindDrop(el, fn)` lets `el` take a dropped buffer. `fn(record, { x, y })` runs on drop.
- `SlopBuffer.makeDraggable(el)` makes `el` start a buffer drag. `SlopBuffer.tray(host)` does both for the chip.
- `SlopBuffer.rasterize(svgText, w, h)` resolves a canvas. `SlopBuffer.toPng(record)` resolves a PNG Blob or `null`.
- `SlopBuffer.isSystemCopyOf(file)` is true when a paste-event file is the PNG this buffer put on the clipboard.

## Format choice and simplification

`choose(record, accepts)` takes the first format of `accepts` that the record holds, in the target's order. The
record's richest format is ranked first: SVG, PNG, HTML, CSV, plain text. `simplified` is true when the target gets a
poorer format than the copy holds (plain text from a copy that also has HTML, or a PNG from a vector copy). Each app
also says so itself when it converts (for example "Vector converted to a raster image" in PhotoSlop). The UI shows the
note as a toast.

## Clipboard

The system clipboard gets `image/png` (a vector is rasterised for it, because the clipboard has no SVG type),
`text/html`, and `text/plain` (a table is sent as TSV). The write starts at once, so the user gesture still counts.
If the browser refuses, `put` still stores the item and `writeSystem` resolves `false`.

## Paste and drop, per app

- Paste uses the buffer only when it is newer than the app's own last copy (`t` in the record against the app's
  clipboard time). Paste events that carry the buffer's own PNG (`isSystemCopyOf`) use the buffer's item instead, so a
  vector comes in as a vector and not as the flattened picture.
- Drop: the app's drop target calls `bindDrop`. A drag from the tray carries only a marker (`application/x-slop-buffer`),
  so the drop reads the record from memory.

## Converters (one per app)

| App | File | Copy | Paste and drop |
|---|---|---|---|
| SlopVector | `slopvector/js/io/buffer.js` | Edit ▸ Copy as buffer (selection as SVG); File ▸ Export ▸ Export to buffer (artboard as SVG) | An SVG comes in as one group (`importSVGText` with `group: true`); a PNG as an image object |
| PhotoSlop | `photoslop/js/io/buffer.js` | Copy to Buffer, Copy Merged to Buffer (PNG) | A PNG as a new layer; an SVG is rasterised at its own size, with a note |
| Slop Slides | `slides/js/ui/buffer.js` | Copy to buffer: text box as HTML and text; shapes as one transparent PNG | A PNG or SVG as a picture (an SVG is drawn to a PNG, with a note); HTML or text as a text box |
| Slop Docs | `docs/js/ui/buffer.js` | Copy to buffer: selected text as HTML (bold, italic) and plain text | HTML as text with bold and italic kept; plain text as typed text |
| Slop Tables | `tables/js/ui/buffer.js` | (none; Tables takes CSV) | A CSV as a region from the selected cell; a drop on the grid does the same |

## Tests

- `tests/node/buffer-core.test.mjs`: record checks, format choice and simplification, CSV helpers, storing and reading
  back (fake IndexedDB), other tabs (fake BroadcastChannel), clipboard writes, drop binding. Run `node tests/run.mjs buffer`.
- `tests/buffer/vector-photoslop.test.html`: copies a rectangle in SlopVector, pastes it into PhotoSlop as a layer
  (Paste command), checks the layer's size and colour, and drops the buffer on PhotoSlop.

## Limits and things to know

- Chrome and other browsers accept only `image/png`, `text/html` and `text/plain` on the system clipboard. SVG lives only
  in the buffer, between apps on this site.
- The PNG-match test (`isSystemCopyOf`) compares size and MIME type. A browser that re-encodes the clipboard image makes
  it fail, and the paste then uses the picture, which still works.
- Slides shapes are copied as pictures, not as editable shapes. Docs keeps bold and italic only.
- Tables drops at the selected cell, not at the pointer.
- Only the tray chip, the drop targets and the paste paths are wired. Nothing else in the apps changed.
- `service-worker.js` precaches a fixed list of `shared/` files. The new `shared/buffer/*` files are not in that list, so
  the offline cache does not hold them yet. Add them there (this change did not touch that file).
- `shared/apps.js` was not changed.
