# Shared documents: PDF, templates and the paper view (handoff)

Used by Slop Orders, Slop Quotes and Slop Invoices. One view of a document feeds three outputs: the paper on the editor screen, the
print sheet, and the PDF. The data (money, numbering, totals) is unchanged: this folder only draws.

## Files

| Path | Role |
| --- | --- |
| `pdf-layouts.js` | `SlopDocs.layouts`: the five templates (`classic`, `modern`, `minimal`, `bold`, `sidebar`), four accent colours, `newSeed()`, `seedOf(doc)`, `resolve(doc)` and `describe(style)`. Pure data. |
| `doc-view.js` | `SlopDocs.view.build(doc)`: the one view of a document (company, number, dates (`moreMeta` adds more, such as a quote's Valid until), bill-to, rows with the raw value each editable cell edits, totals, notes). Money is formatted here. |
| `pdf-render.js` | `SlopDocs.pdf.renderPdf(view)`: the A4 PDF through the vendored pdf-lib (global `PDFLib`). Wraps lines, paginates with a repeated table head, and draws a footer with "Page n of N". |
| `paper.js` / `paper.css` | `SlopDocs.paper.build(view, { editable })`: the page as DOM, in the template's layout. Editable fields are `button.pe` with `data-edit`, `data-index` and `data-value`. |
| `paper-edit.js` | `SlopDocs.paperEdit.attach(root, o)`: a click or Enter on a field opens an input; Enter, blur or change commits; Escape restores; Ctrl+Enter ends a note. |
| `page.js` | `SlopDocs.page.mount(o)`: the Page / Form switch (Form is the default under 700 px), the layout pick and "New seed", and repainting the paper. The app supplies its state and its `field(name, index, value)`. |
| `doc-editor.js` | `SlopDocs.docEditor.create(cfg)`: the document editor a document app configures (form state, customers and products, line cards, checks, one save at a time, the unsaved-changes guard). The app gives its words, statuses, extra fields (`extra`) and action buttons (`actions`). Orders and Quotes use it. |
| `doc-page.js` | `SlopDocs.docPage.create(cfg)`: the paper view for that editor (in-place edits through the editor's `fieldError`, the company name, the PDF download). `cfg.view` adds view fields such as `moreMeta`; `cfg.field` takes the app's own fields. |
| `doc-app.js` | `SlopDocs.docApp.start(cfg)`: boot and routes (`#list`, `#new`, `#<route>/<id>`, `#data`) with SlopTabs, the leave-without-saving question and the list redraw on store changes (the list beside an open record redraws with it after a route and after every store change, so a first save or an issue shows at once). |
| `doc-pdf.js` | `SlopDocs.docPdf.create(cfg)`: `load(id)` (the record, its customer and the company block), `viewOf(ctx)` and `pdf(id)` for a stored document. |
| `doc-layout.js` | `SlopDocs.docLayout.mount(ns, app)`: the list-and-document workspace layout (shared/layouts) above 720 px, and the details as the record panel on the right (`SlopBiz.panel`, shared/biz/panel.js: SlopFrame, resizable, Save and the primary action in its footer; a bottom sheet on a phone whose footer stays on screen). `doc-editor.js` hands the record's actions to it (`ns.recordPanel.actions`). |
| `model.js`, `lines.js` | Unchanged apart from `SlopDocs.lines.parseField`, which the paper uses so typed values are read exactly as the form reads them. |

## The template and the seed

- A document has `pdfSeed` (an integer kept on the record, drawn once when the draft is created) and optionally
  `pdfLayout` (a template id, or absent for "random from the seed"). The seed picks the template and the accent colour;
  a picked template keeps the seed's accent. Same record, same bytes: `renderPdf` draws nothing random.
- A record saved before seeds has no `pdfSeed`: `seedOf` then uses a stable hash of its id.
- The schema (`shared/data/schema-defs.js`) has the two optional fields on `orders` and `invoices`, and the enum
  `ENUM.pdfLayout`. Issued invoices keep the seed and layout they had at issue (their edits are refused, as before).
- The template changes presentation only. It never changes a total, a number or a stored line.
- The template applies to the PDF, the print sheet, and the paper on the editor screen, which is the same page the PDF
  draws (the screen paper is "the same layout as the PDF").

## The document language

- Every printed word (titles, labels, column heads, totals, statuses, "Page n of N") is a `biz.pr.*` / `biz.st.*` key of
  `shared/biz/i18n/<code>/print.js` and `print2.js`, read in the document's language with `SlopI18n.at(code, locale)`, never
  in the page's. Money and dates on the document use that language's Intl locale (the company locale when it is of the same
  language, such as en-GB). Stored text (names, addresses, descriptions, notes) is printed as stored.
- `SlopBiz.docLang` (shared/biz/biz.js) owns the rule: the document's own `docLang` (the editor's Document language pick,
  empty = the company's), else the company's `settings.docLang` (Slop Admin), else the page's language when the business
  tables ship it, else English. Settings saved without one store the page's language of that moment. The choices are
  `SlopI18n.shipped('biz')`, so a language appears once its business tables do. A quote's language carries to its order or
  invoice; a credit note and a delivery note follow their invoice and order; statements, reminders and price lists use the
  company's.
- `doc-view.js` takes `words` (SlopBiz.docLang.words) and puts the fixed words in `view.words`; `paper.js` and
  `pdf-render.js` print only what the view gives them.

## The PDF

- Standard fonts only: Helvetica (sans layouts) and Times (`classic`), with their bold faces. pdf-lib cannot embed the
  bundled WOFF2 fonts (it needs fontkit, which is not vendored, and WOFF2 is not a pdf-lib format). Characters outside
  WinAnsi become "?".
- pdf-lib writes the page content as flate streams with hex text strings. The Node test inflates them and decodes the
  hex before it looks for totals.
- Metadata is not stamped (`updateMetadata: false`), so the same document gives the same bytes.

## Rules

- Keep one view for every output. A field that appears on the page must appear in `doc-view.js` first.
- Editing on the page uses the form's own checks: `invoices/js/ui/page.js` and `orders/js/ui/page.js` have a
  `fieldError` that gives the same messages as the save. A wrong value is shown and not saved until fixed.
- The company name on the page is the shared settings' `companyName` (the settings page edits the same value).
- Files stay under 300 lines.

## Tests

- `node tests/run.mjs docs` and the browser tests in `tests/invoices/paper.test.html` and `tests/orders/paper.test.html`
  (click a line description on the page, check the form and the store follow, then export and check the `%PDF-` bytes).
- `tests/shared/doc-apps.test.html`: in all four apps, the list beside the editor shows the first saved record, money and
  dates on the page keep to one line, and the Bold header layout keeps the fields below its band dark (they were white on white).
- `tests/node/pdf-render.test.mjs`: every template gives `%PDF-` bytes with the totals text (29.00, tax 4.00, subtotal
  25.00), the same document gives the same bytes, a long table runs onto several pages, the schema enum equals the
  template ids, the seed reaches all five templates, and word wrapping.

## Known limits

- Numbers, money and dates on the paper never wrap (`white-space: nowrap`); the description column takes the squeeze, the
  side bar stacks under 660 px of paper (a container query), and a table still too wide scrolls inside the page. In the
  workspace between 721 and about 1000 px the centre column is very narrow, so the table scrolls there.
- The paper on screen grows with its content; it is not paginated on screen. The PDF and the print sheet paginate.
- Fonts are the standard PDF faces, not the bundled library (see above).
- `service-worker.js` precaches the app files and was not regenerated for these new files; regenerate its precache
  before relying on offline use of the new paper view.
