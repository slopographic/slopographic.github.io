# Fonts and "Get more": handoff

Two things ship together: a bundled set of open-licence fonts that every editing app can use offline, and an
opt-in "Get more" that downloads third-party font packs. Both feed one shared font picker.

## Files

| Path | Role |
| --- | --- |
| `shared/fonts/library/` | Bundled WOFF2 faces, one `LICENSE` per family (SIL OFL 1.1 text), and `index.json` (family, style, weight, file, licence, source URL). About 4.1 MB. |
| `shared/fonts/picker.js` | `window.SlopFonts`: the one reader of `index.json` (`bundledIndex`), loads a family with `FontFace`, `attach(select)` fills a `<select>` and adds the **Get more…** and **Fonts…** buttons, and `el` (the DOM helper the panel uses). |
| `shared/fonts/pdf-runs.js` | `window.SlopPdfRuns`: writes one run of text into a pdf-lib page as positioned glyphs (fontkit's GPOS offsets kept, unlike `drawText`), maps glyphs with no character to U+034F in ToUnicode, adds ActualText for shaped runs, and fixes fontkit 1.1.1's CFF subset header (`embed`/`fixCff`). Used by Slop Docs (PDF export) and Slop PDF (text annotations). Tests: `tests/node/fonts-pdf-runs.test.mjs`, `tests/pdf/intl.test.html`, `tests/docs/pdf.test.html`. |
| `shared/fonts/catalog.js` | `window.SlopFontCatalog`: every family the app can use (bundled, downloaded, and the person's own files, `source: 'own'`), faces by weight and style, PostScript name parsing, the closest bundled family, and `addUserFile` (a font file the person owns). |
| `shared/fonts/panel.js` | `SlopFonts.openPanel`, `SlopFonts.check`, `SlopFonts.askOnce`: the Fonts panel and the missing-font check (adds to `window.SlopFonts`; loaded by the picker on first use). |
| `shared/fonts/missing.js` | `window.SlopFontCheck.ask(needs, uses)`: a thin shim over the panel, kept for the PDF editor's prompt (same buttons, same answers). |
| `vendor/fontkit/fontkit.min.js` | `@pdf-lib/fontkit` 1.1.1 (MIT), bundled for browsers and loaded on first use by `SlopFontCatalog.fontkit()`. pdf-lib needs this build: fontkit 2.x has a different subset API. |
| `shared/library/packs.json` | The one config file for packs: the allowed download hosts and the pack list. |
| `shared/library/manifest.js` | Pack rules and the SHA-256 and size check (`window.SlopLibraryManifest`, also `module.exports` for Node tests). |
| `shared/library/store.js` | IndexedDB store `slop-library` (`window.SlopLibraryStore`). |
| `shared/library/get-more.js` | The Get more dialog (`window.SlopLibrary`). |
| `tests/node/font-library.test.mjs` | Manifest, hash, licence, and bundled-font checks. |
| `tests/shared/font-library.test.html` | Browser test: bundled families in the picker, licence shown before any download (network mocked). |
| `tests/fonts/font-panel.test.html` | Browser test: the panel's rows and statuses, drop a TTF, use the closest font, the picker's Fonts… entry, reopen after Close or Escape. |
| `tests/fonts/font-check.test.html` | Browser test: `check` (the missing list and packs), Download from the library (nothing until confirmed), `askOnce` once per document, and the `SlopFontCheck.ask` contract. |
| `tests/fonts/mock.js` | Test helper: `packs.json` from memory with one test pack, counted pack downloads, `FontTest` (a Barlow file from the PDF fixtures, drop and pick, removal of the person's own fonts). |

## Bundled fonts

Twelve families, Latin and Latin Extended subsets, outlines unmodified, from the Google Fonts repository
(`https://github.com/google/fonts/tree/main/ofl/<family>`): Inter, Roboto, Open Sans, Lato, Montserrat,
Playfair Display, Merriweather, Oswald, Source Sans 3, Nunito, Raleway, Space Mono. Variable files where the
family has them. Every family folder holds its OFL `LICENSE`. Nothing is loaded from a CDN at run time.

To rebuild: download each file from `https://raw.githubusercontent.com/google/fonts/main/ofl/<dir>/`, subset to
Latin and Latin Extended with `fontTools` (`subset.Subsetter`, `flavor = "woff2"`), write the entries to
`index.json` with a `category` (`sans`, `serif` or `mono`), and keep the family names equal to the `BUNDLED` list
in `picker.js` (the Node test checks this).

## Fonts for every app: one list, the Fonts panel, the missing-font check

One font list: `index.json` (bundled, read only by `SlopFonts.bundledIndex()`) plus the installed packs and the person's
own files in IndexedDB. `SlopFontCatalog.families()` is the list; the picker and the panel read it. The picker has no family
names of its own (a Node test checks this). The one exception is the closest family per category (`CLOSEST` in
`catalog.js`: Source Sans 3, Merriweather, Space Mono, and Oswald for a narrow sans), which must be a bundled family with an
embeddable copy.

- **`SlopFonts.openPanel({ fonts, standard, title, note, closeLabel, library, onUse, onAdd, onClose })`** opens the Fonts panel
  and returns `{ close(notify) }`. `fonts` are the names the document uses (listed first, each with a status: *Built in*,
  *Bundled*, *Downloaded*, *Your own file*, or *Missing*). `standard` names are built in and never missing. Below them the
  library lists every family the app can use. Per missing family: **Download from the library** (opens Get more on that
  pack's confirmation; nothing downloads until confirmed there), **Drop your own font…** (on the row, or the footer; TTF,
  OTF or WOFF, stored like a pack, `licence: 'user'`), and **Use the closest font instead** (`onUse({ family, use })`).
  `onAdd({ family, how, row })` fires when a font is installed (`how`: `'library'` or `'file'`; `row` is the missing family
  it answers). `onClose()` fires when the person dismisses it. The panel reopens at any time, after Close, Escape or a
  click outside it. One panel is open at a time.
- **`SlopFonts.check(names, { standard })`** resolves the names that are neither built in nor installed, as
  `[{ family, closest, pack, category }]` (`pack` is `{ id, name }` or `null`). A name is listed once.
- **`SlopFonts.askOnce(documentObject, names, opts)`** opens the panel the first time a document object is checked and a
  family is missing; a second call for the same object does nothing. Pass a fresh `{}` per opened document (not the
  document that undo replaces). The app's **Fonts…** entry always opens the panel.
- **Picker entries.** `SlopFonts.attach(select, opts)` returns `{ button, fontsButton, refresh, set }`: **Get more…** and
  **Fonts…**. `opts.docFonts()` gives the document's names to the panel (default: the select's value). The buttons are
  inserted after the select when it is in the page; otherwise the app places `button` and `fontsButton` itself.
- **`SlopFontCheck.ask(needs, uses)`** (`missing.js`) keeps the PDF editor's prompt: a Map of family to `{ family, how }`, or
  `null` when the edit is cancelled. It is a shim over `openPanel`.
- **Your own files.** `SlopFontCatalog.addUserFile(file)` reads a TTF, OTF or WOFF with fontkit and stores it in IndexedDB
  like a pack (`kind: 'font'`, `licence: 'user'`, id `user-<family>-<sha8>`). It then appears in every panel and picker as
  *Your own file*. WOFF2 is refused for files you add: fontkit cannot subset it, so a PDF could not embed it.
- **Closest family.** `SlopFontCatalog.closestFamily(name)` by category (`guessCategory`): Source Sans 3 for sans,
  Merriweather for serif, Space Mono for mono. A sans whose name says condensed, narrow or compressed (Barlow Condensed,
  Arial Narrow) takes Oswald, so its lines stay about as long. Oswald's embeddable copy is `oswald/oswald-400-normal.ttf`
  (Regular, instanced from the Google Fonts variable file with fontTools, same Latin subset as the other copies).
- **Embedding.** A face is embedded in a saved PDF only as TTF, OTF or WOFF. A bundled family therefore names its
  embeddable copy in `index.json` (`"pdf"`): Source Sans 3, Merriweather, Space Mono and Oswald today (Regular, Latin subsets,
  instanced from the Google Fonts variable files with fontTools). Bundled WOFF2 faces remain the screen copies.
- **Barlow.** `packs.json` lists "Barlow and Barlow Condensed": eight static TTFs from `google/fonts` (`main` branch),
  each with its SHA-256. A file that changes upstream is refused and nothing is stored.
- **Office-compatible fonts (`metric-compatible`).** Carlito, Caladea, Arimo, Tinos and Cousine, Regular, Bold, Italic and
  Bold Italic (static TTF, so a PDF embeds the right weight), from `slopographic/cdn` `packs/metric-compatible/v1`. Each file
  carries `metricFor`: the Office font it has the same character widths as (Calibri, Cambria, Arial, Times New Roman,
  Courier New). Once the pack is installed, a name in `metricFor` counts as installed and is set in that family:
  `SlopFontCatalog.standIn('Calibri')` is `'Carlito'`, and `hasFamily`, `pickFace` (so a saved PDF embeds Carlito) and
  `packFor` use it. `SlopFonts.load('Calibri')` registers Carlito's faces under the name Calibri, so the screen matches. The
  picker lists the family as "Carlito (Calibri)", a document value of Calibri reads "Calibri (set in Carlito)", and the Fonts
  panel's Calibri row says it is set in Carlito. Names match without regard to case. Slop Docs keeps its own wider alias list
  (`docs/js/fonts/registry.js`) for its bundled copies of these families.

## Rules for "Get more"

1. **Downloads happen only on click.** Opening the dialog reads `packs.json` and nothing else. A pack downloads
   only after its Download button and then the confirmation button. The confirmation shows the licence and size
   and the hosts. Nothing downloads on load, on a timer, or when a font is picked.
2. **Hosts.** A pack file is either `"cdn": "<path>"` in the Slopographic cdn repository (served from jsDelivr, then GitHub,
   at the release tag in `shared/cdn/assets.js`; see shared/cdn/HANDOFF.md), or an `https://` URL on a host in `packs.json`
   `hosts`. The list today is `raw.githubusercontent.com` (Google Fonts). Exact host match only (no wildcard, no sub-domains). A
   redirect that ends on another host is refused. Add a host here only after review, and only for a project that
   publishes its font files openly.
3. **Licences.** A pack declares one of `OFL-1.1`, `Apache-2.0`, `MIT`, `CC0-1.0`. Anything else is dropped before
   the dialog shows it.
4. **Files.** Only font files (`.woff2`, `.woff`, `.ttf`, `.otf`). Each entry needs its exact byte `size` and its
   lowercase `sha256`. Optional `metricFor`: one to four font names the file has the same widths as (see the Office-compatible fonts above). Every file is verified before anything is stored; a pack is written in one IndexedDB
   transaction or not at all. Requests carry no credentials.
5. **Storage.** IndexedDB `slop-library` only (`packs` and `files` stores). Nothing goes into localStorage.
   Remove a pack from the same dialog.

Adding a pack: list it in `packs.json`. Each file's `sha256` is the digest of the exact bytes at its URL. Compute it
with `sha256sum`, and set `size` to the byte count. Set the pack `size` to the sum of its file sizes.

```json
{ "id": "example-sans", "name": "Example Sans", "licence": "OFL-1.1", "licenceUrl": "https://openfontlicense.org",
  "description": "Regular and Bold.", "size": 123456,
  "files": [ { "name": "ExampleSans-Regular.woff2", "url": "https://raw.githubusercontent.com/<owner>/<repo>/<ref>/ExampleSans-Regular.woff2",
               "size": 60000, "sha256": "<64 hex>", "family": "Example Sans", "weight": "400", "style": "normal" } ] }
```

With no packs listed, the picker button reads "Get more (no packs listed)" and the dialog says so.

## Where the picker is used

- **PhotoSlop**: type layer font (`photoslop/js/type/props.js`): Fonts… next to Get more…. The once-per-document check is
  not wired (its text does not load picker fonts yet).
- **SlopVector**: control bar and Type menu (`js/ui/binds.js` `fontSel`, `js/ui/menus.js`): Fonts… in both.
- **SlopCut**: title font (`js/ui/insp-clip.js`): Fonts… next to the select. Opening a project asks once about its title fonts
  that are missing (`js/io/project.js` `PJ.load`; standard names come from `M.FONTS`).
- **SlopLabel**: text Family and barcode text font (`js/ui/props-types.js` `familySelect`): Fonts… next to the select. Library
  families render on screen; PDF and ZPL output use the Sans base-14 faces because the library faces are not embedded there.
- **Effects**: text layer font (`js/ui/props.js`): Get more… and Fonts… (inserted by `attach`).
- **Slop Docs, Slop Slides, Slop Press: your own files only, kept in the document.** The Fonts panel's "Your own file" adds a
  TTF or OTF to the open document (`doc.fonts` in Docs and Slides: `{ family, weight, italic, file, data }`, data as a data URL;
  Press keeps its files in `doc.assets`). The app registers it with its engine and calls `SlopFontCatalog.setDocumentFonts(list,
  { only: true })`, so the catalogue lists it as "own" and the panel shows no other font. Dropping a file on a missing row uses it
  for that family name. WOFF and WOFF2 are refused with a message that names the app (`readFontFile(file, app)`). Library
  downloads stay off: the engines read TrueType and OTF bytes, not WOFF2. Slop Docs and Slop Slides have no PDF export yet, so
  their files are shown on screen and kept in the file; Slop Press embeds them in its PDF. Press's own "Load Font File" uses the
  same check.
- **Slop Tables and Slop Notes: no font UI** to wire.

## Offline builds and the service worker

- The picker tag carries `data-offline="strip"`. The single-file offline build drops it, and each app keeps its
  plain font list there.
- `tools/pwa-precache.mjs` lists the picker, the catalogue, `panel.js`, `missing.js`, the library scripts, `index.json`,
  `packs.json` and every bundled file. Run `node tools/pwa-precache.mjs` and bump `VERSION` in `service-worker.js` to refresh the precache. This
  handoff does not edit `service-worker.js`.

## Tests

```
node tests/run.mjs font-library        # Node tests and the shared browser test page
node tests/run.mjs fonts/              # the Fonts panel and the missing-font check (tests/fonts/)
node tests/run.mjs pdf/pdf-text       # includes the PDF edit-text font tests (tests/pdf/pdf.spec-edit-fonts.js)
```

## Brand family (the site's own type: Slopographic Sans, Serif, Mono and Condensed)

The site's tokens (`style/base.css`: `--sans`, `--serif`, `--mono`, `--cond`) name the brand family first. It is built
from the OFL fonts the site already used, changed and renamed (OFL 1.1 allows both; none of the upstream licences names
a Reserved Font Name, and `build.py` checks again), so the metrics stay those of the upstream fonts and the existing
`* Fallback` faces keep the layout still while it loads.

| Path | Role |
| --- | --- |
| `tools/fonts/specs/slopographic.json` | The font spec: family name, roles (upstream source, axes, italic, kept features), the alternates made the default, the i/j dots, the stylistic sets, the ligatures, the Private Use Area brand marks and their drawings. |
| `tools/fonts/build.py` | `python3 tools/fonts/build.py <spec> <out dir>`: builds a spec (needs `tools/fonts/requirements.txt`, pinned). Sources: `tools/fonts/sources.json` (google/fonts at one commit, SHA-256 each). Modules: `assemble.py` (one face), `ops.py` (design changes), `varglyph.py` (glyphs at every master, gvar deltas solved), `shapes.py` (drops, drips, drawings), `layout.py` (GSUB), `naming.py` (names), `output.py` (subsets, fallbacks, OFL.txt, FONTLOG.txt, zip). Deterministic: a rebuild gives the same bytes. |
| `shared/fonts/brand/` | The built family: `faces.json` (the manifest), `<role>-<style>-<subset>.woff2` (the site's latin and latin-ext ranges), `OFL.txt`, `FONTLOG.txt`, `<slug>-fonts.zip` (full TTFs and both texts). Never edited by hand. |
| `tools/fonts/css.mjs` | Writes the brand-font block of `fonts.css` from the manifest (`node tools/fonts/css.mjs`, `--check`), and gives the token marker values. |
| `typeface/` | The typeface page (`/typeface/`): every style and weight, the sets next to the default, the drip ligature, the marks, the Latin set, a tester and the download. It reads the manifest, so it names no family. Linked from the homepage footer. |
| `shared/fonts/picker.js` | The font pickers list the brand family next to the bundled library (from the manifest). |
| `tests/node/brand-font.test.mjs`, `tests/fonts/brand-font.test.html` | Names, licence, sizes, CSS block and tokens; every style loads, the tokens resolve, the picker and the page. |

What makes it ours: drop-shaped dots on i and j (all four), a single-storey a and a flat-top 3 in the Sans (ss01 and
ss02 bring the upstream forms back, ss03 round dots, ss04 open digits), a discretionary "slop"/"Slop" ligature whose
drips hang from the l and the o and follow the weight axis, and the Slopographic drop mark (U+E000). Only a plain brand
mark goes into a font (`"kind": "mark"`): a glyph in an OFL font is OFL, and a mascot is all-rights-reserved art, so
Sloppo (or a profile's mascot) never goes in. `build.py` and the white-label build refuse a spec that tries
(`tools/fonts/spec-rules.mjs`, the spec's `"mascots"` list and the profile's mascot name).
Weights: Sans 300-900 and Condensed 300-900 (width 62-100) with italics, Mono 400-800 with italic, Serif Regular and
Italic. Every file is no larger than the upstream web font it replaces (the test checks).

To change the design: edit the spec, run `build.py` (Python 3.10+, `pip install -r tools/fonts/requirements.txt`), then
`node tools/fonts/css.mjs`. A white-label profile has its own spec and built folder (`"font": { "spec", "dir" }`,
`tools/whitelabel/font.mjs`, brand/README.md); a build of it ships that family as `shared/fonts/brand/` and never this one.
