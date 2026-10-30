# Slop Hex: handoff

Slop Hex views and edits any file as bytes. It is registered in `shared/apps.js` as `hex` ("Slop Hex", folder `hex/`, status `building`, group `business`, accepts `*`). Nothing is uploaded: no server, no network request, no CDN. Files come from this computer (picker or drop) or from Slop Drive, and are saved back to Slop Drive or downloaded.

## What works
- **Open:** Open (file picker), drag and drop anywhere on the page, Open from Drive (`SlopHub.pickFromDrive`), or `?drive=<id>` (`SlopHub.consumeLaunch`, the same way Paste and Code launch). Opening a file with unsaved edits asks first.
- **Views:** offset column, 16 hex bytes per row, ASCII column (`.` for non-printable bytes). Rows are drawn only for what is visible.
- **Select:** click a byte, drag across bytes, Shift+click or Shift+arrows to extend, click an offset to select its row. Arrows, PageUp and PageDown, Home and End, Ctrl+Home and Ctrl+End.
- **Edit:** type hex digits on a selected byte. The first digit sets the high nibble, the second the low nibble and moves on. Ctrl+C copies the selection as hex text (up to 1 MB).
- **Undo and redo:** Ctrl+Z, Ctrl+Y (Ctrl+Shift+Z also redoes). One byte edit, including its two digits, is one undo step.
- **Go to offset:** decimal or `0x` hex, in the Go bar. Out-of-range offsets are refused with the valid range.
- **Find:** hex bytes (`4D 5A`, spaces optional, whole bytes only) or UTF-8 text. Next and Prev, with F3 and Shift+F3. Search wraps at the ends and reads the current bytes, edits included.
- **Info strip:** size, type from magic bytes (PNG, JPEG, GIF, PDF, ZIP, ELF, MZ, WebP, WAV, MP4, SQLite and others, else text or binary), SHA-256 via `crypto.subtle` of the current content. After an edit the hash is marked as before the edit, and Recalculate computes it again.
- **Save:** Save version writes a new Drive file beside the original, named `name (v2).ext`, with `meta.versionOf` and `meta.version`. The original is never overwritten. Save as new picks a Drive folder. Download saves a copy to this computer and does not clear the unsaved mark.
- **Large files:** pages of 64 KB are read from the file on demand, and at most 64 are kept. Edits are an overlay, and saving builds a new Blob from the original slices and the changed runs, so the file is not copied whole to save it.
- **Commands (SlopCmd):** Open file, Open from Slop Drive, Save version, Save as new file, Download, Undo, Redo, Copy selection as hex, Go to offset, Find, Find next, Find previous, Recalculate SHA-256.
- **Menus:** the Menu button (files and editing) and the right-click menu on the bytes (editing).
- **Phone (390 px):** the header and bars stack. The byte grid scrolls sideways, and the page itself does not scroll.

## Where the data lives
- A file opened from Drive is the Drive record's blob. The page holds only the open document, in memory, until it is saved.
- Saved versions are Drive records with `from: 'hex'`, in the app folder "Slop Hex" (or the folder of the file they came from).
- Nothing is autosaved. Unsaved edits are lost on reload. SlopGuard asks before the page is left.

## Files
- `index.html`: the shell, the Go and Find bars, the info strip, the empty state and the scroll box.
- `css/hex.css`: tokens (light and dark), the header, the bars and the grid. It stacks at 600 px and below.
- `js/bytes.js`: pure helpers (offset and hex parsing, text bytes, row formatting, magic-byte type, buffer search).
- `js/doc.js`: the document model (paged reads, the overlay of edits, undo and redo, `toBlob`, SHA-256, chunked find).
- `js/grid.js`: the virtual byte grid (rows, selection, keys, typed digits, scrollbar mapping).
- `js/actions.js`: app state and actions (open, save, find, copy, go to, undo). Exposed as `window.HexApp`.
- `js/commands.js`: SlopCmd commands, the Menu button's menu and the right-click menu (`window.HexCommands`).
- `js/main.js`: boot, the wiring, drop, and the `?drive=` launch.

## Tests
- `node tests/run.mjs hex`
- `tests/node/hex-model.test.mjs`: the pure model (parsing, types, search across chunk boundaries, paged reads and the page cache, edits and undo, coalescing, composed save, SHA-256).
- `tests/hex/hex.test.html`: the real app in an iframe. It covers open (computer, Drive launch, 100 MB), the info strip, one-byte edit with Ctrl+Z and Ctrl+Y, Go to offset, find (hex and text, wrap, not found), the version save to the Drive stub, download and the phone width.

## Known limits
- `service-worker.js` precaches the apps by path, and Slop Hex is not in that list (the service worker was not edited for this build). Add `/hex/...` to the list before it ships so it works offline.
- The grid's scrollbar maps onto at most 8 million pixels, so on very large files a wheel scroll moves many rows at a time. Use Go to offset for exact places.
- Touch: tap selects a byte. Dragging to select works with a mouse or a pen only.
- The ASCII column is shown, not edited.
- Find over a very large file reads the whole file in 1 MB chunks, with no progress bar. Press Next again to run it again if it is cancelled by a new search.
- SHA-256 reads the current content into memory, so a 100 MB hash needs about 100 MB more.
- Versions are never deleted or merged by the app.

## Assistant commands
`js/ai-commands.js` (loaded by `SlopCmd.prepare()` from `commands.js`): `hex.ai.new_file` (name, hex or text), `open_file` (Slop Drive), `set_bytes` (offset, hex or text: overwrites, never inserts; one undo step), `find_bytes`, `save_version` (a new file's first Drive record, else Save version), `export_file` (to, name). `doc.undoDepth()` is the checkpoint's mark. Test: `tests/hex/ai-commands.test.html`.

## The inspector on the right (the suite rule, shared/frame/HANDOFF.md)

`js/panel.js` mounts SlopFrame on `#hx-body`: the bytes (`#hx-main`) are the view, `#hx-side` the inspector. It holds the
file's facts (`#hx-info`: name, size, type, SHA-256, selection) and Save version (primary) and Download at its foot; Go to
and Find stay above the bytes, Open in the header (the menu bar's only tool), Save as new and Open from Drive in the File
menu. On a phone the inspector is a bottom sheet whose closed state shows Save version and Download. Test:
`tests/hex/panel.test.html`.
