# Sloppo buddy (shared/buddy/) handoff

Sloppo, the jelly-slime mascot, as a page companion. ES modules (each 300 lines or fewer), no build step,
no dependencies except three.js from `vendor/` for the optional 3D mode (loaded only on demand).

## Using it
Any page: `<script type="module" src="(../)shared/buddy/boot.js"></script>`.
- `boot.js` shows a small draggable Sloppo toggle (bottom right; position remembered) and the shortcut
  **Alt+Shift+S**. The engine is only imported when he is switched on. Off by default inside apps.
- The homepage calls `boot({ app: 'home', defaultOn: true })` from `home/mascot/index.js`.
- Prefs in localStorage `slop.buddy`: `{ apps: { <id>: bool }, global: bool, btn: { right, bottom }, tips: bool }`.
  Per-app choice wins, else the last choice made in any app (`global`), else the page default.
- Progress in `slop.mascot.v1`: `{ xp, hat, rage, fav, hate, stock }`.
- App id: `SlopHub.self.app`, else `<html data-app>`, else the `SLOP_APPS` path, else the last path segment.
- Debug/test hook once on: `window.SlopBuddy` (alias `window.SlopMascot`), `window.SlopBuddyBoot`.

**Not done:** adding the loader line to every app's `index.html` (the one-line edits were refused by the session's
permission policy because those files belong to other agents). Each app owner adds one line before `</body>`:
`<script type="module" src="../shared/buddy/boot.js"></script>` (`../../` for `photoslop/classic/`).

## Modules
| Area | Files |
|---|---|
| Loader, settings | `boot.js`, `prefs.js`, `config.js` (HOME vs APP options: perch/card/heading selectors, floor, z-index, autoChaos, tips) |
| Engine | `engine.js` (build, frame loop, spawn, show/hide, ghost mode in apps, game pause), `state.js` (shared state `M`) |
| Look (art) | `look.js` (the SVG goo look: lumps + goo filter, moods by swapping face parts, blush only in love), `hats.js` (18 hats + the AI brain), `three3d.js` + `view3d.js` (3D metaball version) |
| Moving | `perches.js` (live perch geometry, solid-at-x with eaten letters and holes), `motion.js` (hops, falls, drag and throw, dizzy after a throw that ends on the page floor, leap back into view), `glide.js`, `avoid.js` (gliding aside), `bodies.js` (knocked cards as rigid bodies). The hop's arc and timing, the glide's easing, the spots around him and the controls he never covers are shared with the mascot slot's roaming: `shared/roam/path.js`, `shared/roam/spots.js` |
| Input, HUD | `input.js`, `hud.js`, `fx.js` (particles, speech bubble with buttons/streaming) |
| Levels, lines | `store.js`, `levels.js`, `lines.js` (pools per mood, no back-to-back repeats) |
| Chaos | `chaos.js` (brain, Unleash, Restore page), `acts.js` (bite, eat, knock, goo), `blast.js`, `blackhole.js`, `dom.js` (masks, letter wrapping), `journal.js` (undo log) |
| Feelings | `rage.js` (meter, RAGE; MAD = 1.5 stops draining), `care.js` (shake detection, items, feeding, petting rules), `treats.js` (placed treats he walks to, snubs or kicks), `timing.js` (mood timings, old and new values), `mood.js` (happiness fade, happy repair, candy ask), `candy.js` (Make candy: canvas sprite, drag onto him) |
| Clippy, AI | `tips.js` (tips per app id, SlopCmd buttons, opt-out), `power.js` (SlopAI power-up, Ask Sloppo, comments) |
| CSS | `buddy.css`, `extras.css` (the engine adds them if the page has not linked them) |

## Behaviour notes
- Apps: z-index 900 (dialogs at 1000+ stay above him); he perches on toolbars, panels, headers, dialog title bars;
  while you press/drag anywhere else he turns into a pointer-transparent ghost; in games he also pauses for 4 s after
  any input. RAGE never starts chaos by itself in apps; Unleash is explicit; Restore page works everywhere; hiding
  him restores the page first. The HUD is a small level toggle beside him; click it or press H to open the card (Escape,
  a click outside or the grip closes it; a bottom sheet on phones). The toggle fades after 6 s idle.
- Rage: hard throws, long falls, hard shaking and 5 pokes within 4 s add 1. 1: dizzy/"OUCH!" (pokes: annoyed),
  2: annoyed (MAD, no draining), 3: RAGE for 10 s (red, shaking, steam; chaos on the homepage only), then he stays
  MAD until fed. Petting is refused at 2.5+. A hard drop wears off in 4 s (drain 0.25/s).
- Candy: when angry (MAD or RAGE) he asks in his bubble ("Make candy" button, every 20 s); the HUD tray has the same
  button. A candy is a canvas-drawn lollipop or gummy; drag it onto him to calm him (-1.2) and make him happy.
  One candy at a time; it fades after 60 s.
- Happy: pets and treats raise a happiness meter (`cheer`, halves every 1.2 s; happy face above 0.45). While happy
  with damage on the page and no chaos, rage or treats running, he repairs it through `restore({ animate: true })`:
  the cracks, burns and goo fade out, then the same Restore page undo runs.
- Thrown off the page (a throw that ends on the page floor): dizzy for 2.6 s (stars, spiral eyes, a wobble), then he
  hops back up. A second such fall within a minute adds rage.
- Treats: the Give tray (HUD, while angry) places a treat beside him. Delay before he eats it depends on rage
  (favourites faster); at 2.5+ he turns his back, at full rage may kick it. Treats melt rage slowly, fade after 30 s.
- AI: feature-detects `window.SlopAI` (shared/ai/slopai.js); never loads a model.
- Reduced motion: no idle hopping, no automatic rage, instant chaos effects, no CSS animations.

## Art files (for LICENSE-ART)
Sloppo art lives in `look.js`, `hats.js`, `three3d.js`, `view3d.js`, the toggle face SVG in `boot.js` and the goo
splat SVG in `fx.js`. `bodies.js` is physics, not art.

## Tests
`node tests/run.mjs buddy`: `app.test.html` (toggle, persistence, shortcut, drag, perches, no pointer blocking, no
auto chaos, Restore in an app), `tips.test.html` (tips per app, SlopCmd buttons, opt-out, Ask, AI stub power-up),
`care.test.html` (shake thresholds, item values, spit-out, MAD, petting at full rage, placed treats, faces),
`mood.test.html` (candy made and dropped calms him, the candy ask, pokes, happy repair, dizzy after a fall, old and
new mood timings).
Fixture app: `tests/buddy/fixture.html` (`?app=`, `?cmd=1`, `?ai=1|ready`). Homepage tests: `tests/home/`.
