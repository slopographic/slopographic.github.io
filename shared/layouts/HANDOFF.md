# Workspace layouts (`window.SlopLayouts`)

Each app can be arranged for a kind of work: video editing, image editing, 3D, business, writing. A layout is chosen
from the homepage ("Choose a workspace"), from a Layout menu, or from the palette (⌘K, "Layout: …").

## Files (all ≤300 lines)
- `presets.js`: the data. `CATEGORIES` (id, name, blurb, apps) and `PRESETS` (id, category, name, apps, panels).
  A panel says `show`, `side` (left | center | right | top | bottom) and `size` (px; `null` = take the rest, and
  always `null` for centre). Top and bottom panels span the full width. Left, centre and right share one band of rows.
- `core.js`: pure logic, no DOM (Node tests load it). `validate`, `arrange` (the grid a preset gives), `pick`, `resolve`,
  and the envelope `{ v: 1, data }` (`readEnvelope`, `envelope`, `storageKey`).
- `layouts.js`: the DOM side. `mount`, `refresh`, `choose`, `reset`, `current`, `menu`. Registers `layout.<preset>` and
  `layout.reset` with SlopCmd when it is loaded.
- `layouts.css`: a laid-out root is a grid and drops its max-width.

## Using it in an app
1. Give the app's root and each panel an element, in the page's `<script>` order after `layouts.js`:
   ```js
   SlopLayouts.mount({
     app: 'slopcut', root: el('app'), phone: '(max-width: 760px)',
     fixed: { top: [topbar], bottom: [status] },        // rows the layout must leave alone
     sizeVars: { timeline: '--tl-h' },                    // a size the app already drives (its drag handle)
     panels: { bin: { el }, preview: { el }, timeline: { el }, insp: { el } },
     active: () => true,                                  // optional: when the layout applies
     release: () => {},                                   // optional: the app restores its own state
   });
   ```
   A panel may give `show(on)`. The module calls it to hide or show the panel. Without it, the module sets `display`.
2. Menu: `{ label: 'Layout', sub: SlopLayouts.menu('<app>') }`. It lists the app's presets, a check mark on the current
   one, and "Reset layout".
3. The app's own toggles keep working. PhotoSlop's Show / Hide Panels (Tab) sets `body.no-panels`; the adapter steps
   aside while it is set and watches the class.

## Panel ids per app
| App | Root | Panels |
|---|---|---|
| Slop Cut (`slopcut`) | `#app` | `bin`, `preview` (monitor), `timeline`, `insp`; fixed: top bar, status bar |
| PhotoSlop (`photoslop`) | `.main` | `canvas` (document area), `tools`, `panels` (Layers and the docked panels) |
| Slop 3D (`3d`) | `.workspace` | `outliner`, `viewport`, `inspector` |
| Invoices / Orders (`invoices`, `orders`) | `#main` | `list` (`#view-list`), `document` (`#view-edit`) |
| Slop CRM (`crm`) | `#main` | `list` (`#view-customers`), `detail` (`#view-customer`) |

A preset panel the app does not have is ignored. A panel the app has but the preset does not is hidden.

## Behaviour
- Presets per app: Slop Cut → Video editing; PhotoSlop → Image editing; 3D → 3D; Invoices and Orders → List and
  document; CRM → List and detail. Writing (Document and outline) has no app yet and is data only.
- **Storage**: `localStorage['slop.layout.<app>'] = { v: 1, data: { preset } }`. A bad or other-version envelope
  reads as nothing saved, and the app's default applies. Reset removes the key. Storage can throw, so every access is wrapped.
- **`?layout=`** at boot: a category (`video`, `image`, `3d`, `business`) or a preset id. It is saved for the app, and
  is ignored when it does not apply to that app.
- **Phone**: below the app's breakpoint, the module releases the grid and calls the `release` hook. The app's own CSS
  applies, so phones are unchanged.
- **Business apps** lay out only when the list and a record are both on screen: an open invoice or order (`#new`,
  `#i/<id>`), or the CRM wide split with a customer open. Other routes keep the one-view-at-a-time screens. Their
  routers call `SlopLayouts.refresh(app)` at the end of `show()`.
- **Slop Cut's timeline** follows `--tl-h`, so the drag handle still resizes it; the preset's 300px is the fallback.

## Known limits
- `service-worker.js` precaches an explicit list. The `shared/layouts/*` files are not in it yet. Regenerate it with
  `node tools/pwa-precache.mjs` and bump VERSION (the service-worker file is owned elsewhere).
- Panels in the business apps are whole views. A list-and-document layout does not split a single view.
- Sizes are the preset's; a window resize keeps them. There is no per-panel saved size yet.

## Tests
- `node tests/run.mjs layouts`: `tests/node/layouts.test.mjs` (presets valid, every category has a preset, arrangement,
  envelope and reset); `tests/layouts/slopcut-video.test.html` (picking Video editing from the menu puts the timeline
  along the bottom, saved envelope and reset, SlopCmd commands, drag variable); `business.test.html` (the list and the
  document side by side, and stepping aside); `home.test.html` (the homepage links resolve to presets).
