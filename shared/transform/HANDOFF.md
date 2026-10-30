# Transform helpers: original aspect ratio

## Files
- `aspect.js`: `window.SlopAspect` (a classic script, no dependencies, under 60 lines). Used by PhotoSlop Free Transform, SlopVector image handles, Slides resize and the Slop Cut clip box.

## API
- `SlopAspect.ratio(obj)`: the object's source ratio, width over height, from `obj.src = { w, h }`. Returns `null` when the object has no usable source size. That is the disabled state of Restore original aspect ratio.
  - Crop does not change it: `src` is the un-cropped source, so a cropped object keeps its source ratio.
  - Rotation does not change it: a turned object keeps its own ratio, so a quarter turn never inverts it.
- `SlopAspect.restore(box, original, keep)`: returns `{ w, h }` for the box with the original ratio. `box` is the current size `{ w, h }`, in any unit, in the object's own frame. `original` is a ratio number, a `{ w, h }` size, or an object with `src`. `keep` is `'w'` (default: keep the width, set the height) or `'h'` (keep the height, set the width). Without a usable ratio the box comes back unchanged.

## Using it in an app
1. Record the source size when the object is created: `o.src = { w: naturalWidth, h: naturalHeight }`. Use the un-cropped pixels. Objects without `src` are not restorable.
2. Build the menu item with `disabled: SlopAspect.ratio(o) === null`. A right-click on a top or bottom handle passes `keep: 'h'`, and any other place passes `'w'`.
3. Apply the result as one undo step. Keep the top-left corner (or the centre of a turned object) put.

## Per app
- PhotoSlop: the source is the pixel box when this Free Transform started (`TRANSFORM.w × h`). Restore works inside an open transform, so Enter commits it as one step. Idle boxes have no source, so the item is disabled there.
- SlopVector: images only (`o.src`, set when placed). It works in the object's local frame, so a turned image is restored along its own sides. Several objects, or shapes without `src`, are disabled.
- Slides: pictures (`o.src`, set on insert). Top-left stays put, and a turned object keeps its centre.
- Slop Cut: a clip's media size (un-cropped). Clips scale uniformly, so the box changes shape only through crop. Restore keeps the visible width and sets the vertical crop so the visible box has the source ratio. Titles and colour clips are disabled.

## Tests
- `node tests/run.mjs transform`: `tests/node/transform-aspect.test.mjs` covers the ratio maths (rotation, crop, missing source, restore keep modes).
- Browser tests: `tests/photoslop/transform-aspect.test.html`, `tests/slopvector/aspect.test.html`, `tests/slides/aspect.test.html`, `tests/slopcut/aspect.test.html`.
