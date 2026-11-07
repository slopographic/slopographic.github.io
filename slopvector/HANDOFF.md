# SlopVector: handoff

An Illustrator-style vector editor at `/slopvector/`. Plain scripts (no modules, no build), loaded in order from `index.html`. Every source and test file is at most 300 lines.

## Layout
- `js/geom/`: math, beziers, path data, hit-testing, curve fitting, boolean ops (Pathfinder), slopify. Exposed as `window.SVGeom`.
- `js/core/`: state, document tree, object factories (`SV.mk`), SVG output, render, overlay, history (`SV.commit`, undo/redo), hit-testing.
- `js/tools/`: pointer dispatch, select, direct, pen, draw, misc tools, commands (`SV.cmd`), keyboard.
- `js/io/`: SVG export/parse/import/open, PDF writer, file pickers, offline single-file builder, `hub.js` (Slop Hub).
- `js/ui/`: actions registry (`SV.runAction`), menubar, control bar, dock/panels, layers, colour, status, dialogs, context menus, sample doc, init.
- `css/`: themes (pro / light / classic 98), chrome, canvas, panels, popups, classic, responsive (which also maps `--sui-*`).

## Shared kit
- **SlopUI** (`../shared/slopui.js`) handles every dialog (`UI.dialog` is a thin adapter: `js/ui/dialogs.js`), prompt (Save As), toast (`UI.toast` / `SV.toast`), file picker, download, context menu (`js/ui/ctxmenu.js`) and **menubar dropdown** (`js/ui/menus.js`).
  - The menubar keeps only its buttons. Each dropdown is a `SlopUI.menu` tagged `.sv-dropdown[data-menu=…]`.
  - Hovering another button switches menus. Left and right arrows move between menus. Escape closes.
  - `UI.menuItems(label)` returns a menu's SlopUI items.
  - While a SlopUI menu has focus, app shortcuts are suppressed (`UI.handleGlobalKey`).
- The only app-owned popover left is the colour picker shell (`js/ui/color.js`: position, outside click, Done / None / Gradient…). Its body is the shared picker (`shared/color/`, see Colour below).
- **SlopHub** (`js/io/hub.js`):
  - `register('vector')`.
  - File ▸ Open from Slop Drive… and Place from Slop Drive…: SVG opens as a document, raster images open or place as image objects.
  - File ▸ Send to: sends the SVG, or a 2× PNG, to every app in `SLOP_APPS` that accepts it.
  - `?drive=<id>` launch via `consumeLaunch()`, which then strips the query string.

## Guides (`js/ui/guides.js`, uses `shared/guides/`)
- Document guides stay `S.doc.guides = { h: [y…], v: [x…] }` (part of every history snapshot). Rulers drag guides out (`ui/status.js`), the Selection tool moves them (`tools/select.js`), and `SV.buildSnap` (`core/hittest.js`) snaps to them when Show Guides and Snap to Guides are on.
- View ▸ New Guide Layout… (Alt+Shift+Ctrl+;, also in Window) opens the shared GuideGuide-style panel: Form / Notation / Intervals, presets, live preview (`S.guidePreview`, drawn by `core/overlay.js`), Apply / Replace / Clear as single undo steps (`SV.applyGuideList`, `SV.clearGuides`). Targets: Artboard or Selection bounds.
- Also: New Guide… (units), Guides from Selection, Snap to Guides (Shift+Ctrl+;, pref `snapGuides`).

