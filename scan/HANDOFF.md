# Slop Scan (scan/)

A document scanner: photos of pages (the phone's camera, the picker, a drop, a paste, Slop Drive or another app) become
one clean PDF. The page's edges are found, the page is made flat (a perspective warp), and a look makes it read like a
scan. Everything runs in the browser; nothing is uploaded. Registry id `scan` (shared/apps.js), group business, a tool.

## Layout

The suite's List · View · Panel (shared/frame, SlopFrame). List: the pages in PDF order (thumbnail, up, down, take
again, remove; Take photo and Add photos under them). View: one page, as Result (the flat page in its look) or Corners
(the photo with four handles to drag, a magnifier while one moves, Find edges, Whole photo). Panel: this page's look
(Original, Colour, Greyscale, Black & white, Photo), brightness, contrast, Apply to all pages; the PDF's name, page size
(Auto, A4, Letter), margins, JPEG quality with the size to expect, Turn new pages upright, Searchable text (OCR). Its
foot: Download PDF, Open in Slop PDF, Save as pictures, Open in… (with Save to Slop Drive); on a phone Download PDF and
More. Phones (≤ 860 px): the list is the page, a page opens over it (‹ Pages goes back), the panel is a bottom sheet
whose foot always shows.

## Files (all ≤ 300 lines)

| File | What |
|---|---|
| `js/core/geom.js` | Pure: homography (8 × 8 solve), apply, invert, corner order, area, convexity, hull, the largest quad in a hull, 0..1 quads |
| `js/core/detect.js` | Pure: grayscale → blur → Sobel → Otsu → edge pieces → hull → largest quad; a bright-paper candidate too. A quad counts only with edges along its sides and a contrast across them |
| `js/core/warp.js` | Pure: the flat page through the homography, bilinear |
| `js/core/filters.js` | Pure: integral images, the paper's light (block percentile, grown, smoothed) and dividing by it (shadows out), levels, Sauvola and Bradley, brightness and contrast, quarter turns, text orientation, the five looks |
| `js/core/page.js` | Pure: page sizes and margins in points, where a scan sits, the size estimate, the file name |
| `js/core/pages.js` | Pure: the pages and the PDF's settings, one list with listeners (a new page takes the look chosen last) |
| `js/render.js` | A photo's canvases (≤ 2400 and ≤ 1200 px), detection on a ≤ 400 px copy, the page rendered at a size (cached per page version) |
| `js/io.js` | In: the intake spec `scan` (HEIC through shared/heic when the browser cannot), camera (`SlopIntake.pick({ capture })`), retake. Out: PDF, Slop Drive, Slop PDF (SlopOuttake.send), JPG/PNG (a ZIP for several), the estimate |
| `js/pdf.js` | ES module, imported on first use: pdf-lib (vendor/pdf-lib), JPEG pages (PNG for black and white), the OCR text layer |
| `js/ocr.js` | The site's OCR (shared/ocr/engines.js and the scripts Slop PDF loads), loaded only when a searchable PDF is made |
| `js/editor.js`, `js/view.js`, `js/list.js`, `js/panel.js`, `js/main.js` | The corners, the view, the list, the panel, boot |
| `js/sample.js` | The sample photo (a letter on a desk, painted), for "Try it with a sample" and the tests |
| `js/commands.js`, `js/ai-commands.js` | Ctrl+K commands; the assistant's commands (new_scan, add_photo, set_page_style, set_corners, rotate_page, move_page, remove_page, export_pdf) and its state |

Shared pieces it uses or added: `shared/ocr/text-layer.js` (the invisible text, now also Slop OCR's), the `capture`
option of `SlopIntake.pick` and `SlopUI.pickFiles` (a phone opens its camera), `shared/tour/tours/scan.js`.

## Notes

- Corners are kept 0..1 of the photo, so one quad serves the 1200 px preview and the 2400 px export.
- The PDF is made again only after a change (io.js keeps the last one with a key of the settings and page versions).
- Black & white takes brightness and contrast before its threshold (lighter: less ink).
- Searchable text needs the OCR model on the device; without it the Get more dialog opens and the PDF waits.

## Languages

English and Swedish (`i18n/en`, `i18n/sv`); the other languages read English. The shared tables a new app needs in every
language (`seo.app.scan.*`, `seo.landing.scan.*`, `seo.reg.scan.*` in shared/seo/i18n, `ui.appdesc.scan` in
shared/i18n/ui/<code>/shell2.js, `prompts.scan.*` in shared/ai/i18n/<code>/office2.js) hold the English text in the
15 other languages, each line marked `// English until translated (Slop Scan)`: grep for it to translate them.

## Tests

`tests/node/scan-geom.test.mjs` (homography, order, hull, largest quad, page sizes, margins, estimate, the list),
`tests/node/scan-detect.test.mjs` (pages found in drawn photos: tilted, in perspective, blank, cut by the frame, none;
the warp; paper light; Sauvola and Bradley; the looks; turns; orientation), `tests/node/ocr-text-layer.test.mjs`,
`tests/scan/scan.test.html` (camera with capture, corners found, B&W, corners by keys and pointer, turns, order, a PDF
of N pages on A4, Slop PDF hand-over, pictures, retake, the assistant), `tests/scan/touch.test.html` (a phone, by touch).
