# shared/guides: SlopGuides

GuideGuide-style guides and grids for Slopographic apps (PhotoSlop, SlopVector). Classic scripts, no build, no dependencies (SlopUI is used for menus/prompts when present). Exposes `window.SlopGuides`.

Load in this order:
```html
<link rel="stylesheet" href="../shared/guides/guides.css">
<script src="../shared/guides/engine.js"></script>
<script src="../shared/guides/notation.js"></script>
<script src="../shared/guides/presets.js"></script>
<script src="../shared/guides/panel-tabs.js"></script>
<script src="../shared/guides/panel.js"></script>
```

## Model
- A guide is `{ o: 'v' | 'h', pos }` in document pixels (`v` = vertical line at x).
- A rect is `{ x, y, w, h }`: canvas, selection, artboard or layer bounds.
- Lengths are numbers in the current unit or strings with a unit: `10px`, `5%` (of the rect along that axis), `2mm`, `1cm`, `1in`, `12pt`. `dpi` (default 72, so 1pt = 1px) converts physical units.

## Engine (`engine.js`, pure, also loads under Node)
- `compute(rect, { unit, dpi, snap, margins:{top,right,bottom,left}, cols:{count,width,gutter}, rows:{count,height,gutter}, colMid, rowMid, midV, midH, edges, marginGuides, baseline:{step,offset} })`
- `intervals(rect, { x:{step,origin}, y:{step,origin}, unit, dpi, snap })`
- `snap`: `'off'` (exact), `'round'` (each guide to a whole pixel), `'distribute'` (whole-pixel tracks; the remainder is spread one pixel at a time, see `distribute(total, n)`).
- Helpers: `parseLen`, `toPx`, `fromPx`, `normalize`, `merge`, `toHV`/`fromHV` (SlopVector's `{h:[],v:[]}`), `nearest(targets, value, tol)`.

## Notation (`notation.js`)
`notation(text, rect, { unit, dpi, snap })` returns `{ guides, errors:[{line,msg}] }`.

| Syntax | Meaning |
|---|---|
| `\|` | a guide |
| `~` | wildcard: wildcards share the leftover space |
| `10px 5% 2mm 1in 12pt` | a fixed space |
| `(\| ~ \|)*4`, `\|*3` | repeat a group / item |
| `(\|20px)*` | fill: repeat a fixed group as many times as fit |
| `$c = \| ~ \|` then `$c*3` | variables |
| `( v )` `( h )` `( hp, 10px, 10px )` | end options: columns/rows, `p` = whole pixels, start/end insets |

Each line is its own grid; `#` starts a comment. `formToNotation(form)` converts a Form setup.

## Presets (`presets.js`)
Built-ins (`PRESETS`): 12-column web, 8-pt grid, golden ratio, rule of thirds, centre cross, edges + 5% margins, 4 × 4 modular. Custom presets live in localStorage (`slopguides.presets.v1`): `addPreset`, `removePreset`, `loadCustom`, `exportJSON`, `importJSON`, `presetGuides(preset, rect)`.

## Panel (`panel.js`, `panel-tabs.js`, `guides.css`)
```js
const p = SlopGuides.openPanel({
  title: 'Guides', stateKey: 'slopguides.state.myapp',
  targets: [{ id: 'canvas', label: 'Canvas', rect: () => ({ x: 0, y: 0, w, h }) }],  // rect() → null = unavailable
  dpi: () => 72,
  preview(guides) {},            // live preview (null = stop)
  apply(guides, { mode }) {},    // 'add' | 'replace': commit ONE history step
  clear() {}, onClose() {}, toast(msg) {},
});
p.close(); p.refresh(); p.guides(); p.set(patch); SlopGuides.panel // the open panel or null
```
A floating, draggable, non-modal panel (a bottom sheet on phones), themed with SlopUI's `--sui-*` tokens and the Windows 98 themes. Tabs: Form / Notation (with syntax help and examples) / Intervals. Enter applies, Escape closes. The state is remembered per app.

Tests: `node tests/run.mjs tests/guides`.
