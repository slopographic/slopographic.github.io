# Shared motion engine (window.SlopMotion)

One keyframe and motion engine for every app: Slop Slides (transitions and object animations),
SlopIsolate (animated previews), Slop Gallery (slideshow transitions) and Slop Effects.

## The rule

Apps call this engine and never interpolate or ease values themselves. No `lerp`, no easing curves,
no `requestAnimationFrame` tweening in app code. If a motion feature is missing, add it here
(with a test in `tests/node/motion*.test.mjs`) and call it from the app.

## Loading (classic scripts, in this order)

```html
<script src="../shared/motion/easing.js"></script>
<script src="../shared/motion/track.js"></script>
<script src="../shared/motion/timeline.js"></script>
<script src="../shared/motion/transitions.js"></script>
<script src="../shared/motion/playback.js"></script>
<script src="../shared/motion/presets.js"></script>
```

Everything lives on `window.SlopMotion`: `.easing`, `.track`, `.timeline`, `.transitions`, `.playback`, `.presets`.

## Timeline data format (plain JSON)

```json
{
  "version": 1,
  "duration": 2,
  "loop": "none",
  "playhead": 0,
  "tracks": {
    "slide-1": {
      "opacity":    [{ "t": 0, "value": 0, "ease": "easeOutQuad" }, { "t": 1, "value": 1 }],
      "translateY": [{ "t": 0, "value": 40, "ease": [0.2, 0, 0, 1] }, { "t": 1, "value": 0 }]
    },
    "label": {
      "text": [{ "t": 0, "value": "Hello" }, { "t": 1, "value": "Bye" }]
    }
  }
}
```

- `t`: seconds, finite, >= 0, strictly increasing within a track.
- `value`: a number; a point `[x, y]`; a colour `{ "r", "g", "b", "a" }` (r,g,b 0-255, a 0-1, default 1);
  or a string (a step: it switches at the next key time). A track must use one kind of value.
- `ease` (on the key that starts the segment, default `"linear"`): an easing name, `"hold"` (keep the
  start value until the next key), or `[x1, y1, x2, y2]` for cubic-bezier.
- `loop`: `"none"` (keys hold past the ends), `"loop"` (time wraps over `duration`) or `"pingpong"`.
- Save with `SlopMotion.timeline.serialize(tl)`; load with `SlopMotion.timeline.parse(text)` (validates).

## API summary

- `easing`: `linear`, `easeIn|Out|InOut` + `Quad|Cubic|Quart`, `easeIn|Out|InOutBack`,
  `easeIn|Out|InOutElastic`, `easeIn|Out|InOutBounce`, `cubicBezier(x1,y1,x2,y2)`, `resolve(spec)`, `names()`.
- `track`: `sample(keys, t, {mode, duration})`, `validateKeys(keys)`, `mapTime(t, duration, mode)`, `lerp`.
- `timeline`: `create({duration, loop})`, `validate(tl)`, `parse(text)`, `serialize(tl)`, `sample(tl, t)`,
  `seek(tl, t)`, `addKey`, `moveKey`, `updateKey`, `deleteKey`, `setDuration`, `targets`, `getKeys`.
  All edits are pure: they return a new timeline.
- `playback`: `create({duration, loop, speed, time, clock, onFrame})` returns `play()`, `pause()`,
  `seek(t)`, `setSpeed(s)`, `setLoop(m)`, `setDuration(d)`, `destroy()`, and getters `time`, `playing`, `ended`.
  `onFrame(time, {playing, ended, speed, loop, duration})` runs on each frame and on every state change.
- `transitions`: `transition(name, progress, {width, height})` returns `{outgoing, incoming}`, each with
  `translateX`, `translateY` (px), `scale`, `rotate` (deg), `opacity`, `clip` (CSS `inset()` or `'none'`),
  `origin` and a ready `transform` string. `names()`, `spec(name)` (plain JSON data).
- `presets`: `list()`, `get(name)`, `valueAt(name, t, {amount})`,
  `apply(timeline, name, target, {at, timeScale, amount})` returns a new timeline with the preset placed on
  the target. It replaces the properties the preset animates on that target and extends `duration` if needed.

## Presets

| name       | label    | duration | animates                              |
|------------|----------|----------|---------------------------------------|
| fade-in    | Fade in  | 0.4 s    | opacity                               |
| slide-up   | Slide up | 0.5 s    | translateY (px, x `amount`), opacity  |
| pop        | Pop      | 0.5 s    | scale (back overshoot), opacity       |
| shake      | Shake    | 0.5 s    | translateX (px, x `amount`)           |
| pulse      | Pulse    | 0.6 s    | scale 1 to 1.08 and back              |
| spin-in    | Spin in  | 0.6 s    | rotate -360 to 0, scale, opacity      |

## Transitions

| name        | outgoing                          | incoming                         |
|-------------|-----------------------------------|----------------------------------|
| none        | hidden at progress 1              | shown at progress 1              |
| fade        | opacity 1 to 0                    | opacity 0 to 1                   |
| push-left   | x 0 to -1 (slide widths)          | x 1 to 0                         |
| push-right  | x 0 to 1                          | x -1 to 0                        |
| push-up     | y 0 to -1                         | y 1 to 0                         |
| push-down   | y 0 to 1                          | y -1 to 0                        |
| wipe        | fades out under the wipe          | clipRight 100% to 0% (reveals L to R) |
| zoom-in     | scale 1 to 1.5, fades             | scale 0.5 to 1, fades in         |
| zoom-out    | scale 1 to 0.5, fades             | scale 1.5 to 1, fades in         |
| cube        | rotate 0 to -90 (origin right)    | rotate 90 to 0 (origin left)     |

## Tests

`node tests/run.mjs motion` runs `tests/node/motion*.test.mjs` (vm loader: `tests/node/motion-env.mjs`).
The player is tested with an injected clock, so no browser page is needed.
