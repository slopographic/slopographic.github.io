# shared/presets: one library of effect and motion presets (window.SlopPresets)

A preset is plain data. Built-ins ship with the apps; the person's own presets are files in Slop Drive, so they
follow them across apps. Every editing app applies a preset by writing the same data its own controls write, as one
undo step.

## Files (classic scripts, load in this order)

| file | what it holds |
| --- | --- |
| `core.js` | vocabulary, `validate`, the registry: `list`, `get`, `save`, `remove`, `load`, `setStore`, `memoryStore` |
| `builtins-effect.js` | `SlopPresets.BUILTIN_EFFECTS` (16 presets: shadows, glow, stroke, bevel, blur, sharpen, grain, vignette, hue shift, glitch, colour looks) |
| `builtins-motion.js` | `SlopPresets.BUILTIN_MOTION` (11 presets: fade-in, slide-up/down/left/right, zoom-in, pop, bounce, shake, pulse, spin-in) |
| `io.js` | `.slop.json` export and import, `errorText`; registers the `preset` kind with SlopConfig when shared/config is loaded |
| `store.js` | `useDrive()`: the registry over Slop Drive (folder "Presets", `meta.type: 'preset'`) |
| `motion.js` | `SlopPresets.motion`: conversions to Slides, Cut and Remix; needs `SlopMotion` (shared/motion) |
| `ui.js` | `openPicker({kind, app, title, onApply})` and `openSave({app, apps, kinds, build, title, onSaved})` |

Apps load these after `shared/hub.js`, `shared/slopui.js` and (for the preset kind) `shared/config`.
Slides loads them through `slides/js/manifest.js`.

## Preset format

```json
{ "kind": "effect", "label": "Soft shadow", "description": "optional", "apps": ["photoslop"],
  "params": { "effects": [ { "type": "drop-shadow", "p": { "color": "#000000", "op": 45, "a": 120, "dist": 8, "size": 18 } } ] } }
```

- `kind`: `effect` or `motion`. `apps`: 1 to 4 of `photoslop`, `slopedit` (Slop Cut), `slides`, `remix`.
- Effects: `params.effects` is 1 to 8 of `{ type, on?, p }`. Every setting in `p` is required and no other key is
  allowed. Types and their ranges are in `SlopPresets.EFFECT_TYPES`. An effect type can only be listed in an app that
  supports it (`colour-look` is Cut only; the rest are PhotoSlop only).
- Motion: `params = { duration (0.05 to 10 s), tracks }`, 1 to 5 tracks of `x`, `y`, `scale`, `rot`, `opacity`. Each
  track has 1 to 16 keys `{ t, value, ease? }` with increasing `t` inside the duration. `x` and `y` are fractions of
  the frame (-1 = one frame away), `rot` is in degrees. `ease` is a SlopMotion easing name, `hold`, or
  `[x1, y1, x2, y2]`.
- Labels are 1 to 60 characters, descriptions up to 200. Colours are `#rrggbb`.

`SlopPresets.validate(data)` returns `{ ok, value, errors: [{ path, message }] }`. It never throws.
`save` refuses an invalid preset and writes nothing. Built-in ids cannot be saved over or removed. The person's ids
start with `u-`.

## The file

`SlopPresets.exportText(id)` writes the shared config envelope: `format: "slop-config"`, `version: 1`,
`kind: "preset"`, `app: "slop"`, `name`, `created`, `data` (the preset without its id). `importText` and `importFile`
validate, then save. A Drive file holds the same envelope, so it can also be imported through SlopConfig's dialogs.

## Apps (what each one maps)

- **PhotoSlop** (`photoslop/js/layers/fx-presets.js`): `drop-shadow`, `inner-shadow`, `glow`, `inner-glow`, `stroke`,
  `bevel`, `overlay`, `gradient` are the layer style effects. `blur`, `sharpen`, `grain`, `vignette`,
  `colour-shift`, `glitch` map to the existing filters (gauss, sharpen, noise, vignette, huesat, glitch). fx.js lists
  those filters as layer effects too (`FX_PRESET_FILTERS`), so they render non-destructively. They are not in the Layer
  Style menu. Menu: Layer context menu, "Apply Effect Preset…" and "Save Effects as Preset…".
- **Slop Cut** (`slopcut/js/ui/presets.js`): a `colour-look` writes the clip's `temp`, `sat`, `contrast`, `bright`. A
  motion preset writes animate-in keys over the first part of each clip (`SE.anim.tidy` cleans up). The Effects panel
  has the two lists, "Save as preset…" (from the first selected clip) and "All presets…" (the picker).
- **Slop Slides** (`slides/js/anim/object.js`, `ui/anim-panel.js`): the preset menus list the library's motion presets.
  `ANIM.plan` places them through `SlopPresets.motion.applyToTimeline`, with the deck size as the frame. Legacy
  names (fade-in, slide-up, pop, shake, pulse, spin-in) resolve to the same built-ins. "Save as preset…" saves the
  object's first animation, stretched by its timing.
- **Reel Remix** (`remix/js/keys.js`, `panel.js`): Animate in lists the library's motion presets (built-in names keep
  their old keys). "Save as preset…" saves the slot's keys.
- **SlopVector**: not wired. Objects have no effect stack or per-object effect fields, so there is nothing to apply a
  preset to. The vocabulary already covers it; a follow-up needs an effects field on SlopVector objects first.

## Tests

- `tests/node/presets.test.mjs` (with `presets-env.mjs`): built-ins are valid, save and load round-trip, the envelope,
  refused presets (nothing written), the shared config kind, and motion conversions.
- `tests/photoslop/presets.test.html`: saves a layer effect, applies it to another layer as one undo step, checks the
  Drive file, round-trips an exported file, and opens the picker.

## Rules

- Apps never interpolate or ease: sampling goes through SlopMotion.
- A preset is applied as one history step (PhotoSlop `setFxStack`, Cut `SE.change`, Slides/Remix through their own
  commit).
- Keep each file under 300 lines.

## Words (i18n)
Built-ins carry no name or description in their data: `builtins()` (so `list()` and `get()`) adds `label` and
`description` from `ui.presets.b.<id>` / `ui.presets.bd.<id>`, and `EFFECT_TYPES[type].label` is a getter on
`ui.presets.type.<type>` (`shared/i18n/ui/<code>/presets.js`; ids with `-` as `_`). The dialogs in ui.js use
`ui.presets.*` and the shared buttons. A person's own presets keep the name they typed.
