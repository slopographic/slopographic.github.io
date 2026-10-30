#!/usr/bin/env node
// Render /promo/ to video, frame by frame: seek the timeline, screenshot, pipe into ffmpeg.
//   node tools/capture/render-promo.mjs              both cuts (16:9 and 9:16)
//   node tools/capture/render-promo.mjs --only h     16:9 only   (--only v: vertical only)
//   --fps 30   --from 0 --to 12 (a test range; writes *-test.mp4)
// Output: assets/promo/slopographic-promo.mp4, slopographic-promo-vertical.mp4, *.jpg posters,
// and the soundtrack (rendered by the page with an OfflineAudioContext) muxed as AAC.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ROOT, serve, loadPlaywright, FFMPEG, ffmpeg } from './lib.mjs';

const argv = process.argv.slice(2);
const val = (name, d) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : d; };
const only = val('only', 'h,v').split(',');
const FPS = +val('fps', 30), FROM = +val('from', 0), TO = val('to', null);
const OUT = path.join(ROOT, 'assets/promo');
const POSTER_T = 4.4;
await mkdir(OUT, { recursive: true });
const tmp = path.join(os.tmpdir(), 'slop-promo');
await mkdir(tmp, { recursive: true });

const { chromium } = await loadPlaywright();
const { server, base } = await serve();
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });

async function render(cut) {
  const vertical = cut === 'v';
  const size = vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const page = await (await browser.newContext({ viewport: size, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(base + 'promo/?render=1' + (vertical ? '&v=1' : ''));
  await page.waitForFunction(() => window.__promo && window.__promo.ready, null, { timeout: 120000 });
  const dur = await page.evaluate(() => window.__promo.duration);
  const t1 = TO != null ? Math.min(dur, +TO) : dur;
  const test = TO != null || FROM > 0;
  const name = 'slopographic-promo' + (vertical ? '-vertical' : '') + (test ? '-test' : '');
  // soundtrack
  const wav = path.join(tmp, name + '.wav');
  await writeFile(wav, Buffer.from(await page.evaluate(() => window.__promo.wav()), 'base64'));
  // frames -> ffmpeg (mjpeg over a pipe)
  const mp4 = path.join(OUT, name + '.mp4');
  const ff = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(FROM), '-t', String(t1 - FROM), '-i', wav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', vertical ? '22' : '21', '-maxrate', '1500k', '-bufsize', '3000k',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
  const n = Math.round((t1 - FROM) * FPS), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = FROM + i / FPS;
    await page.evaluate((s) => window.__promo.seek(s), t);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92, timeout: 120000 });
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${cut} ${t.toFixed(1)}s / ${t1.toFixed(1)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
  }
  ff.stdin.end();
  await done;
  if (!test) {
    await page.evaluate((s) => window.__promo.seek(s), POSTER_T);
    const png = path.join(tmp, name + '.png');
    await page.screenshot({ path: png });
    ffmpeg(['-i', png, '-q:v', '3', path.join(OUT, name + '.jpg')]);
  }
  await page.context().close();
  const s = await stat(mp4);
  console.log(`${mp4}  ${(s.size / 1048576).toFixed(1)} MB  ${(t1 - FROM).toFixed(1)}s`);
}

for (const cut of only) await render(cut);
await browser.close(); server.close();
await rm(tmp, { recursive: true, force: true });
