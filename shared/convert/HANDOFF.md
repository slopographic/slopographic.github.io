# shared/convert: the Convert dialog on every page

One converter UI: File convert's tool (`convert/js/ui/mount-tool.js`, `mountTool`) inside a SlopUI dialog. The old
dialog-only UI and its own target list (`shared/convert/targets.js`) are gone; the conversions are the catalog's
(`convert/js/core/catalog.js`, with PDF to text and Picture PDF (HTML) moved there as `core/pdf-extra.js`).

## Files
- `dialog.js`: `SlopConvert.open(opts)` (ES module; sets `window.SlopConvert`). The dialog, preselecting, the "From
  <app>" note, conversion notes, the onPdf hand-back.
- `load.js`: what the dialog needs on a page that lacks it (SlopUI, SlopDrop, dialog.css, Slop Hub on results).
- `provided.js`: the provider contract below.
- `results.js`: Save to Slop Drive and Open in… beside each result's Download.
- `dialog.css`: the dialog's size (860 px wide, the whole screen at 640 px and below) and the tool in the app's colours.
- `pdf-layout.js`, `pdf-office.js`, `pdf-pptx.js`, `html-pdf.js`, `pdf-text-items.js`: PDF converters the catalog uses.

## Where it opens
- **Convert… in the shell header** of every app page (`shell/header.js`), not on File convert itself. The button costs
  nothing at first paint: `dialog.js` is imported on the first click. When the header has no room for it (phones, full
  headers) it hides and the **Theme menu** offers "Convert files…" first.
- **Command palette** (`SlopCmd`): "Convert files…" (`shell.convert`) on pages that load shared/commands.
- **Slop PDF** calls `SlopConvert.open({ file, drive, target })` and `open({ files, target, onPdf })`; the API is unchanged.

## API
```js
const ctl = SlopConvert.open({ file, files, target, onPdf, ask, drive });
```
- `file` / `files`: File objects (or Blobs with a name) to start with.
- `target`: a catalog conversion id to preselect for the files that can take it. `pdf-to-png` and `pdf-to-jpg` still work
  (PDF to images with that format).
- `onPdf(outputs, names)`: each file starts on the conversion that makes it a PDF, files that cannot are named, and after
  Convert the PDFs go to the app and the dialog closes.
- `ask`: with no files given the page's providers are asked (default); `ask: false` opens it empty.
- `drive`: ignored now; every result can be saved to Slop Drive.
- `ctl.ready`, `ctl.done`, `ctl.element` (the `.sui-dlg.sl-cvt-dlg`), `ctl.tool` (the ConvertTool), `ctl.close()`,
  `ctl.results()`, `ctl.targets()`, `ctl.run()`.

Test selectors: the dialog `.sl-cvt-dlg`, close `.sl-cvt-dlg .sui-x`, a file's target `.cv-to[data-target="<id>"]`, run
`.cv-form button[type=submit]`, a result `.cv-out-item` (`.cv-file-name`, `a[download]`, `.sl-cvt-save`, `.sl-cvt-open`),
the notes `.sl-cvt-notes`, the onPdf warning `.sl-cvt-err`, the "From" note `.sl-cvt-from`.

## How an app hands over what it has open (the provider contract)
Add this once, at boot, anywhere in the app's own scripts (classic or module; nothing has to be loaded first, and the
order does not matter):

```js
// Convert… in the header (shared/convert/provided.js): <what this app hands over>.
addEventListener('slop:convert-files', (e) => e.detail.provide(async () => {
  if (!nothingOpen) return null;                              // null (or []): the dialog opens empty, with its drop zone
  return [{ name: 'Budget.xlsx', blob: await exportXlsx() }];   // or File objects; one or an array
}));
```
- The function runs only when the dialog opens, so it costs nothing at boot. It may be sync or async.
- `provide(x, { app: 'Name' })` overrides the "From <app>" label (default: the registry name of the page's app).
- Give the format other tools read best (XLSX for sheets, DOCX for documents, PNG for images, PDF for layouts), with
  the right extension in `name`: the converter detects the kind from the name and the first bytes.
- Errors in a provider are caught and logged; the dialog then opens without its files.

### For Slop PDF (pdf/) and Slop EML (eml/)
- pdf/: `pdf/index.html` still loads `../shared/convert/dialog.js` and `dialog.css` (both kept), so nothing has to change.
  To preload the header's Convert… with the open document, add a provider that returns
  `[{ name: U.safeName(S.els.fileName.value || 'document.pdf', 'pdf'), blob: await A.currentPdfBlob() }]` when pages are
  open. pdf/HANDOFF.md still names `targets.js` (deleted): the targets are the catalog's now.
- eml/: return the open message as `{ name: '<subject>.eml', blob }` (the catalog has Email to HTML, text and attachments).

## Wired apps
Slop Tables (XLSX), Slop Sheets (every sheet as XLSX), Docs (DOCX), Slides (PPTX), PhotoSlop (flattened PNG), Gallery
(selected photos, else the one in the viewer), Drive (selected files), Notes (Markdown), Code (the open file), Hex (the
open file with edits), Music (the current track), Label (PDF), Press (PDF).

Docs' DOCX starts on Word to PDF (then HTML, Markdown, text) and Slides' PPTX on PowerPoint to PDF (then PNG pictures, text):
the catalog's `core/office.js` and `core/slides-out.js`, run by the apps' own engines (see convert/HANDOFF.md).

## Tests
`tests/convert/dialog.test.html`, `tests/convert/pdf-html.test.html`, `tests/shell/convert-button.test.html` (nothing
loads before the click, 390 px, Escape and focus), `tests/shell/convert-providers.test.html` (every wired app), and
Slop PDF's `tests/pdf/tabs`, `narrow-convert`, `pdf-workspace` (drop and Export as).
