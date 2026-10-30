# tesseract.js (vendored)

**tesseract.js 7.0.0** and **tesseract.js-core 7.0.0** from npm (https://registry.npmjs.org/tesseract.js/-/tesseract.js-7.0.0.tgz,
https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-7.0.0.tgz), Apache-2.0 — see `LICENSE` (and
`worker.min.js.LICENSE.txt` for the small MIT and BSD parts bundled into the worker). Files are copied unchanged.

| File | What |
|---|---|
| `tesseract.esm.min.js` | the library as an ES module (`dist/`), loaded with `import()` by `shared/ocr/engine-tesseract.js` |
| `worker.min.js` | its Web Worker (`dist/`), started from this site (`workerBlobURL: false`) |
| `tesseract-core-simd-lstm.wasm.js` | the Tesseract core, WebAssembly embedded, LSTM engine only, with SIMD (tesseract.js-core's root) |

The language data is not here: it is a model of the OCR list (`aitools/ocr-tesseract.js`, `aitools/ocr-models.js`),
downloaded from the slopographic/cdn repository (`models/ocr/tesseract-4.0.0-best-int/`) when a person chooses it, and
handed to tesseract.js as bytes (`cacheMethod: 'none'`), so tesseract.js never fetches from its default CDN.
