# Camera RAW (shared/raw/): handoff

One module for camera RAW photos, used by PhotoSlop, Slop Gallery, Slop Resize and File convert.

## Files
- `tiff.js` (`SlopRawTiff`): a bounds-checked TIFF reader (IFD chain, SubIFDs, EXIF) and the camera settings.
- `detect.js` (`SlopRawDetect`): `sniff(bytes, name)` by content first (RAF, CR3, CRW, MRW, ORF, RW2, CR2 magics; a TIFF that is a DNG, has a RAW extension, or names a camera maker and holds a CFA image), then extension. A plain `.tif` is not RAW. `FORMATS`, `EXTS`, `ACCEPT`.
- `preview.js` (`SlopRawPreview`): the embedded JPEG (JPEGInterchangeFormat, JPEG strips, RW2 JpgFromRaw, the RAF header, and a scan for every other file, CR3 included). Only lossy JPEGs count (the lossless SOF3 sensor data is skipped); the largest wins. `meta()` reads make, model, date, ISO, shutter, aperture, focal length, orientation (TIFF, CR3 CMT1/CMT2 boxes, or the preview's EXIF).
- `raw.js` (`SlopRaw`): the API apps use: `isRaw`, `sniff`, `meta`, `preview`, `previewCanvas` (upright), `decode`, `toCanvas`, `image(blob, { mode: 'preview' | 'full' })` with the fallbacks. Load tiff, detect, preview, raw in that order (classic scripts, or side-effect imports in a module; a module sets `SlopRawBase`).
- `engine.js` (`SlopRawEngine`, loaded on first develop): LibRaw 0.22.1 in WebAssembly (libraw-wasm 1.6.0, LGPL-2.1 or CDDL-1.0) from the cdn repo at commit `0cd1e199373a327108ba91702e597d767fbfc3f9` (`engines/libraw/libraw-wasm-1.6.0/`: the two files unchanged, the licences, SOURCE.md, manifest.json). First use shows `SlopFirstRun.once('raw-engine')`; the download goes through `SlopLibraryInstall.install` (allowed host, byte length, SHA-256) and is kept in IndexedDB as pack `engine-libraw` (not listed in Get more). It loads SlopUI itself when a page has none, so the notice always shows. `settingsFor(opts)`: `wb` camera / auto / daylight, `exposure` in EV (LibRaw `bright` = 2^EV, after its auto level), `highlights` clip / blend / rebuild (0 / 2 / 5), `bits` 8 or 16, `half`.
- `worker.js`: the module worker. libraw.js arrives as a blob URL (also LibRaw's `mainScriptUrlOrBlob` for its threads) and libraw.wasm as bytes, with `locateFile` set so the loader does not resolve against the blob URL. 8-bit output is RGBA; 16-bit is RGB `Uint16Array`. LibRaw applies the orientation.

## Limits
- The build uses WebAssembly threads with shared memory. It runs in Chromium without cross-origin isolation (tested); Firefox and Safari were not tested here. When the engine fails, every app falls back to the embedded preview and says so.
- Apps use 8-bit sRGB. 16-bit output is in the API, but no app writes 16-bit files yet (convert has no TIFF or 16-bit PNG writer).
- Slop Drive's picker matches MIME types only, so a RAW file stored with no `image/*` type does not show in "Open from Slop Drive".
- A camera newer than LibRaw 0.22.1 may not decode; the embedded preview is used then.

## Tests
`tests/node/raw.test.mjs` (hand-built TIFF, DNG, CR2, ORF, RW2, RAF, CR3 from `tests/raw/build.js`, and the real DNG), `tests/raw/engine.test.html` (notice, Cancel, checksum mismatch, 404, real decode from the cdn, 16-bit, half size), and one page per app (`tests/photoslop/raw`, `tests/gallery/raw`, `tests/resize/raw`, `tests/convert/raw`). Fixture: `tests/raw/fixtures/canon-5d3-crop.dng`, "Canon - EOS 5D Mark III - 14bit 14bit (2.3471882640587).dng" from raw.pixls.us, CC0 1.0, 1.5 MB, no embedded preview.
