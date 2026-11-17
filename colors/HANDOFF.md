# Slop Colors (colors/)

A colour picker, palette maker and contrast checker. Pictures and palette files are read in the browser; nothing is
uploaded. Registry id `colors` (shared/apps.js), group creative.

## Layout

The suite's View · Panel (shared/frame, SlopFrame; no list). The view: the current colour with Copy for HEX, RGB, HSL,
OKLCH and CMYK; Pick from a picture (canvas eyedropper with a magnifier, the picture's main colours, the drop zone); the
Palette; Made from this colour (the colour wheel beside its harmony row, then the scale and the 50–950 ramp); the Contrast
check. The panel: Colour (native picker and
the five fields), Made from it, Picture (colours to find), Export (name, format); its foot: Download palette (primary),
Save to Slop Drive…, Copy code, Open in…. Phones (≤ 860 px): the panel is a bottom sheet whose foot always shows.

## The colour wheel

One more view of the one state, like Adobe Color's: the base handle is `current`, the other handles are its harmony, and
the harmony row under the wheel's lists is those colours (Use as the palette, a click picks one). A hue ring outside a
disc (angle = hue, 0 at the top and clockwise; distance = saturation) at the slider's brightness. Three wheels
(`state.wheel`): `rgb` (HSB), `ryb` (the artist's wheel: `convert.hueToRyb`, piecewise linear through red 0, orange 60,
yellow 120, green 180, blue 240, violet 300, so complements are red–green, yellow–violet, blue–orange) and `oklch` (hue,
chroma / 0.32 as the distance, lightness as the slider; places outside sRGB show their gamut-mapped colour). Rules: the
seven old ones plus `brightness` (Shades: HSB brightness steps) and `custom` (`state.custom`, the other handles' own
colours; a switch to custom starts from the rule's colours, `harmony.customFrom`, so nothing jumps).

A drag on the ring turns only the hue; on the disc it moves the base there; on a handle it moves that one: the base moves
the set; under a rule another handle turns the set (and sets the saturation); in custom each handle moves alone
(`core/wheel.js` `drag`, the one rule for mouse, touch, keys and the assistant). Pointer events captured to the wheel
(`touch-action: none` there, so a finger on the wheel never scrolls the page). Each handle is a `role="slider"` (value:
its hue; value text: hue, saturation, hex); ← → turn 1° (Shift 10°), ↑ ↓ the saturation, Page Up/Down the brightness,
Home/End the centre and the rim. The page keeps the base's exact place while the colour is the one it set
(`js/wheel.js` `baseOf`), so a grey keeps its hue and keys never drift through 8-bit rounding. The canvas has
devicePixelRatio pixels per CSS pixel; the disc is kept until the wheel, the slider or the size changes (OKLCH's disc is
drawn at most 260 px and scaled, each pixel being gamut mapped).

The address carries `?color=3366cc&harmony=triadic&wheel=ryb` (and `custom=hex,…`), written 250 ms after the last
change (shared/urlstate); on load it wins over the browser's saved state, so a link opens the same wheel.

## Files

| File | What |
|---|---|
| `js/core/convert.js` | HEX ↔ RGB, HSL, OKLab/OKLCH (gamut mapped into sRGB by chroma), CMYK; `parse` any of them; `format`. Every HEX round trips through every format. |
| `js/core/convert.js` (wheel part) | HSB (`rgbToHsv`, `hsvToRgb`, the shared model's maths) and the RYB angle (`hueToRyb`, `rybToHue`, `RYB_STOPS`). |
| `js/core/harmony.js` | harmonies on the RGB, RYB or OKLCH wheel (`harmony(hex, id, { wheel, custom })`, `turn`, `customFrom`), tints/shades/tones, the OKLCH ramp, `suggest` (nearest colour that reaches a contrast). |
| `js/core/wheel.js` | the wheel's geometry: a place `{ a, r, v }` ↔ a colour per wheel, the handles' places, `drag` (what moving a handle does), `nudge` (keys). Pure. |
| `js/wheel.js`, `js/wheel-draw.js` | the wheel on the page (handles, pointer and keys, its lists and slider) and its canvas. |
| `js/core/kmeans.js` | seeded k-means++ in OKLab on sampled pixels; means in RGB so a flat block gives its exact colour. |
| `js/core/formats.js`, `js/core/ase.js` | CSS variables, Tailwind config, JSON, GIMP .gpl, Adobe .ase (RGB written; RGB, CMYK, Lab, Gray read). |
| `../shared/color/contrast.js` | the site's one copy of the WCAG maths (also used by tests/a11y/contrast.js and tests/node/theme-contrast.test.mjs). |
| `js/state.js` | the one state (current, palette, fg/bg, panel choices, wheel, custom), kept in localStorage `slop-colors`; colour, harmony and wheel also in the address. |
| `js/swatches.js`, `js/picture.js`, `js/contrast-ui.js`, `js/panel.js`, `js/io.js`, `js/main.js` | the page. |
| `js/commands.js`, `js/ai-commands.js` | Ctrl+K commands (with "Wheel: set harmony to …", "Wheel: use the … wheel", "Wheel: go to the colour wheel"); the assistant's commands with schemas, loaded on demand (the wheel's: `set_wheel`, `move_wheel_handle`, `read_wheel`). |
| `../shared/ops/colors.js` | the operation `colors.palette` (a picture → a palette file) for Workflows and the AI panel. |

Core modules are UMD factories: in a page they attach to `window.SlopColors` (load `shared/color/model.js` and
`shared/color/contrast.js` first); in Node they export the factory (tests/node/colors-env.mjs wires them).

## In and out

In: spec `colors` (js/io.js): pictures go to the eyedropper; `.gpl`, `.ase`, `.json`, `.css` become the palette. Sources:
Open… (header), Open picture… (card), the drop zone and the picture, paste, ?drive= and launchQueue, the sample photo.
`colors/` is in rule 4's STRICT list. Out: SlopUI.download, SlopHub.put, SlopOuttake.items.

## Tests

Node: `tests/node/colors-core.test.mjs`, `tests/node/colors-files.test.mjs`, `tests/node/colors-wheel.test.mjs` (HSB and
RYB round trips, each rule's count and angles on each wheel, places, drags, keys). Browser: `tests/colors/wheel.test.html`
(the wheel by mouse, touch pointers and keys, the lists, custom handles, the address, Ctrl+K), `tests/colors/app.test.html`
(blocks picture → its four colours, eyedropper by pointer and keys, fields, rows, contrast, every format back through the
intake, Drive, reload), `tests/colors/ai-commands.test.html`, `tests/colors/op.test.html`, `tests/colors/look.test.html`,
`tests/intake/colors.test.html`, contrast sweep `tests/a11y/sweep-39.test.html`.

## Limits

CMYK is the naive formula (no ICC profile). No colour blindness preview yet. The EyeDropper (pick from screen) exists
only in Chromium browsers; the button hides elsewhere. tests/harness.js keeps its own small `contrast()` helper (older
0.03928 threshold) because every test page loads it without shared/color/contrast.js.
