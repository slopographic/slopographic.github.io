# File convert: handoff

File convert (`convert/`) converts files in the browser. Nothing is uploaded: every conversion
runs on the device. Status is `building` in `shared/apps.js`.

**Scope: files only.** Conversions that are not about files (units, currency, time, number bases) do not belong
here. They are in the calculator (`calculator/`, the Convert panel). The text converters (Base64, URL encode and
decode, line endings) stay because they also take uploaded files.

## Layout

- `index.html`: the hub (generated, see "SEO pages" below). Drop zone, file cards, batch, zip.
- `<slug>/index.html`: one static page per converter, with the same tool embedded.
- `css/convert.css`: the pages (tokens on `:root`, dark by default, light via `prefers-color-scheme` or `data-theme`); it imports `css/tool.css`, the tool's own scoped styles.
- `js/core/`: pure converters. `catalog.js` lists them; `pages.js` lists the SEO pages. `vcf.js` runs the vCard pairs and loads the Contacts vCard code (`contacts/js/core/`) into the page; `vcf-map.js` holds their header rule.
- `js/ui/`: the tool controller (`tool.js`), its markup (`markup.js`), options, batch runner, `mount-tool.js` and `mount.js`.
- `js/preview/`: the live preview (see below). `mount.js` is its entry point; `controller.js` debounces and runs the actions; `model.js` runs the converter for the preview; `view.js` draws the block; `diff.js` and `spec.js` hold the line diff and the limits.
- `js/io/`: file helpers, and `zip.js`, a re-export of `shared/office/zip.js` (ZIP writer and reader, shared with the other apps).

## The tool (mountTool) and per-file targets

`js/ui/mount-tool.js` `mountTool(host, { files, preset, fixedTarget, compact, onResults })` puts the whole converter in any
element: the hub and every pair page call it from `js/ui/mount.js` on `[data-convert-root]`, and a "Convert…" dialog in
another app can call it too. The host gets the class `.cv-tool`; `css/tool.css` holds every rule of the tool, all under
`.cv-tool`, with its own colour tokens and container queries (`@container cv-tool`), so it looks the same at any width and
inside any page; `convert.css` imports it and `mountTool` adds it to a page that has not. Ids are made per tool: `cv-drop`
for the first tool on a page, `cv2-drop` for the next (`tool.ns`). `compact` shows the drop zone as a strip from the start
and no first-visit picture; `onResults(outputs)` is called after each Convert. Returns the ConvertTool (`host.convertTool`).

- **Layout** (`frame.js`, the suite rule in shared/frame/HANDOFF.md): on File convert's own pages the tool is a SlopFrame:
  the files on the left (flow picture, drop zone, bulk bar, cards) and a panel on the right with the summary (`#cv-note`,
  `#cv-status`), the converted files and Convert + Clear at its foot (Convert stays the form's submit button through its
  `form` attribute). On a phone the panel is a bottom sheet whose closed state shows Convert; a run's results open it.
  A compact tool (a dialog) keeps its one column. Test: `tests/convert/panel.test.html`.
- **Drop zone** (`#cv-drop`, SlopDrop): always the upload area at the top. Once there are files it is a strip of one fixed
  height (76 px, "Add more files"), so nothing above the list moves; the zone's own progress list and status are hidden
  (the file list and the status line say the same). The flow picture keeps its place (blank while a side is unknown).
- **Cards** (`file-row.js`): every file has a checkbox, its own **Convert to** (a `shared/ui/menubutton.js` menu with a search
  box; catalog `keywords`, from `core/keywords.js` and each module's entries, plus the output extension and group, are
  searched) and its own **Options** (`file-opts.js`: a disclosure with the options of that file's target, values kept per
  file per conversion in `item.opts`; a 'combine' conversion copies a change to all its files). The option definitions are
  the catalog's `options` (one source), drawn by `options.js`; control ids are `cv-o-<file id>-<key>`.
- **Bulk bar** (`bulk.js`): always there once there are files; Select all, and for the selected rows "N selected · Convert to ·
  Remove · Clear selection", plus "Options for the N selected" when they share a target (ids `cv-o-bulk-<key>`).
- There is no big picker and no hidden select any more. `tool.setTarget(id)` sets the selected files, or every file (and
  the files added later) when none is selected; `tool.target` is the one they share ('' when they differ) and
  `tool.targets()` what they could all become. A set fires `cv:target` (route.js writes `?to=`).
