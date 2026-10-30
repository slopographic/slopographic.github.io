# Slop shapes: handoff

`shared/shapes/rounded.js` is the rounded-rectangle geometry used by SlopVector (SVG export) and PhotoSlop (canvas paths). It loads as `window.SlopShapes` and has no dependencies.

- `radii(r)` turns one number, `{ tl, tr, br, bl }` or a 4-array into `[tl, tr, br, bl]`. Invalid values count as 0.
- `clampRadii(w, h, r)` scales all four radii by one factor so that no side is shorter than its two corner radii. A 100x50 box with radius 60 gives 25.
- `segments({ x, y, w, h, radius })` returns the path as M, L, circular A (with the corner point in `via`) and Z. Zero-radius corners add no arcs.
- `svgPath(rect)` returns SVG path data built from `segments`. `canvasPath(g, rect)` draws the same path on a 2D context with `arcTo`.

Keep both outputs generated from `segments`, so Vector and PhotoSlop cannot drift apart. Node tests: `tests/node/shapes-rounded.test.mjs`.
