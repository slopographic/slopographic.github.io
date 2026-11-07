# Capture tools: handoff

Node + Playwright scripts that make the homepage media and the promo video. Nothing here ships to the site; the outputs in `assets/` do.

## What it makes
| Output | Made by | Used by |
|---|---|---|
| `assets/shots/<id>.jpg` (1280×800, q≈80) and `<id>-sm.jpg` (640×400) | `capture.mjs` | homepage cards (`shot` in `shared/apps.js`), the promo |
| `assets/clips/<id>.webm` (VP9) and `.mp4` (H.264, faststart): 5 s seamless loop, 640×400, muted | `capture.mjs` | homepage card hover/scroll clips, the promo |
| `assets/promo/slopographic-promo.mp4` (1920×1080) and `slopographic-promo-vertical.mp4` (1080×1920), each with a `.jpg` poster | `render-promo.mjs` | wherever the video gets posted |

## Run it
```
node tools/capture/capture.mjs                       # every app in shared/apps.js
node tools/capture/capture.mjs --only pdf,label      # just these ids
node tools/capture/capture.mjs --no-clips            # stills only (fast)
node tools/capture/render-promo.mjs                  # both promo cuts (~30-40 min each on a software GPU)
node tools/capture/render-promo.mjs --only h --from 0 --to 10   # a quick test range -> *-test.mp4
```
- Needs Playwright (`/opt/node22/lib/node_modules/playwright` is found automatically, or `npm i -D playwright`) and ffmpeg (`/usr/bin/ffmpeg`, or set `FFMPEG`).
- `PLAYWRIGHT_BROWSERS_PATH` defaults to `/opt/pw-browsers`.
- Each run prints one line per app with the time taken and the file sizes. An app whose page is missing (404) is skipped, so its card keeps the generated tile until the app exists. Re-run with `--only <id>` once it does.
- Temporary frames go to `$TMPDIR/slop-capture` and `$TMPDIR/slop-promo`, deleted at the end.

## How capture works (`capture.mjs`, `clock.js`, `recipes/`)
- `lib.mjs`: a static server for the repo, the Playwright loader, `loadApps()` (evaluates `shared/apps.js` in Node) and `ffmpeg()`.
- Every page gets `clock.js` as an init script: a **virtual clock**.
  - Until `__cap.freeze()` the page runs normally.
  - After it, `__cap.tick(dt)` is the only thing that moves time: rAF callbacks, `performance.now`, `Date.now` and every Web Animation / CSS animation advance by exactly `dt`.
  - So a WebGL game on a slow software GPU still gives a smooth 30 fps clip. `setTimeout` still runs on real time.
- A recipe (`recipes/games.mjs`, `apps.mjs`, `experiments.mjs`; helpers in `util.mjs`, Drive seed in `seed.mjs`) says how to drive one app:
  - `mode: 'frames'` (default): `setup` → freeze → `warm` → still → per frame `frame(page, i)` + tick + screenshot. Used for games, canvases and anything slow to paint (PhotoSlop's brush takes ~0.5 s per pointer move here, so strokes are drawn a point per frame with `strokeFrames`).
  - `mode: 'video'`: Playwright records the page in real time while `play(page, seconds)` works in it; the recording is trimmed to the play window. Used for DOM apps that run on timers (PDF, Label, Drive, the Authenticator).
  - `shotAfter: true` takes the still after the clip (e.g. PhotoSlop after the stroke is painted).
  - Apps without a recipe get `generic` (load, wait, film).
- Clips: 5.6 s are captured and the last 0.6 s are cross-faded into the start (`xfade`), so the loop has no visible jump.

## Homepage cards (`home/catalog.js`, `home/home.css`)
- A card shows its shot as soon as it loads; until then (or if it is missing) the generated tile stays.
- Once the shot has loaded the box gets `data-clip`. A `<video muted loop playsinline preload="none">` with the shot as poster is created on first use only.
  - Desktop (hover + fine pointer): plays on hover or keyboard focus, pauses on leave/blur.
  - Touch: plays only the card nearest the middle of the viewport (IntersectionObserver + scroll).
  - `prefers-reduced-motion: reduce` or Save-Data: no `data-clip`, so no video at all.
  - If the clip 404s the video is removed and the card keeps the still.
- Tests: `tests/home/clips.test.html` (fixture `clips-frame.html`): still vs fallback, hover/focus play, reduced motion, Save-Data, touch one-at-a-time.

## Promo (`/promo/`)
- Plain ES modules, no libraries:
  - `js/plan.js`: the edit, from `SLOP_APPS`, on a 120 BPM grid. Shipping apps get 6 beats, apps in development 3, games and experiments 4.
  - `js/scenes/*`: intro, chapter cards, one scene per app, the games montage, the pillars (with the NO WATERMARKS moment), the outro.
  - `js/goo.js`: Sloppo.
  - `js/ease.js`: easings and helpers.
  - `js/audio/*`: the synth and the score, rendered with an OfflineAudioContext.
- Every frame is a pure function of `t`: `?t=12.5` shows that moment, `?v=1` is the vertical cut, `?render=1` hides the UI.
- `window.__promo`: `seek(t)` returns a Promise that resolves once every visible clip has seeked; also `play()`, `pause()`, `wav()` (base64 WAV), `duration`.
- Adding an app to `shared/apps.js` adds a scene automatically, which makes the video longer. Re-run `capture.mjs --only <id>` and then `render-promo.mjs`.

## Status (at hand-off)
- **Done.**
  - Shots and clips exist for photoslop, vector, pdf, label, ai, press, slopedit and drive.
  - Homepage card behaviour, with `tests/home/clips.test.html` green (6 tests; catalog and chaos are green too).
  - `/promo/` plays live with sound, `?t=`, `?v=1` and `__promo.seek()`. Frames for both cuts were checked by eye.
- **Half done.**
  - No shot or clip yet for the Authenticator: the screenshot timed out while other jobs loaded the CPU, so re-run them alone. Also missing for paint-classic (the run was stopped), and for cutout, docs, tables and slides (no page yet).
  - Re-capture `photoslop`, `vector`, `label` and `drive`. Their recipes were improved after the last run: smaller vector shapes, the PhotoSlop still taken after the stroke, label drags, Drive thumbnails and real PDFs.
  - The promo has **not been rendered to MP4 yet**, so `assets/promo/` is empty. `render-promo.mjs` is written but has only been tried through single-frame peeks.
- **Next steps, in order.**
  1. Recapture the missing and improved apps, alone on the machine (the video-mode recipes record in real time and need the CPU):
     `node tools/capture/capture.mjs --only authenticator,paint-classic,photoslop,vector,label,drive`
  2. Look at `assets/shots/*-sm.jpg` and at a frame from each clip (`ffmpeg -ss 3 -i clip.mp4 -frames:v 1 x.jpg`).
  3. Run `node tools/capture/render-promo.mjs --only h --from 0 --to 10`, check it, then render the full cut and `--only v`. Aim for 8–15 MB; tune `-crf` / `-maxrate` in `render-promo.mjs` if needed.
