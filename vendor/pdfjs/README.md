# pdf.js (vendored)

Mozilla pdf.js **5.7.284** (`pdfjs-dist`, legacy build), Apache-2.0 — see `LICENSE`.

| File | What |
|---|---|
| `pdf.min.js` | the library (copied from `legacy/build/pdf.min.mjs`, renamed to `.js` so any static host serves a JS MIME type). **It is an ES module**: load it with `import()` or `<script type="module">`, never a classic `<script src>`. |
| `pdf.worker.min.js` | the worker (from `legacy/build/pdf.worker.min.mjs`), also an ES module |
| `standard_fonts/` | pdf.js standard font data (Foxit/Liberation), fetched lazily |
| `cmaps/` | packed CMaps (`.bcmap`) for CJK PDFs without embedded CMaps, fetched lazily |

## Loading (from a page one folder below the site root, e.g. `/paint/`)

```js
const base = new URL('../vendor/pdfjs/', document.baseURI).href;
const pdfjsLib = await import(base + 'pdf.min.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
const doc = await pdfjsLib.getDocument({
  data: bytes,                          // Uint8Array (pdf.js may detach it: pass a copy)
  cMapUrl: base + 'cmaps/', cMapPacked: true,
  standardFontDataUrl: base + 'standard_fonts/',
  isEvalSupported: false,
}).promise;
// Render page 1 as an image:
const page = await doc.getPage(1), vp = page.getViewport({ scale: 2 });
const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
```

Password-protected files: set `task.onPassword = (update, reason) => update(prompt('Password'))` on the
loading task before awaiting `.promise`. Slop PDF (`/pdf/js/core/pdfjs.js`) is a working example.

Offline single-file use: `pdf/js/io/build.js` shows how to turn both modules into classic scripts
(`toClassic`) and start the worker from a Blob URL via `GlobalWorkerOptions.workerPort`.
