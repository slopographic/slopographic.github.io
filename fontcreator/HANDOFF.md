# Slop Font (fontcreator/)

A font editor in the browser: draw glyphs from scratch, trace handwriting (one picture per glyph, or a printed sheet
read back from a photo), draw from SVG, open a TTF, OTF, WOFF or WOFF2 to edit, kern pairs, try the font, and export
TTF, OTF, WOFF2 and WOFF with a CSS @font-face rule. Nothing is uploaded. Registry id `fontcreator` (shared/apps.js),
group creative; plain name "Font Creator", Swedish "Typsnittsverktyg". Project files: `.sfont` (JSON,
`application/x-slop-font`; Slop Drive's New ▸ Font makes an empty one, which opens as a new font).

## Layout

The suite's List · View · Panel (shared/frame, SlopFrame). List: the glyph grid (a character set, or every glyph in the
font; a box to add characters). View: three tabs (shared/ui/tabs.js): Draw (toolbar and canvas; a start card while
nothing is drawn), Kerning, Type test. Panel: Glyph (width, side bearings, Draw from SVG…, Trace a picture…, Copy from
a glyph…, Add an accent from…, Remove overlap, Delete; the stroke tool's pen; the snap grid), Characters (add a set,
keep only some: subset), Handwriting (print a sheet, read a filled one), Export (format, Copy CSS, Download project),
Font (names, weight, licence with a one-click OFL), Metrics; its foot: Download font (primary), Save to Slop Drive…,
Save project, Open in…. Phones (≤ 860 px): the grid is the page, a glyph opens over it with "‹ Glyphs", the panel is a
bottom sheet whose foot always shows.

## Files

| File | What |
|---|---|
| `js/core/charset.js` | character sets (Basic Latin, Latin-1, Latin Extended-A, digits…), glyph ids (`u0041`) and AGL names |
| `js/core/paths.js` | outlines: SlopVector's contour shape (`slopvector/js/geom`, `SVGeom`, reused, not copied), SVG path data in and out, opentype.js commands in and out, shapes, `orient` (holes by nesting), booleans and remove overlap (SVGeom.boolean + refit) |
| `js/core/model.js` | the project (info, metrics, glyphs, kerning): create, clean (files and the assistant), side bearings, kerning, subset |
| `js/core/sfnt.js` | sfnt tables read and written with check sums, the `kern` table (format 0), WOFF 1.0 wrap and unwrap |
| `js/core/ttf.js` | cubic → quadratic (within 0.5 unit), glyf, loca, maxp, hmtx for the .ttf |
| `js/core/build.js` | project → opentype.Font → OTF (CFF) and TTF (glyf swapped in), kern table added; WOFF; the CSS rule |
| `js/core/import.js` | font bytes → project (names, licence, metrics, encoded glyphs, kern table and GPOS pair kerning, formats 1 and 2) |
| `js/core/trace.js` | picture → contours (Otsu threshold, boundary walk with holes, smoothing, SVGeom curve fit, three placements) |
| `js/core/stroke.js` | centre lines → outline (round, square or flat ends; round, bevel or miter joins), for the Stroke tool and `draw_strokes` |
| `js/core/sheet.js` | the handwriting sheet: layout (A4 or Letter at 150 dpi), corner squares found in a photo, homography, cell cut-out |
| `js/state.js`, `js/store.js` | the one state; every edit through `edit(label, scope, fn)` (one undo step; scopes glyph, meta, project); kept in IndexedDB (`slop-fontcreator`) |
| `js/grid.js`, `js/editor/*.js` | the grid; the editor (view: camera, snapping, draft; draw; select; tools: pen, rectangle, ellipse, stroke; ops; toolbar) |
| `js/panel.js`, `js/panel-more.js`, `js/kerning.js`, `js/tester.js` | the panel; Kerning; Type test (FontFace with the built OTF) |
| `js/io/files.js`, `js/io/woff2.js` + `woff2-worker.js`, `js/io/svg-ui.js`, `js/io/trace-ui.js`, `js/io/sheet-ui.js` | intake and outtake; WOFF2 (Google's encoder and decoder, `vendor/woff2`, in a worker each); the three import dialogs |
| `js/commands.js`, `js/ai-commands.js`, `js/ai-commands-2.js` | Ctrl+K commands; app state, checkpoint and `snapshot` (a specimen picture for look_at_canvas); the assistant's commands with schemas |

Libraries: `vendor/opentype` (opentype.js 2.0.0, MIT) reads and writes fonts; `vendor/woff2` (wawoff2 2.0.1: Google woff2
and Brotli, MIT, wasm inlined) packs and unpacks WOFF2, loaded on first use (the service worker caches them then; they
are not in the precache list, 1.2 MB); `vendor/pdf-lib` makes the sheet's PDF (on first use). Core modules are UMD
factories: in a page they attach to `window.SlopFont`; in Node `tests/node/fontcreator-env.mjs` wires them.

## In and out

In: spec `fontcreator` (js/io/files.js): fonts open to edit (replacing the project, undoable), `.sfont` projects, SVG to
"Draw from SVG", pictures to "Trace a picture" (a picture with the sheet's corner squares offers to read the sheet).
Parts: `fontcreator.svg`, `fontcreator.trace`, `fontcreator.sheet`. Sources: Open…, drops on the page, ?drive= and
launchQueue. `fontcreator/` is in rule 4's STRICT list. Out: SlopUI.download, SlopHub.put, SlopOuttake.items.

## Assistant

`new_font`, `open_font`, `add_characters`, `draw_glyph` / `draw_glyphs` (SVG path data, font units y up by default),
`draw_strokes` (monoline glyphs from centre lines), `add_shape` (or cut it), `set_metrics`, `set_info` (license 'OFL'),
`set_glyph_metrics`, `add_kerning`, `path_operation`, `transform_glyph`, `copy_glyph` (accents), `remove_glyph`,
`clear_glyph`, `subset_font`, `select_glyph`, `show_view`, `export_font`, `get_glyph`, `get_css`. Each is one undo step.

## Tests

Node: `tests/node/fontcreator-core.test.mjs` (charset, model, paths, booleans, strokes, trace), `tests/node/fontcreator-export.test.mjs`
(TTF/OTF/WOFF/WOFF2 round trips through opentype.js: glyph count, metrics, names, kerning, outlines; an OFL font in and
out; the sheet layout and homography). Browser: `tests/fontcreator/app.test.html` (draw with the pen and shapes, undo,
side bearings, booleans, grid, kerning, type test, export, reload), `tests/fontcreator/import.test.html` (SVG, a traced
picture, a printed sheet read back, a font opened), `tests/fontcreator/ai-commands.test.html`, contrast sweep
`tests/a11y/sweep-40.test.html`.

## Limits

No hinting, no OpenType layout features written (kerning goes in the legacy `kern` table, which browsers and
HarfBuzz read; GPOS kerning is read on import), no variable fonts, no components (an accent is copied as outline).
Glyphs without a character are left out when a font is opened. Units per em are fixed after creation (no rescale).
The seeded "random font" starter waits for a shared sample module (shared/sample is not on testing yet).
