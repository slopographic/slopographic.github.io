# Sloppo keeps out of the way (home/mascot/, shared/buddy/)

Sloppo is the homepage buddy. This note covers how he stays out of the person's way: the pointer,
where he rests, and touch. The rest of the buddy (look, moods, chaos, HUD) is in `shared/buddy/HANDOFF.md`.

## Files
- `home/mascot/index.js`: unchanged, still `boot({ app: 'home', defaultOn: true })`.
- `shared/buddy/avoid.js`: the pointer. Watches `pointermove` (mouse only), dodges, lets clicks through
  to controls, restores the saved spot on load, and exports `controlAt(x, y)` for input.js.
- `shared/buddy/glide.js`: the eased glide to a spot, the `float` resting state helpers, and the per-page
  spot memory in sessionStorage (`slop.mascot.spot`, keyed by `location.pathname`, page coordinates).
- `shared/buddy/motion.js`: `glide` and `float` modes in `step()`, the idle return from float, touch gating.
- `shared/buddy/input.js`: touch never starts a drag; a touch press over a control is left to the control.
- `shared/buddy/engine.js`: `bindAvoid()` at start; `spawn()` tries `restoreSpot()` before a fresh arrival.
- `shared/buddy/state.js`: the `glide` field, the modes in the comment, and `touchOnly()` (`pointer: coarse`).

## Behaviour
1. **Dodge.** A mouse pointer that comes onto his hit box (`dodged` is reset when it leaves the box plus 4 px)
   makes him glide to the nearest free spot, once per approach. Candidates sit 1.4-2.8 widths away, flattened
   vertically and sideways first. A spot is free when it is on screen (below the nav, 8 px from the edges),
   the pointer is not under it (14 px margin), and no control (`CONTROL` in avoid.js: links, buttons, form
   fields, nav, header, footer, toolbars, the buddy toggle and HUD) lies under any sample point of his box.
   The glide is 0.22-0.6 s with an ease-out cubic and a small stretch. He never chases the pointer. If no
   spot is free he stays, and the approach still counts as used.
2. **Clicks.** A press on him is a pet (existing `pet()`), and he is clickable wherever he is not over a control.
   While the pointer is over a control under him, his hit box gets `pointer-events: none` (so the control
   gets the click) until the pointer leaves the box. A press (`e.buttons`) is never an approach.
   Consequence: moving onto him makes him run; a click lands when he has settled and the pointer is already
   on him (for example, he hopped under a still pointer), or on a phone.
3. **Rest and reload.** After a glide he floats (`float` mode: no gravity, he waits). His idle timer (4-9 s)
   sends him back to a perch. Each landing and each arrival of a glide saves his feet point for the page.
   On a fresh load `restoreSpot()` puts him back on the same perch if one is there, or floats him at the
   saved point if it is still free and on screen. Otherwise the normal arrival runs.
   If he floats off screen for 1.5 s, he leaps back as he does from a perch.
4. **Reduced motion.** The dodge is instant (no glide), he does not hop on his own, and the spot is still
   remembered. Nothing is animated for the move.
5. **Touch** (`pointer: coarse`). Touch never moves him: no dodge, no idle hops, no drag. A tap pets him
   (`pointerdown`/`pointerup` on his hit box). A touch on a control under him does not pet him, but the tap
   still lands on his hit box, so that control does not get it either (touch cannot pass through in time).
   Placement is unchanged: he stays on the perch he has, as before.
6. Apps also use the avoid code (the same file, `CFG.home` is false there). Their ghost mode is unchanged.

## Tests
- `node tests/run.mjs home`: `tests/home/avoid.test.html` (5): a pointer onto him makes him glide aside
  (pointer outside the new box, on screen, no control under it, no restart on more moves over the old spot);
  the spot is saved and a reload restores it; a click in blank space pets him; a control under him takes the
  pointer (his hit box passes it through, and clears when the pointer leaves); touch never moves him and a
  tap pets him. The tests read his DOM box after two frames (`frames()`), since the box follows the model
  on the next frame.
- `node tests/run.mjs buddy`: unchanged, all green.
- Reduced motion is not covered by the browser test (the harness cannot change `prefers-reduced-motion`);
  check by hand with the OS setting or the devtools emulation.

## Known limits
- The move is a glide with no obstacle avoidance beyond controls: he can settle over text.
- On touch, a tap over a control under him is swallowed by him (no pet); on mouse the control gets the click.
- The phone placement is unchanged on purpose: he stays on his perch and does not wander.
- The spot memory is per tab (sessionStorage), not per user.