- `?to=` (`route.js`) calls `ConvertTool.setDefaultTarget`. Pair pages (`data-preset`) still allow only their conversion.
- The flow picture's target tile opens the bulk bar's menu when rows are selected, else the first file's menu.
- Convert runs one group per conversion in use (`groupsFor`, `run.js runGroups`, each file with its own option values).
- `available()` on a catalog entry hides a conversion this browser cannot do (To AVIF where the canvas cannot write AVIF).
- Files: `mount-tool.js`, `tool.js`, `tool-chain.js`, `markup.js`, `targets.js`, `file-row.js`, `file-opts.js`, `bulk.js`, `list-view.js`, `focus.js`, `chain-row.js`, `chain-opts.js` (routes: see below).
  Tests: `tests/convert/cards.test.html` (strip, card options, 390 px light), `per-file.test.html`, `mount.test.html` (two tools,
  one dialog-sized), `tests/shared/menubutton.test.html`.

## Converters and their limits

| Converter | Input | Output | Limits |
|---|---|---|---|
| To PNG | JPG, WebP, BMP, GIF (first frame), SVG | PNG, optional size | GIF: first frame only. SVG is drawn at the chosen size. |
| To JPG | PNG, WebP, BMP, GIF, SVG | JPG, quality, size, background | Transparent areas take the background colour. |
| To WebP | PNG, JPG, BMP, GIF, SVG | WebP, quality, size | Needs a browser that can write WebP (Safari may not). |
| To BMP | PNG, JPG, WebP, GIF, SVG | 24-bit BMP, size, background | No transparency; files are large. |
| To ICO | any image | single-size ICO (16 to 256 px) | PNG-compressed single image; one size per file. |
| Images to PDF | PNG, JPG, WebP, BMP, GIF, SVG | one PDF | A4, Letter or fit; portrait; margins. PNG is flattened onto white. Upright JPEGs are embedded unchanged; EXIF-rotated JPEGs are redrawn upright. |
| PDF to images | PDF | PNG or JPG per page | Page range, 72/144/216 dpi. Password PDFs are refused. Pages are capped at about 40 megapixels. |
| Merge PDFs | PDF (many) | one PDF | Encrypted PDFs must be unlocked first. |
| Split PDF | PDF | one PDF with a range, or one per page (zip) | Encrypted PDFs must be unlocked first. |
| CSV to JSON | CSV | JSON array of objects (or arrays) | RFC 4180 quoting. Numbers stay text unless "numbers" is ticked and round-trips exactly. |
| JSON to CSV | JSON | CSV | Array of objects (union of keys), arrays, or one value per row. Nested values as JSON text. |
| CSV to XLSX | CSV | one-sheet XLSX | Values only (no formatting or formulas). Numbers that would lose precision are text. |
| CSV to vCard | CSV | vCard 3.0 (.vcf), one card per row | Header names are matched case-insensitively (see `js/core/vcf-map.js`). The status line lists the recognised columns. Photos are not in CSV. |
| XLSX to vCard | XLSX | vCard 3.0 (.vcf) | First sheet only; the first row holds the column names. Formulas are not calculated. |
| vCard to CSV | vCard (.vcf, 2.1, 3.0 or 4.0) | CSV: Name, First name, Last name, Organisation, Job title, E-mail, Phone, Address, Website, Note | Read by the Contacts vCard code. Photos are left out. Several values in a cell are joined with "; ". |
| vCard to XLSX | vCard | one-sheet XLSX, same columns as vCard to CSV | Values only. Photos are left out. |
| Video or audio to WAV | MP4, WebM, MOV, M4A, MP3, WAV, OGG, FLAC | 16-bit PCM WAV at 44.1 kHz, stereo or mono as the source | Decoded by the browser (`OfflineAudioContext.decodeAudioData`), so AAC needs a browser that plays it. Silent files say so. |
| Video or audio to MP3 | same as above | MP3 at 128, 192 or 320 kbps | Encoded with lamejs (`vendor/lamejs`, LGPL-3.0), loaded on first use. |
| MOV to MP4 | MOV | MP4 | Streams copied when they fit (no loss), otherwise re-encoded with H.264 and AAC. ffmpeg.wasm. |
| Video to WebM | MP4, WebM, MOV | WebM (VP8 and Vorbis) | Re-encoded. ffmpeg.wasm. |
| Video to GIF | MP4, WebM, MOV | GIF, width and frame rate chosen | ffmpeg.wasm. |
| Video frame to WebP, PNG or JPG | MP4, WebM, MOV | one picture at the chosen time | ffmpeg.wasm. |
| vCard to JSON | vCard | JSON array, one object per contact | Field names follow the Contacts model (fn, name, emails, phones, adr, org, title, url, note). Photos are left out. |
| Markdown to HTML | Markdown | HTML page or fragment | No tables, nested lists or footnotes. Raw HTML is escaped (shown as text). |
| HTML to text | HTML | plain text | Visible text only; scripts and styles removed. |
| Base64 encode / decode | any / text | .base64.txt / original bytes | Decode detects PNG, JPG, PDF and other signatures to pick the extension. |
| URL encode / decode | text | text | Encode everything by default, or keep URL punctuation. A bad % sequence is reported. |
| Line endings | text | text | LF, CRLF or CR. |
| SIE to XLSX | SIE (.se, .si; types 1, 2, 3, 4, 4I) | XLSX: Info, Vouchers, Accounts, Balances, Periods | Read by `shared/finance/sie.js` (SIE 4C/4B format; PC8 = CP437, or UTF-8 / Windows-1252 when a program wrote those). Checksum (#KSUMMA) checked. Amounts are numbers, dates are dates. |
| SIE to CSV | SIE | CSV, one row per transaction line (balances per account when the file has no vouchers) | Separator comma, semicolon (then a decimal comma) or tab; UTF-8 with a BOM. #BTRANS lines are listed with a note and not counted. |
| Bank statement to CSV / XLSX (`bank-to-csv`, `bank-to-xlsx`) | OFX/QFX 1.x and 2.x, QIF, camt.053 (also 052/054), MT940 | CSV, or XLSX with Transactions and Statement sheets | Readers in `shared/finance/`. Money out is negative. Pending camt entries are listed but not counted. OFX has no opening balance; QIF has no currency. |
| 3D models (`core/threed.js`) | OBJ (+MTL), STL, PLY, glTF (+.bin, pictures), GLB, 3MF, DAE, FBX | STL (binary/ASCII), OBJ (+MTL, PNG textures), GLB, glTF (embedded), PLY (binary/ASCII), USDZ | Shared 3D I/O module (`shared/3d-io/`). Companion files (`with` kinds) are matched by name and never converted alone. Options: units, scale, up axis, merge, encoding, materials, animations. The status line names what the format dropped. Compressed glTF loads Draco/meshopt/Basis from the cdn (SHA-256 checked, first-use notice). The preview draws input and output in 3D (`js/preview/model3d.js`). |
| HEIC to JPG / PNG / WebP (`core/heic.js`) | HEIC, HEIF (iPhone) | picture, size, quality | The browser's own decoder first (Safari); else libheif from the cdn (`shared/heic/`, see below). A file with several pictures gives the main one and says so. |
| To AVIF (`core/media-more.js`) | PNG, JPG, WebP, BMP, GIF, SVG, ICO | AVIF, size, quality | Offered only where the canvas writes AVIF (`available`); Chromium and Firefox do not today, so it is usually hidden. |
| To OGG / Opus / FLAC / M4A (`media-more.js`) | MP4, WebM, MOV, M4A, MP3, WAV, OGG, FLAC | Vorbis, Opus (48 kHz), FLAC, AAC; bitrate | ffmpeg.wasm (`engine: 'ffmpeg'`, its notice). Tags copied. Opus uses ffmpeg's own encoder: libopus in this core crashes the page. |
| GIF to MP4 (`media-more.js`) | GIF | H.264 MP4, quality | ffmpeg.wasm. An odd size is made even; no transparency. |
| Spreadsheet to CSV / JSON, ODS to XLSX, JSON to XLSX (`core/data-more.js`, `sheet-json.js`) | XLSX, ODS / JSON | CSV (first or every sheet, separator, UTF-8 mark), JSON (objects or arrays, a key per sheet), XLSX | Read by `shared/sheets/read.js`, written by `shared/sheets/write.js` (the Slop Tables reader and writer). Old .xls is refused with what to do (kind `xls`, no conversion). Formulas: the saved values. |
| JSON to YAML / TOML / XML, YAML / TOML to JSON, Format JSON (`core/structured.js`) | JSON, YAML, TOML | text | js-yaml 4.1.1 (`vendor/js-yaml`, MIT) and smol-toml 1.9.0 (`vendor/smol-toml`, BSD-3-Clause), loaded on first use. JSON mistakes are reported with line and column. TOML has no null: nulls are left out and counted. |
| SRT to VTT, VTT to SRT, Shift subtitle timing (`core/subtitles.js`) | SRT, VTT (also detected inside .txt) | text, shift in seconds | NOTE, STYLE and REGION blocks are dropped; VTT cue settings are kept in VTT, dropped in SRT. |
| Markdown / text to PDF and to Word (`core/doc-out.js`) | MD, TXT | PDF or DOCX; A4 or Letter; sans, serif or mono | The Slop Docs engine (its Markdown import, layout, PDF writer with `shared/fonts/pdf-runs.js`, DOCX writer). Other scripts get their Noto font through SlopFontJIT (asks first). Markdown tables, links and images stay as typed text. |
| Word to PDF, HTML, Markdown, text (`core/office.js`) | DOCX | PDF (page size as in the document, A4 or Letter), HTML (page or body), Markdown, TXT | Slop Docs' own DOCX import (`docs/js/io/docx-in.js`), layout and PDF writer through `doc-out.js` (every script via `shared/fonts/pdf-runs.js` and SlopFontJIT), its Markdown and HTML writers (`docs/js/io/md-out.js`, `html-out.js`) and text (`sdoc.js toText`). Pictures, footnotes, comments and tracked changes are not imported yet. Markdown: GitHub pipe tables, no underline. Slop Docs does not read ODT, so there is no ODT conversion. |
| PowerPoint to PDF, pictures, text (`core/slides-out.js`, `core/deck-text.js`) | PPTX | PDF (one page per slide), ZIP of PNGs (1×, 2×, 3× the slide size in points), TXT (titles, text, speaker notes) | Slop Slides' own PPTX import, renderer and PDF export, loaded from `slides/js/manifest.js` into `window.SS` (`slidesEngine`). Hidden slides only when ticked. The status line counts what the import left out (charts, SmartArt, media). No ODP, .doc or .ppt. |
| HTML to Markdown (`core/html-md.js`) | HTML | Markdown (CommonMark, GitHub tables, ~~strike~~) | DOMParser. Scripts, styles and forms dropped; Markdown characters in text escaped. |
| CSV to Markdown table / HTML table, Change CSV separator (`core/table-out.js`, `text-more.js`) | CSV (TSV and .tsv read as CSV) | MD, HTML (page or table), CSV or .tsv | Number columns right-aligned in Markdown; pipes escaped, line breaks as `<br>`. The separator change keeps the kind (`chain: false`). |
| JSON Lines to JSON, JSON to JSON Lines (`core/jsonl.js`) | JSONL / NDJSON, JSON | JSON array, one value per line | A bad line is named with its number and column. |
| JSON to CSV, option Nested values in their own columns | JSON | CSV | `csv.js flattenRecord`: `a.b`, `tags.0`; off by default (nested values as JSON text, as before). |
| Text encoding to UTF-8 (`core/encoding.js`, `TO_UTF8`) | every text kind | the same kind, `-utf8` in the name | TextDecoder. Detect: BOM, UTF-16 by its zero bytes, valid UTF-8, else Windows-1252. Last in the catalog so it is never a kind's default. |
| EPUB to text, Markdown, HTML (`core/epub.js`) | EPUB 2 and 3 | TXT, MD, one HTML page (pictures as data: URLs) | Spine order; nav pages not in the spine are left out. DRM (chapters in `META-INF/encryption.xml`) is refused. Pictures become `[alt]` in text and Markdown. EPUB to PDF and Word are routes through Markdown. |
| ASS/SSA to SRT and VTT, SBV to SRT (`core/subs-more.js`) | .ass, .ssa, .sbv | SRT, VTT, shift | Dialogue lines in Format order, sorted; `\i`, `\b`, `\u` become tags, other overrides dropped. |
| Favicon set (`core/favicon.js`) | any picture | ZIP: favicon.ico (16, 32, 48), PNGs 16 to 512, apple-touch-icon (always filled), site.webmanifest, head-tags.html | Fitted into a square, optional padding and fill. `ico.js encodeIcoImages` writes multi-size ICOs. |
| Cut audio (`core/cut.js`, `media-geo.js`) | audio and video files | WAV or MP3 | Start and end as seconds or m:ss, fades. Decoded by the browser like To WAV. |
| Cut video (`media-geo.js`) | MP4, MOV, WebM | the same format | ffmpeg.wasm. Default: streams copied (starts at the key frame before the start); Cut at the exact frame re-encodes. |
| GPX and KML to GeoJSON, GeoJSON to GPX and CSV (`core/geo-read.js`, `geo-write.js`) | .gpx, .kml, .geojson | GeoJSON, GPX 1.1, CSV of points | Track times in `properties.coordTimes`; KML placemarks in folders, polygons with holes, MultiGeometry, gx:Track. GPX has no areas: outlines become tracks and are counted. KMZ: unzip first. |

Browser support: anything the browser cannot decode or encode (for example WebP output in some Safari versions) reports a plain error on that file; the rest of the batch still runs.

## Word and PowerPoint (`core/office.js`, `core/slides-out.js`, `core/office-pages.js`)
`OFFICE` (Word entries `DOCX_IN`, then PowerPoint `SLIDES_IN`) is spread into `CONVERSIONS` after `DOC_OUT`. A .docx or .pptx defaults to
its PDF conversion (the first entry for the kind), so the Convert dialog fed by Slop Docs (DOCX) or Slop Slides (PPTX) starts on
Word to PDF or PowerPoint to PDF. Chain flags: Word to HTML, Markdown, text and PowerPoint to text are `chain: 'first'` (no
"Markdown via DOCX" for a text file); PowerPoint to pictures is lossy. `detect.js officeOfZip` names a zip with no telling name
from its first entry (`word/` or `ppt/`). The preview keeps zip-based inputs whole (`preview/model.js` WHOLE), as a cut zip cannot
be read. Pages (`OFFICE_PAGES`): docx-to-pdf, word-to-pdf, docx-to-html, docx-to-markdown, docx-to-text, pptx-to-pdf,
powerpoint-to-pdf, pptx-to-images, pptx-to-text. Tests: `tests/node/convert-office.test.mjs` (Word to Markdown, HTML and text,
detection, routes, deck text), `tests/convert/office.test.html` (a Word file from `office-fixture.js` with headings, lists, a table,
a link, Swedish and Arabic, to PDF read back with pdf.js, HTML, Markdown, text, and the dialog in Slop Docs) and
`tests/convert/office-pptx.test.html` (a deck written by Slop Slides' PPTX writer, to PDF, PNGs and text). The Arabic font is
served from memory (`office-helpers.js`).

## Finance files

`js/core/finance.js` holds the four finance conversions (`FINANCE`, spread into `CONVERSIONS`) and `js/core/finance-pages.js`
their six pages (`FINANCE_PAGES`, spread into `PAGES`; category Finance). The readers, the shared model and the tables are
in `shared/finance/` (one module per format, `index.js` sniffs and dispatches, `tables.js` makes the rows); the XLSX writer
is `shared/sheets/write.js` (several sheets, bold header, number and date formats). `detect.js` asks
`shared/finance/index.js` `sniffFinance` first, so a finance file named .txt, .xml, .csv or .dat is recognised by content.
The preview decodes finance files before it shows them and shows the converter's own table (`result.preview`) for XLSX.
Tests: `tests/convert/finance.test.html`, `tests/node/finance-*.test.mjs`, samples in `tests/finance/fixtures/`.

## SEO pages

- `convert/js/core/pages.js` holds one entry per page (slug, title, description, h1, copy, FAQ, the
  conversion and the accepted kinds). The pages were written from it once; they are plain static HTML, edited by hand.
  A page's label (hub card title, SEO crumb) and summary (the card's line) are not in the list: they are the tables'
  `convert.card.<slug>` and `convert.card.<slug>_sum` (`convert/i18n/<code>/cards*.js`), read through
  `core/page-words.js`. Code never keeps English next to a key: `tr(key, vars)` (`core/i18n.js`) reads the tables, in
  Node too (the English tables from disk). `tests/node/convert-i18n.test.mjs` checks both.
- Every converter page has: a unique title, meta description, one `h1`, a canonical link, Open Graph
  tags, `SoftwareApplication` JSON-LD, the working tool (`data-convert-root`), a FAQ, and a link list
  to the other converters.
- `sitemap.xml` (site root) lists the hub and every converter page. `robots.txt` allows crawling and names the sitemap.

**Rule:** when you add a page, add its entry to `convert/js/core/pages.js` and its `convert.card.<slug>` and `_sum` keys
to the en and sv card tables, create `convert/<slug>/index.html`
(copy an existing page and change the head, h1, copy and `data-preset`/`data-from`), and add its URL to
`sitemap.xml`. `tests/convert/seo.test.html` fails if a page in `pages.js` is missing from the sitemap, its
file is missing, or its h1, canonical or JSON-LD is wrong.

## Live preview

Every converter page and the hub's converter card has a preview block below the tool:

```html
<section class="cv-pv-wrap" aria-label="Live preview" data-convert-preview></section>
...
<script type="module" src="../../convert/js/preview/mount.js"></script>
```

`js/preview/mount.js` loads after `js/ui/mount.js` and attaches to the root's `ConvertTool` (`root.convertTool`). The tool emits `cv:change` on its root whenever files,
typed text, the target or an option changes. The preview debounces that by 150 ms and drops stale results.

- **Before and after panels.** Pictures show the original and the converted picture with file size and pixel size
  (read from the drawn image). PDF inputs and outputs show page 1 at 72 dpi. Text, CSV, JSON, Base64, URL and
  line-ending conversions show the input and the output as text, with changed lines marked where the line
  structure matches (`LINE_DIFF` in `spec.js`: line endings and URL encode/decode).
- **Typed text.** Text converters have an input box. Typed text is one item named `pasted.<kind>`
  (`ConvertTool.setText`), so Convert and Download handle it like a file. A file as input disables the box.
- **Errors** from the converter show in the after panel in place (`role="alert"`).
- **Actions.** Copy (text, or a picture as PNG where the browser allows it), Download (the whole conversion, one
  file or a zip), and Swap for reversible text conversions (`REVERSE` in `spec.js`). Swap moves the output into
  the input and switches the page to the reverse conversion (`ConvertTool.swapText`).
- **Limits.** Text larger than 256 KB shows its first part, and the note says so. Pictures larger than 12 MB are
  drawn at 1200 px wide. PDF previews render page 1 only, and `pdf-to-images` and `split-pdf` run page 1 unless a
  page range is typed. Whenever a preview ran only part of the job, Download, Copy and Swap run the full conversion.

**Rule:** when you add a converter with a page, give the page the block and the script above. Keep the block out of the page's text and metadata. `tests/convert/preview.test.html`
covers PNG to JPG and JSON to CSV.

**Not done here:** `service-worker.js` has a precache list of convert files. The `js/preview/` files are not in it
yet, so offline use of the preview needs them added there (that file is owned elsewhere).

## Tests

`node tests/run.mjs convert` runs `tests/convert/*.test.html`:

- `image.test.html`: PNG to JPG (JPEG bytes, same size, background fill, resize), BMP and ICO headers, EXIF orientation, kind detection.
- `pdf.test.html`: image to PDF page count (`/Type /Page` count) and `%PDF` header, A4/Letter, merge, extract, split, PDF to PNG and JPG.
- `data.test.html`: CSV to JSON round trip, JSON to CSV, XLSX parts, Base64 round trip, URL, line endings, Markdown, HTML to text.
- `seo.test.html`: sitemap, robots, each page's h1, canonical, JSON-LD and embedded tool.
- `office.test.html`, `office-pptx.test.html`: Word and PowerPoint files (see "Word and PowerPoint"). Node: `tests/node/convert-office.test.mjs`.
- `more.test.html`: HEIC through the real decoder, the new kinds and their menus, sheets, YAML, TOML, XML, subtitles, Markdown and Arabic text to PDF and DOCX. `audio-ff.test.html`: OGG, Opus, FLAC, M4A and GIF to MP4 with ffmpeg. `cards.test.html`, `mount.test.html`: see above. Node: `tests/node/convert-{sheets,structured,subtitles}.test.mjs`.
- `ui.test.html`: valid targets per file, preset limits, keyboard drop zone, labels, safe file names.
- `per-file.test.html`: per-file targets, mixed kinds, select + bulk set, presets and ?to=, companions, keys, 390 px.
- `preview.test.html`: the preview shows the PNG to JPG output and follows a new input; the JSON to CSV preview updates as text is typed and shows invalid JSON in place.

## Adding a converter

1. Write a pure function in `convert/js/core/` (no DOM unless it needs canvas).
2. Add an entry to `CONVERSIONS` in `convert/js/core/catalog.js` with `from` kinds, `options` and `run`.
3. Add a test to `tests/convert/`.
4. If it deserves a page, add it to `pages.js`, create the page and add it to `sitemap.xml`.


## Routes: several conversions one after the other (`core/chain.js`)

A target can be a **route**: conversions done in order, written as a key of step ids joined by `>`
(`sie-to-csv>csv-to-json`); a step whose Format option the route fixes is `id@kind` (`pdf-to-images@jpg>to-webp`). A plain
conversion id is a one-step route, so `item.target`, `setTarget`, the bulk bar and `?to=` take either.

- **Route finding** (`core/chain.js`, pure, Node-tested): the catalog is the graph (each conversion is an edge from each kind
  in `from` to `outKind`; one edge per Format value). The best route to a kind is the one with the fewest engine downloads
  (`engine: 'ffmpeg'`; so the engine is used only when the target needs it anyway), then the fewest steps, then the least loss,
  then catalog order. Loss comes from `core/chain-flags.js`, copied onto the catalog entries like `keywords.js`: `lossy: true`
  (cost 1), `cost: n` (XLSX to CSV or JSON reads one sheet: 2; video to GIF: 2), `chain: 'first'` (needs the original file: PDF to
  Word, Excel, HTML or text, CSV or XLSX to vCard), `chain: false` (keeps the kind or makes anything: line endings, JSON format,
  subtitle shift, email attachments, merge and split PDF). Never in a found route: the Encoding and Archives groups, conversions
  that take any file (`*`) or have companions (`with`), a step that keeps the kind, a kind twice (no round trips), and `txt`
  as a step's input when the conversion also takes a real kind (CSV to JSON takes `.txt` only as a misnamed CSV). At most
  `MAX_STEPS` (3) steps; `MAX_MANUAL` (4) with steps added by hand.
- **Menus**: a card's Convert to lists the single conversions as before, then **More formats**: the best route to every kind no
  single conversion makes from this kind ("JSON · via CSV", searchable by the kinds on the way and the last step's keywords).
  `targets.js` `routeEntry` makes such a choice look like a catalog entry (`id` = key, `ext` = final kind, `route: true`).
- **Card** (`ui/chain-row.js`): a route target shows its formats as tiles with arrows under the row (SIE → CSV → JSON). A
  middle tile is a menu button (`middleChoices`: the other formats that join the same ends, the current first); **+ Then…** adds
  a step from what the route makes (`thenChoices`: no encoding, nothing that keeps the kind, nothing back to a kind on the route);
  **×** removes the last step (a step that had its Format fixed by the route keeps it as its option, `dropLast`). A one-step target
  has + Then… beside its Convert to. Focus stays on the tile or button through the redraw (`focus.js`).
- **Options** (`ui/chain-opts.js`): one group per step, "Step 1 · SIE → CSV", with the catalog's options of that step (values
  per file per conversion as before; a middle step's Format is the route's, so it is not shown); ids `cv-o-<file>-s<n>-<key>`.
  **Also keep the in-between files** (`cv-o-<file>-keep`, `item.keepMid`) adds what the middle steps made to the results,
  after the final files, marked "in between".
- **Running** (`core/chain-run.js` `runChain`, `ui/run.js` `runGroups`, `ui/tool-chain.js` `runTool`): each step's outputs are
  the next step's inputs; an `each` step maps over every file the step before made (PDF to page pictures, then each picture to
  WebP), a `combine` step takes the whole set (HEIC photos to JPG, then one PDF). The status line names the step ("Step 2 of 3:
  CSV → JSON…"); an error names its step ("Step 2 of 2 (CSV → JSON) failed: …") and stops only the files it came from.
- **Preview** (`preview/chain.js`): the final result, with the same limits as one conversion (first part of large text, page 1
  of a PDF, the RAW and HEIC preview options so nothing is downloaded); a route with an ffmpeg step is not run for a preview.
- **Bulk bar**: More formats lists the routes that fit every selected file; a shared route shows its tiles in the bar, and its
  middle tile, + Then… and × set every selected file where the route fits; its Options are per step too.
- **Links**: `?to=` takes a conversion id or a format (`?to=json`): a file that cannot make it in one step gets the best route
  (`targets.js` `targetFor`). Picking a route writes its last conversion to `?to=` (the `cv:target` event's `id`; `route` holds the key).
- **mountTool**: unchanged. `tool.target` can be a route key; `tool.targets()` still lists single conversions only, and the
  new `tool.routes()` lists the route keys; `tool.rowRoute(item, key)` and `tool.bulkRoute(key)` set routes.
- **Pages** (`core/chain-pages.js`, `CHAIN_PAGES`, in PAGES and `shared/seo/convert-copy.mjs`): sie-to-json, heic-to-pdf
  (through JPG: a smaller PDF of photos), xlsx-to-yaml, pdf-to-webp, csv-to-yaml, ics-to-xlsx. `data-preset` is the route key;
  such a page takes any route to the same format (its middle tile switches), but has no + Then… or ×.
- Tests: `tests/node/convert-chain.test.mjs` (routes, alternatives, Then, the runner with fake converters),
  `tests/convert/chain.test.html` (SIE → CSV → JSON with a real SIE file, the menus, options per step, keep in-between, bulk,
  `?to=json`, the SIE to JSON page, keyboard, 390 px).

## Video engine (ffmpeg.wasm)

`convert/js/core/ffmpeg-engine.js` runs ffmpeg in the browser. The JavaScript is vendored in `vendor/ffmpeg` (MIT). The core (about 30 MB of WebAssembly, GPL-2.0-or-later) is loaded from jsDelivr on first use, pinned to `CORE_VERSION`. One job runs at a time; a runtime error restarts the engine and retries once. WebM audio is Vorbis: the Opus encoder in this build fails with video. Inputs over 400 MB are refused.

## Camera RAW (`js/core/raw.js`, `js/core/raw-pages.js`)
RAW kinds are the extensions (cr2, cr3, nef, arw, dng, raf, orf, rw2, pef, srw, …); `detect.js` asks `shared/raw/detect.js` first, before the TIFF and MP4 magics. Conversions `raw-to-jpg`, `raw-to-png`, `raw-to-webp` (group Camera RAW): White balance, Exposure (−2 to +2 EV), Highlights, size, quality; developed by the LibRaw engine (`shared/raw/engine.js`, its own first-use notice). Declined or failing engine: the embedded preview is converted and the status line says so (`out.info`). The live preview passes `rawPreview` (embedded JPEG only, nothing downloaded). Pages: cr2, cr3, nef, arw, dng, raf `-to-jpg` (`data-accept` sets the file chooser's list; `mount.js` reads it). Test: `tests/convert/raw.test.html`.

## HEIC photos (`js/core/heic.js`, `shared/heic/`)
The decoder is libheif with libde265 compiled to WebAssembly (libheif-js 1.23.5, LGPL-3.0), unchanged, on the cdn at
`engines/libheif/libheif-js-1.23.5/` (commit 8929ad4e202f7b728f0c10c5ee493fd12a4698e1; SOURCE.md, licences, manifest).
`shared/heic/engine.js` (window.SlopHeicEngine) works like the RAW engine: its own first-use notice ('heic-engine'), the
shared installer (size and SHA-256 checked, kept in IndexedDB), a classic worker (`worker.js`). The live preview never asks
(opts.heicPreview). Pages: heic-to-jpg, heic-to-png (`core/more-pages.js`). Test: `tests/convert/more.test.html` with
`tests/convert/fixtures/tiny.heic` (CC0, see the fixtures README).

## More pages
`core/more-pages.js` (HEIC, SVG to JPG, GIF to MP4, audio, text to PDF and Word) and `core/data-pages.js` (spreadsheets,
JSON, YAML, TOML, XML, subtitles) are spread into PAGES. Their head copy is not written twice: `shared/seo/convert-copy.mjs`
makes the copy.mjs PAGES entries from these lists (and the RAW pages). A new page: add it to one of these lists, make
`convert/<slug>/index.html` like its neighbours, then `node tools/seo/write.mjs` (it writes the head and the sitemap).

## PDF passwords (`js/core/pdf-lock.js`, `js/core/pdf-lock-pages.js`)
**Protect PDF with a password** (`pdf-protect`: Password, Type the password again, Allow printing / copying / editing) and
**Remove PDF password** (`pdf-unlock`: Password, blank for a file that opens freely but has limits), both PDF to PDF, run by
the shared security handler `shared/pdf-crypto/` (AES-256 R6 out; RC4, AES-128 and AES-256 in; see its HANDOFF.md), loaded
on first use. Their entries say `secret: true` and `chain: false`: option type `'password'` is a masked field
(`options.js`, `autocomplete=new-password`), the card summary says "password set" and never the value (`file-opts.js`
`changed`), the live preview does not run them and its Download is off (`preview/model.js`, `controller.js`), and Convert
forgets every password option afterwards (`file-opts.js` `forgetSecrets`, called in `tool-chain.js` `runTool`), so the
fields are empty again. Passwords are never logged or stored. Errors name what to do ("Wrong password…", "already has a
password…", "no password to remove"). Pages: `password-protect-pdf`, `remove-password-from-pdf`. Test:
`tests/convert/pdf-lock.test.html`; the crypto itself: `tests/node/pdf-crypto.test.mjs`, `tests/pdf-crypto/crypto.test.html`.

## The operation registry (shared/ops/registry.js) and Slop Workflows
The catalog is one part of the site's single operation registry: `catalog.js` ends with `register(CONVERSIONS, { app:
'convert' })`. Apps register their own headless operations beside it (`shared/ops/*.js`: SlopIsolate, Watermark, Resize,
Upscale, Clean, OCR, Rename, Compress PDF) in the same entry shape; File convert still shows only `CONVERSIONS`, and Slop
Workflows (`workflows/`, see its HANDOFF.md) shows them all. New entry fields any conversion may use: `check(opts)` (a
problem to show before a workflow runs; Protect PDF asks for its password), `description`. `zip-files` has a ZIP name
option (`zipName`, default `files`). `runChain` (`core/chain-run.js`) gained, without changing routes: step `name`, `to` as a
function of the input kind, an output's own `kind`, `keepStep(i)`, `onUnit` (per file per step), an `AbortSignal`, and
`run(files, opts, { signal, progress })`. `ui/options.js` also draws an `image` option (a picture kept as a data URL).
Tests: `tests/node/workflows-*.test.mjs`, `tests/workflows/`.

## More text, data, media and map conversions (`core/text-more.js`, `core/media-geo.js`)
`TEXT_MORE`, `MEDIA_GEO` and `TO_UTF8` (last) are spread into `CONVERSIONS`; the table above has each. New kinds in `detect.js`:
`jsonl`, `ass`, `sbv`, `gpx`, `kml`, `geojson` (all in `TEXT_KINDS`, so typed text works), and `.tsv` reads as `csv`. Chain flags: the
separator change, UTF-8, both cuts and the favicon set are `chain: false`; EPUB to text costs 2 so routes to PDF and Word go through
Markdown. Routes this adds: EPUB to PDF or Word, KML to GPX, GPX to CSV or XLSX, HTML to Word through Markdown, SBV to VTT.
Pages (`core/more-pages-2.js`, `more-pages-3.js`, 21): html-to-markdown, csv-to-markdown, csv-to-html, csv-to-tsv, jsonl-to-json,
json-to-jsonl, fix-text-encoding, epub-to-txt, epub-to-pdf, epub-to-html, epub-to-markdown, ass-to-srt, sbv-to-srt,
favicon-generator, trim-audio, trim-video, gpx-to-geojson, kml-to-geojson, kml-to-gpx, gpx-to-csv, geojson-to-gpx.
Tests: `tests/node/convert-text-more.test.mjs`, `convert-media-geo.test.mjs`; `tests/convert/text-more.test.html` (an EPUB made by
`epub-fixture.js`, to text, Markdown, HTML and PDF read back), `media-geo.test.html` (favicon ZIP drawn back, a WAV cut and decoded,
real GPX and KML, the pages), `cut-ff.test.html` (Cut video with the real ffmpeg core).
