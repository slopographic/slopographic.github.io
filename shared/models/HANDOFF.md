# On-device model families: handoff

One chooser, one installer and one file host for every family of on-device models. Speech (Whisper) is the first
family; OCR (PaddleOCR recognition models, one per script) is the second, see "The OCR family" below.

| File | What it does |
|---|---|
| `shared/models/catalog.js` | `SlopModelCatalog.create({ family, models, quick })`: ranks a family's models for a language (`rank`, `recommended`), `byId`, `fits`, `bytesOf`. Pure, Node-testable (classic script). |
| `shared/models/chooser.js` + `chooser.css` | `openModelChooser({ family, language, model, pinned, installer, ui, storageHref, onChoose })`: the "Language and model" dialog on `SlopUI.dialog`. Step 1 a searchable language list (the family's automatic choice first, "Always use …"); step 2 the ranked models with maker, size, licence, speed and accuracy dots, badges, and Download / Downloading n% + Cancel / Use, Remove; the storage the family uses, linked to Settings › Storage. Phones get a bottom sheet (CSS, under 520 px). ES module. |
| `shared/models/prefs.js` | `createPrefs(family)`: the pinned language (`slop.<family>.language`) and the preferred model per language (`slop.<family>.prefer`). Nothing is stored unless the person asks. |
| `aitools/model-registry.js` | The model index every installer check uses: licence, files, sizes, SHA-256, allowed hosts (Hugging Face, and the slopographic/cdn repository on jsDelivr or GitHub only: `shared/cdn/assets.js` isCdnUrl). The cdn URLs come from `shared/cdn/assets.js` (see shared/cdn/HANDOFF.md). A file may be `{ url }` or `{ parts: [{ url, size, sha256 }] }`. |
| `aitools/download.js` | `fetchFile(file, deps)`: one file, or its parts in order, each part checked, joined, the whole checked; progress and cancel (`AbortSignal`). |
| `aitools/models.js` | `SlopAIManager`: `status(id)` (`installed`, `update` = only files under 64 KB missing, `needs-download`), `install(id, onProgress, { signal })` (only the files not already stored), `remove`, `readAll`, `usage(ids)`. IndexedDB `slop-aitools`, one transaction per model. |

The speech family: `aitools/speech-models.js` (the models and their files on the cdn, a `create()` catalog),
`shared/speech/languages.js` (the 99 Whisper languages and the search), `shared/speech/family.js` (`speechFamily()`, the
words of the dialog). The Whisper decoding is in `aitools/workers/` (`whisper-*.js`, `speech-engine.js`) and has nothing
to do with the chooser.

## The OCR family

`aitools/ocr-models.js` (the models; `SCRIPTS`, the one table of which languages each script group reads; `rank('auto')`
lists every model, the bundled PP-OCRv4 first), `shared/ocr/languages.js` (the codes from that table, the names from
`shared/speech/languages.js` plus traditional Chinese, Kyrgyz, Kurdish, Uyghur and Irish), `shared/ocr/family.js`,
`shared/ocr/suggest.js` (after a first read with no language chosen: which model would read the text better) and
`shared/ocr/choose.js` (the button, `pick()`, the suggestion line; `loadOcr()` loads the list on demand, as Slop PDF does;
the list then adds itself to the model index with `SlopAIModels.add`). Files on the cdn under `models/ocr/<id>/`; the
detector (`ppocr-det-v4`) is the same file in every model. Used by Slop OCR, Slop PDF's OCR panel and AI Tools' OCR.

## Adding a family

1. **Files on the cdn**: put each model under `models/<family>/<id>/` in slopographic/cdn with its licence text,
   `SOURCE.md` (upstream, revision, what was changed) and `manifest.json` (`{ path, bytes, sha256 }` per file; a file over
   95 MB as `.partN` pieces of 90 MiB with `parts: [...]` and the whole file's hash). Push one model per commit (a 1 GB push
   times out) and pin the last commit in the site.
2. **The model list**: a classic script like `aitools/speech-models.js` (say `aitools/ocr-models.js`) with index entries
   (`id, name, tool: 'ocr', licence, upstream, source, sourceNote, files`) plus the chooser fields `maker, note,
   languages ('*' or codes), speed, accuracy` (1 to 5) and `only` when a model is trained on its languages alone. End with
   `catalog.create({ family: 'ocr', models, quick })` (`quick`: the small model that is always offered) and add its
   `MODELS` to `aitools/model-registry.js` the way the speech models are added (`.concat(speech.MODELS)`).
3. **The languages**: an ES module with `filter(query)` (the automatic choice first when it fits, then the matching
   languages, sorted) and `name(code)`.
4. **The family object**: like `shared/speech/family.js`: `{ id: 'ocr', title, languageStep, modelStep, usageWords,
   catalog, languages: { filter, name } }`.
5. **Use it**: `openModelChooser({ family: ocrFamily(), language, model, pinned, installer: SlopAIManager, ui: SlopUI,
   storageHref, onChoose })`, and `createPrefs('ocr')` for "Always use …" and the preferred model per language. Load
   `shared/slopui.js`, `shared/models/chooser.css`, `shared/models/catalog.js`, the model list, `aitools/model-registry.js`,
   `aitools/download.js` and `aitools/models.js` on the page.
6. **Tests**: a Node test of the list (`R.problems()` is empty, every URL on the pinned cdn commit, the ranking for a few
   languages), and the chooser itself is covered by `tests/models/chooser.test.html` (any family behaves the same).

## Rules kept

Nothing downloads until the person presses a Download button that names the model, its maker, size and licence. Every
file is checked against its length and SHA-256 before it is stored; a part, a joined file, a redirect off the allowed
hosts or a cancel stores nothing. The first-run notice counts as answered after an install from the chooser.
