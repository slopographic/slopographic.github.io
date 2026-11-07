# Slop Compare (diff/)

Compares two versions: texts and code, JSON (by key path), CSV (by row and cell), two PDFs (the text of every page, or the
pages as pictures) and two pictures (side by side, slider, difference). Everything runs in the browser.

## Files

| File | What |
|---|---|
| `js/core/myers.js` | the one sequence diff (Myers O(ND), common ends first, `maxCost` fallback to one block); `runs()` groups ops |
| `js/core/text.js` | lines (`diffLines`: eq / del / ins / mod rows, blocks, stats), words (`diffWords`), folds (`visible`) |
| `js/core/patch.js` | the unified diff (`unified`, as `diff -u` writes it, "\ No newline" too) and `applyPatch` (the tests' round trip) |
| `js/core/json.js`, `table.js` | JSON by key path (arrays of records matched by id/key/uuid/sku/code/name), CSV by key column or aligned rows; CSV is read by `convert/js/core/csv.js` |
| `js/core/image.js` | pixel difference, boxes of changed areas, the difference picture, sizes |
| `js/core/kind.js`, `compare.js` | what a pair is compared as, the summary, **OPTIONS** (the one table of settings: panel, AI commands, Workflows step) |
| `js/core/render.js`, `report.js` | the HTML of a result (page and report draw the same), the self-contained report page |
| `js/core/pdftext.js` | pdf.js text items → lines |
| `js/io/files.js` | `compareSides(a, b, opts)`: the one comparison (page, commands, `shared/ops/diff.js`); pictures and PDFs on canvases; `withUrls` for reports |
| `js/io/pdf.js`, `report-pdf.js` | reading PDFs (pdf.js through `convert/js/core/pdf-raster.js`), the report as a PDF (pdf-lib) |
| `js/ui/*` | the page: `bar.js` (the header, a classic script before the shell so the shell finds it), `main.js` (boot, intake spec `diff`, panel footer), `state.js`, `slots.js` (A and B), `view.js`, `picture.js`, `panel.js`, `export.js`, `commands.js`, `ai-commands.js`, `samples.js` |

## Rules kept

- One way in: spec `diff` (`limit: 2`, `processAll`): Open… / Slop Drive… per side pass `data: { side }`; a drop on a side
  is a `dropTarget` with that side; two files fill A then B; one file the side asked for or the first empty one. In STRICT.
- One way out: the report's Open in… is `SlopOuttake.items`; Save to Slop Drive is `SlopHub.put` (from 'diff').
- Layout: SlopFrame view + panel, Compare and Export at the panel's foot (`shared/frame/HANDOFF.md` audit row).
- The settings live in `localStorage['slop-diff:opts']`; a phone starts in Unified until a setting is chosen.

## Limits

- No merging, no folders, no three-way comparison.
- The PDF report uses the standard PDF fonts: letters outside Western European print as "?" (the HTML report keeps them).
- PDF pages compared as pictures: the first 40. Very different texts (over 6000 edits) are shown as one changed block.
- Word, Excel and PowerPoint files are not read: save them as PDF or text first.

## Tests

`tests/node/diff-text.test.mjs`, `diff-data.test.mjs`, `diff-ops.test.mjs`; `tests/diff/app.test.html` (texts, JSON, CSV,
exports), `pdf-image.test.html` (real PDFs made with pdf-lib, canvas pictures), `ai-commands.test.html`, `look.test.html`,
`contrast.test.html` (the result in every theme); `tests/intake/diff.test.html`; contrast sweep `tests/a11y/sweep-37`.