## Commands and shortcuts (`js/ui/commands.js`, uses `shared/commands/`)
- Every action in `SV.actions` is a SlopCmd command `sv.<action id>`; tools are `sv.tool.<id>`; canvas keys (X and Shift+X swap fill and stroke, D sets the defaults, / comma, period, arrow nudges) are `sv.paint.*`, `sv.nudge.*`. `sv.focus.toggle` (fill / stroke focus) has no key now; the fill and stroke chips do it. Menus and context menus label items with `UI.actKey(a)`, i.e. the person's own binding.
- Commands are gated off while the text editor, a SlopUI menu or the colour picker has the keys. Copy/Cut/Paste keep their native events (no SlopCmd keys). With SlopCmd active, `tools/keys.js` handles only Space, Esc, Enter, clipboard and shape-drag arrows.
- Help ▸ Search Commands… (⌘K), Help ▸ Keyboard Shortcuts (SlopCmd's editor; F1), and a search button in the menubar.
  ⌘K is only Search Commands (as in every app); Edit ▸ Preferences… is ⌘, (it was bound to ⌘K by mistake). The legacy keymap
  (no SlopCmd) maps ⌘K to Search Commands too.

## Colour and eyedropper (`shared/color/`, `js/ui/color.js`, `js/tools/eyedrop.js`)
- **Picker body** is `SlopColorPicker` (`shared/color/picker.js`, used by PhotoSlop too): saturation-brightness square, hue and alpha bars, hex / RGB / HSB / alpha fields, a Recent row (`localStorage` `slopvector.recentColors`, 12 entries) and the palette row. Every change applies at once through `SV.applyStyle(which, hex, { commit: false })`; the undo step is written when the popover closes.
- **Alpha** is stored in the paint string as `#rrggbbaa`. The SVG writer splits it into the colour plus `fill-opacity` / `stroke-opacity` (`core/svgout.js` `paintAttr`). PDF export writes the colour opaque (`io/pdf.js` reads six hex digits). Gradient stops keep their own alpha field, so their picker is RGB only.
- **Opening the picker:** click the fill or stroke chip twice (the first click focuses it), right-click either chip, or Window ▸ Fill Colour… / Stroke Colour….
- **Eyedropper** (`js/tools/eyedrop.js`, key I): a click sets the fill of the selection to the colour under the pointer; Alt sets the stroke; Shift copies the object's whole appearance (the old behaviour). **Limit:** the colour is the object's solid fill, else its stroke, taken from the hit test (a gradient gives its first stop). It is not read from the rendered pixels: the artwork is SVG, so a pixel read per pointer move would be too slow. Nothing under the pointer is a toast and no change. There is no loupe and no Alt-to-sample on the drawing tools in Vector (PhotoSlop has both).
- **Keys:** X swaps fill and stroke (was focus toggle; Shift+X still swaps).

## Tests (`node tests/run.mjs vector`): 99 pass, 2 fail across 10 pages (the 2 are the offline builder tests in `tests/slopvector/io.test.html`; they fail on a clean HEAD too, because `shell/shell.js` has a `<script src=` comment)
- `tests/slopvector/boot.js`: shared boot. It waits for the app iframe and exposes `W, SV, G, IO, UI, HUB` and helpers.
- `geom.test.html` (16), `model.test.html` (16), `io.test.html` (11), `ui.test.html` (17), `guides.test.html` (8), `commands.test.html` (6). `color.test.html` (8: the eyedropper fill, Alt for stroke, the hex field and hue bar, alpha and its SVG export, recent colours, X and D, right-click and the Window entries). Each page also runs the boot test.
- The offline builder strips `shared/guard.js` (hosted-site reload guard).
- Gotchas:
  - SlopUI fades closed dialogs for about 140 ms. The UI tests' `closed()` waits until `.sui-back` has left the DOM, so lookups never hit the old dialog.
  - Inside an inline `<script>` in a test page, write `<\/script>`, never a literal closing tag.

## Smoke-tested
Desktop (1440×900) and phone (390×844) in Chromium, with zero console errors:
- Menubar dropdown.
- Document Setup dialog fits the screen.
- Right-click menu.
- Send to PhotoSlop, and `?drive=` launch back into Vector.

## Owner requests not done yet (next steps, in order)
These were asked for together with the PhotoSlop layer work; none of the Vector part is started.
1. Check the "property change doesn't update" bug for text objects: fill colour, font, size and alignment, on the canvas and in the inspector. Fix it with a Playwright reproduction and a regression test (same approach as `photoslop/js/type/props.js`).
2. Layers panel: double-click a row opens an object/layer options dialog (name, colour, lock/visibility, opacity/blend, appearance: several fills and strokes, drop shadow and blur effects). Double-click the name renames it inline.
3. Canvas: double-click a text object to edit its text; double-click a group to enter isolation mode (Esc leaves it); double-click a path to switch to Direct Selection / point editing.
4. Register these as SlopCmd actions (`SV.actions` → `js/ui/commands.js`) and add tests under `tests/slopvector/`.

## Test note
`io.test.html` 'offline builder › inlines the app…' currently fails, with a console error ("Cannot use import statement outside a module"). The cause is an uncommitted change by someone else: `slopvector/index.html` now loads `<script type="module" src="../shared/buddy/boot.js" data-offline="strip">`. The offline builder inlines module scripts as classic scripts. Fix the builder (strip `data-offline="strip"` scripts, or keep them as modules), or drop that tag. Without the tag the suite was 72/73 at the start of this session; the one failure was 'builds SVG and 2× PNG payloads', which timed out on a loaded machine.

## Known / next
- The phone menubar is wider than 390 px; the last menus scroll horizontally inside the bar.
- Google Fonts are linked as in the other apps; the offline build strips them and falls back to system fonts.
- Ideas: ArrowRight to open SlopUI submenus (that belongs in shared), and a touch-friendly long-press context menu.

## Slop Drive (shared storage)

- **Save (Ctrl+S)** writes the SVG back to the Drive file the document was opened from (`HUB.linked`, via `SlopHub.update`, falling back to `put` with the same id). The first save asks for a folder. Any new document (New, Open, recovery, sample) unlinks. `File ▸ Save As…` still downloads. Without the hub, Save downloads as before.
- Open/Place from Drive, `?drive=` launch and `register('vector')` as before. Tested in `tests/slopvector/ui.test.html` ("Save writes back…").

## Rounded rectangle corners (`js/core/corners.js`, `js/ui/corner-controls.js`, `shared/shapes/`)

- A `rect` keeps `rx` (its single radius, or the largest corner when the corners differ). When the corners were set one by one it also keeps `rc = [tl, tr, br, bl]`. `SV.rectRadii(o)` returns the four values.
- Control bar and Properties share one control: a linked field (one value for all corners) and a link button that shows four fields (TL, TR, BR, BL). The link state is `S.shape.cornerLink`. Each change is one undo step (`SV.applyCorner`).
- SVG export writes a rounded rect as `<path>` with circular arcs from `SlopShapes.svgPath`. A zero-radius rect stays `<rect>`. The object stays `type: 'rect'`.
- Limits: direct-select anchors and hit testing (`G.rectSubs`) still use the single `rx`, the largest corner, so they only approximate per-corner shapes. SVG import reads one `rx` only.
- Tests: `tests/slopvector/corners.test.html`. Node geometry tests: `tests/node/shapes-rounded.test.mjs`.

## Clipping masks (`js/core/clipmask.js`, `js/tools/clipmask.js`)

- **Model:** a clipping mask is a group with `clip: true`. Its last child (the top of the stack) is the clip shape; the
  children before it are the clipped objects. Z-order is array order (index 0 is the bottom), so the shape sits above what it
  clips. The shape is not drawn; the group draws its content only inside the shape. It is saved in the document like any group.
- **Make (Object ▸ Clipping Mask ▸ Make Clipping Mask, Ctrl/Cmd+7):** the topmost selected object is the shape.
  With several selected objects in one stack, the selected ones below it are clipped; with one selected, every sibling
  below it in that stack is clipped. The group takes the place of the lowest member. Nothing below the shape: a toast.
  One undo step. Release (Ctrl/Cmd+Alt+7): each selected clipping mask becomes its objects again, shape on top.
- **Geometry:** the group's bounds, selection box and hit testing use the clip shape's area (`docSubs`, `objBBox`
  and `hitObj` in `core/objects.js` and `core/hittest.js`). A click counts on the content only inside the shape.
- **SVG export** (`core/svgout.js`): a `<clipPath id="sv-clip-<groupid>">` in `<defs>` holds the shape (paint dropped, images
  become rects because `<image>` is not allowed in a clipPath), and the content sits in `<g clip-path="url(#…)">`, so the
  file stays editable. The group's transform and opacity stay on the outer `<g>`. Live canvas and PNG export use the same markup.
- **PDF** (`io/pdf.js`): the content is written between `q` and `Q` after the shape's path and `W n`.
- **Limits:** SVG import ignores `<clipPath>`, so an SVG with clip paths opens with the content unclipped. Nested clip
  groups work. The clip shape is not drawn and cannot be edited in place: release, edit, then make the mask again.
- **Tests:** `tests/node/slopvector-clip.test.mjs` (plan, apply, release, SVG and PDF strings) and
  `tests/slopvector/clip.test.html` (make, the picture before and after, hit testing, undo/redo and release, save, no-op, PDF).

## Phone layout (SlopSheet)
Under 900 px the dock is a drawer from the right, under the menu and control bars: `UI.dockSheet = SlopSheet.attach({ side:
'end', toggles: [#panelsToggle] })` in `buildDock()` (`js/ui/dock.js`; `shared/ui/sheet.js`, see `shared/ui/HANDOFF.md`). The
Panels button, Tab and Window ▸ Show/Hide Panels open and close it, Window ▸ a panel opens it; the shared ×, Escape, a tap
outside and a swipe right close it. The old `dock-open` class and the `.dock-head` bar with its × are gone; the keyboard
Escape (deselect) skips an Escape the drawer took. `shared/ui/sheet.js` is in the offline manifest. Test:
`tests/slopvector/phone-dock.test.html`.

## Assistant commands (`js/ui/ai-io.js`, `js/ui/ai-commands.js`)
Loaded on demand by `SlopCmd.prepare()` (`ui/commands.js` `SV.prepareAI`); all `sv.ai.*`, hidden, one undo step each, through
the app's own code (`SV.mk`, `SV.insertObj`, `IO.importSVGText`, `SV.cmd`, `SV.commit`). `new_document` (width, height,
background, name; replaces the drawing, destructive, Undo brings it back), `add_svg` (checked by `SV.ai.checkSvg`: no script,
foreignObject, on* handlers, javascript: or links other than #ids and data: pictures; imported as editable objects),
`add_shape` (rect, ellipse, polygon, star, line, path d; fill, stroke, width, opacity), `add_text`, `set_style`, `transform`
(move, scale, rotate), `select_objects`, `align`, `distribute`, `pathfinder` (union, minus, intersect, xor), `group`,
`ungroup`, `arrange`, `delete_object` (destructive), `export` (svg/png/jpg/pdf by `IO.exportSVG`/`rasterize`/`buildPDF`, to
Slop Drive through `shared/commands/sources.js` and/or a download), `undo`. Results give the bounding box and warn when it runs
past the artboard; `fit: true` shrinks and moves it inside. No headless operation: the writers read the app's own state
(`SV.state.doc`), so they need the app's page. Test: `tests/slopvector/ai-commands.test.html`.
