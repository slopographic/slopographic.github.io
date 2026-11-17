#!/usr/bin/env node
// Capture homepage media for every app in shared/apps.js (window.SLOP_APPS).
//   node tools/capture/capture.mjs                 every app
//   node tools/capture/capture.mjs --only pdf,tank only these ids
//   flags: --no-clips (screenshots only), --no-shots (clips only), --keep (keep raw frames)
// Writes assets/shots/<id>.jpg (1280x800) + <id>-sm.jpg (640x400) and
// assets/clips/<id>.webm + .mp4 (640x400, muted, seamless loop). Apps whose page is
// missing (404) are skipped, so the homepage keeps its generated tile for them.
// How each app is driven into a good-looking state lives in recipes/*.mjs.
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, serve, loadPlaywright, loadApps, args, GL_ARGS, ffmpeg } from './lib.mjs';
import { recipeFor } from './recipes/index.mjs';

const W = 1280, H = 800, FPS = 30, FADE = 0.6;
const opt = args();
const SHOTS = path.join(ROOT, 'assets/shots'), CLIPS = path.join(ROOT, 'assets/clips');
const TMP = path.join(os.tmpdir(), 'slop-capture');
const CLOCK = readFileSync(path.join(ROOT, 'tools/capture/clock.js'), 'utf8');
await mkdir(SHOTS, { recursive: true }); await mkdir(CLIPS, { recursive: true }); await mkdir(TMP, { recursive: true });

const { chromium } = await loadPlaywright();
const { server, base } = await serve();
const browser = await chromium.launch({ args: GL_ARGS });
const apps = (await loadApps()).filter((a) => !opt.only || opt.only.has(a.id));
const report = [];

async function newPage(video) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'no-preference',
    ...(video ? { recordVideo: { dir: video, size: { width: W, height: H } } } : {}),
  });
  await ctx.addInitScript(CLOCK);
  await ctx.addInitScript(() => { try { localStorage.setItem('slop.capture', '1'); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource|favicon/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}

/** Stills at 1280x800 and 640x400. */
async function saveShot(page, id) {
  const big = path.join(SHOTS, id + '.jpg'), png = path.join(TMP, id + '-shot.png');
  await page.screenshot({ path: png });
  ffmpeg(['-i', png, '-q:v', '4', big]);
  ffmpeg(['-i', png, '-vf', 'scale=640:400:flags=lanczos', '-q:v', '4', path.join(SHOTS, id + '-sm.jpg')]);
  await rm(png);
}

/** Encode a source (image sequence or video) into the looping webm + mp4 clips. */
function encodeClip(input, id, len, { start = 0 } = {}) {
  const D = len + FADE;
  const loop = `[0:v]fps=${FPS},trim=start=${start}:duration=${D},setpts=PTS-STARTPTS,scale=640:400:flags=lanczos,split[a][b];` +
    `[a]trim=${FADE}:${D},setpts=PTS-STARTPTS[x];[b]trim=0:${FADE},setpts=PTS-STARTPTS[y];` +
    `[x][y]xfade=transition=fade:duration=${FADE}:offset=${(len - FADE).toFixed(3)},format=yuv420p[v]`;
  const common = ['-filter_complex', loop, '-map', '[v]', '-an', '-t', String(len)];
  ffmpeg([...input, ...common, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', path.join(CLIPS, id + '.webm')]);
  ffmpeg([...input, ...common, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(CLIPS, id + '.mp4')]);
}

async function capture(app) {
  const r = recipeFor(app);
  const url = base + (r.url || app.path);
  const mode = r.mode || 'frames';
  const len = r.len || 5;
  const vdir = path.join(TMP, app.id + '-video');
  const wantClip = !opt.flags.has('no-clips') && r.clip !== false;
  const { ctx, page, errors } = await newPage(wantClip && mode === 'video' ? vdir : null);
  const t0 = Date.now();
  const res = await page.goto(url, { waitUntil: 'load' }).catch((e) => ({ status: () => 0, err: e }));
  if (!res || res.status() >= 400 || res.status() === 0) { await ctx.close(); return { id: app.id, skipped: 'page missing (' + (res && res.status()) + ')' }; }
  await r.setup?.(page, { base, app });
  if (mode === 'frames') {
    await page.evaluate(() => window.__cap.freeze());
    await r.warm?.(page);
  }
  const shoot = async () => { if (!opt.flags.has('no-shots')) { await r.beforeShot?.(page); await saveShot(page, app.id); } };
  if (!r.shotAfter || !wantClip) await shoot();
  if (wantClip && mode === 'frames') {
    const dir = path.join(TMP, app.id + '-frames');
    await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    const n = Math.ceil((len + FADE) * FPS);
    for (let i = 0; i < n; i++) {
      await r.frame?.(page, i, i / FPS);
      await page.evaluate((dt) => window.__cap.tick(dt), 1 / FPS);
      await page.screenshot({ path: path.join(dir, String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 92, timeout: 180000 });
    }
    if (r.shotAfter) await shoot();
    encodeClip(['-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg')], app.id, len);
    if (!opt.flags.has('keep')) await rm(dir, { recursive: true, force: true });
  } else if (wantClip) {
    const start = (Date.now() - t0) / 1000;
    await r.play?.(page, len + FADE);
    if (r.shotAfter) await shoot();
    await ctx.close();
    const vid = (await readdir(vdir)).find((f) => f.endsWith('.webm'));
    encodeClip(['-i', path.join(vdir, vid)], app.id, len, { start });
    await rm(vdir, { recursive: true, force: true });
    return { id: app.id, errors };
  }
  await ctx.close();
  return { id: app.id, errors };
}

for (const app of apps) {
  const t = Date.now();
  let out;
  console.log(`${app.id}…`);
  try { out = await capture(app); } catch (e) { out = { id: app.id, failed: e.message.split('\n')[0] }; }
  const sizes = [];
  for (const f of [`shots/${app.id}.jpg`, `clips/${app.id}.webm`, `clips/${app.id}.mp4`]) {
    const s = await stat(path.join(ROOT, 'assets', f)).catch(() => null);
    if (s && s.mtimeMs >= t) sizes.push(f.split('.').pop() + ' ' + Math.round(s.size / 1024) + 'K');
  }
  const note = out.skipped || out.failed || sizes.join(', ');
  console.log(`${app.id.padEnd(15)} ${((Date.now() - t) / 1000).toFixed(0).padStart(4)}s  ${note}${out.errors?.length ? '  [console: ' + out.errors.slice(0, 2).join(' | ').slice(0, 160) + ']' : ''}`);
  report.push(out);
}
await browser.close(); server.close();
await rm(TMP, { recursive: true, force: true }).catch(() => {});
process.exit(report.some((r) => r.failed) ? 1 : 0);
