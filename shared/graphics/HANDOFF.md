# Shared graphics library — handoff

`shared/graphics/icons.js` exposes `window.SlopGraphics`: an animated graphics library as plain SVG path data.
Any app can load it (no CDN, no build, no DOM needed to read the data). SlopCut uses it; Reel Remix and the others can use it later.

## API
- `SlopGraphics.list()` → `[{ id, name, group, groupId, paths }]`, a copy of the library. `name` and `group` are read from
  the shared tables at each call (`ui.graphics.<id>`, `ui.graphics.group.<groupId>`, `shared/i18n/ui/<code>/graphics.js`).
- `SlopGraphics.get(id)` → one shape, or `null`.
- `SlopGraphics.svg(id, { color, stroke, size })` → a standalone `<svg>` string (`currentColor` by default).
- `SlopGraphics.ANIMS` → `[[id, label]]` for `draw`, `pulse`, `bounce`, `pop`, `none` (a getter; labels `ui.graphics.anim.<id>`).
- `SlopGraphics.STROKE` → stroke width in the 100 box (7).

## Shapes (id: meaning)
- `arrow`: arrow that points at a spot (shaft and head).
- `circle`: hand-drawn circle highlight that overshoots its start.
- `box`: rounded box outline.
- `underline`: wavy underline.
- `counter`: rounded frame for a number counter. The app writes the number (SlopCut counts up to the clip's value).
- `check`: check mark.
- `speech`: speech bubble with a tail.
- `burst`: star burst, eight rays.

## Geometry rules
- Each path is one sub-path in a 100 × 100 box (y down), stroke-only (no fills), so it can be drawn with a canvas
  `Path2D` and a dash pattern. The draw-on animation dashes each sub-path by its measured length, so all sub-paths
  of one shape draw in step.
- Apps measure the lengths themselves (SlopCut uses `getTotalLength` on a hidden SVG path).

## Using it in SlopCut
- A graphic is a clip of kind `graphic` with `gfx = { id, color, size, anim, value }`. `size` is the fraction of the
  frame height, `value` is the counter's target. The renderer is `slopcut/js/render/graphics.js` (`SE.gfx`).
- Animations are clip-relative: `draw` (strokes draw on over about half the clip, up to 1.2 s), `pulse` (scale wave,
  1 s period), `bounce` (a short hop that dies away), `pop` (back-ease from 0 over 0.4 s).
- Keyframes, masks and transitions apply to graphics as to any clip.

## Tests
- `tests/node/slopcut-grid.test.mjs` loads the file in a vm and checks that every shape has a path and the SVG string
  has the right colour and box. Nothing else depends on the shape geometry.
