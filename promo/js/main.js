// Slopographic promo: a deterministic motion piece. Every frame is a pure function of t.
//   ?t=12.5   show that moment (frozen)      ?v=1   1080x1920 vertical cut
//   ?render=1 no UI, for tools/capture/render-promo.mjs
// API: window.__promo = { ready, duration, size, seek(t) -> Promise (waits for video seeks), play(), pause(), wav() }
import { makePlan } from './plan.js';
import { BEAT } from './ease.js';
import { makeBackdrop } from './scenes/backdrop.js';
import { makeIntro } from './scenes/intro.js';
import { makeChapter } from './scenes/chapter.js';
import { makeApp } from './scenes/app.js';
import { makeMontage } from './scenes/montage.js';
import { makePillars } from './scenes/pillars.js';
import { makeOutro } from './scenes/outro.js';
import { renderScore, wavBlob } from './audio/score.js';

const q = new URLSearchParams(location.search);
const vertical = q.get('v') === '1';
const rendering = q.has('render');
const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
const plan = makePlan(window.SLOP_APPS || []);
const stage = document.getElementById('stage');
stage.classList.toggle('v', vertical);
document.documentElement.classList.toggle('render', rendering);
stage.style.width = W + 'px'; stage.style.height = H + 'px';

const videos = new Set();
const ctx = {
  vertical, W, H, plan, root: '../',
  /** A clip <video> that the timeline drives. setTime(v, s) asks for frame s of it. */
  video(src, poster) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.loop = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    if (poster) v.poster = poster;
    const sources = [['webm', 'video/webm'], ['mp4', 'video/mp4']].map(([ext, type]) => { const s = document.createElement('source'); s.src = src + '.' + ext; s.type = type; return s; });
    v.append(...sources);
    v.addEventListener('error', () => v.classList.add('broken'), true);
    v._want = 0; v._on = false;
    videos.add(v);
    return v;
  },
  setTime(v, s, on = true) { v._on = on; if (on) v._want = Math.max(0, s); },
};

const scenes = [makeBackdrop(ctx)];
for (const seg of plan.segs) {
  const make = { intro: makeIntro, chapter: makeChapter, app: makeApp, montage: makeMontage, pillars: makePillars, outro: makeOutro }[seg.type];
  const s = make(seg, ctx);
  s.seg = seg;
  scenes.push(s);
}
for (const s of scenes) stage.append(s.el);

let now = 0, started = false;
export const POSTER_T = 4.2; // SLOPOGRAPHIC fully on screen
function frame(t) {
  now = t;
  for (const s of scenes) {
    const seg = s.seg;
    if (!seg) { s.render(t); continue; }
    const pre = s.pre ?? 0.35, post = s.post ?? 0.35;
    const on = t >= seg.start - pre && t < seg.start + seg.dur + post;
    if (!on) { if (s.el.style.display !== 'none') { s.el.style.display = 'none'; s.hide?.(); } continue; }
    s.el.style.display = '';
    s.render(t - seg.start, t);
  }
}

/** Seek videos to their wanted frames; resolves when every visible one has the frame. */
function syncVideos(exact) {
  const waits = [];
  for (const v of videos) {
    if (!v._on || !v.isConnected || v.classList.contains('broken')) { if (!v.paused) v.pause(); continue; }
    const d = v.duration;
    if (!d || !isFinite(d)) { if (exact) waits.push(new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 3000); }).then(() => syncOne(v, exact))); continue; }
    waits.push(syncOne(v, exact));
  }
  return Promise.all(waits);
}
function syncOne(v, exact) {
  const d = v.duration || 1, want = v._want % d;
  if (exact) {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - want) < 1 / 120) return Promise.resolve();
    return new Promise((r) => { v.addEventListener('seeked', r, { once: true }); setTimeout(r, 4000); v.currentTime = want; });
  }
  if (v.paused) { v.currentTime = want; v.play().catch(() => {}); }
  else if (Math.abs(v.currentTime - want) > 0.25 && Math.abs(v.currentTime - want) < d - 0.25) v.currentTime = want;
  return Promise.resolve();
}

/* ---------- live playback ---------- */
let playing = false, ac = null, src = null, t0 = 0, audioP = null, raf = 0;
const getAudio = () => audioP || (audioP = renderScore(plan));
async function play(from = !started || now >= plan.total - 0.05 ? 0 : now) {
  if (playing) return;
  started = true;
  document.documentElement.classList.add('started');
  playing = true;
  document.documentElement.classList.add('playing', 'loading');
  ac = ac || new AudioContext();               // made inside the click, so it may play sound
  const resumed = ac.resume();
  const buf = await getAudio();
  await resumed;
  document.documentElement.classList.remove('loading');
  if (!playing) return;
  src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination);
  t0 = ac.currentTime - from;
  src.start(0, from);
  src.onended = () => { if (playing && ac.currentTime - t0 >= plan.total - 0.1) pause(); };
  const loop = () => { if (!playing) return; const t = Math.min(plan.total, ac.currentTime - t0); frame(t); syncVideos(false); updateUI(t); raf = requestAnimationFrame(loop); };
  loop();
}
function pause() {
  playing = false;
  document.documentElement.classList.remove('playing');
  cancelAnimationFrame(raf);
  if (src) { try { src.stop(); } catch (e) { /* already stopped */ } src = null; }
  for (const v of videos) v.pause();
  updateUI(now);
}

/* ---------- UI ---------- */
const ui = document.getElementById('ui'), btn = document.getElementById('playBtn'), bar = document.getElementById('scrub');
function updateUI(t) {
  if (!ui) return;
  bar.value = String(t / plan.total * 1000);
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Play with sound');
  btn.classList.toggle('on', playing);
}
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = rendering ? 'none' : `translate(-50%, -50%) scale(${s})`;
}
addEventListener('resize', fit); fit();
if (ui && !rendering) {
  btn.addEventListener('click', () => (playing ? pause() : play()));
  document.getElementById('cover').addEventListener('click', () => play(0));
  bar.addEventListener('input', () => { const t = bar.value / 1000 * plan.total; started = true; document.documentElement.classList.add('started'); const was = playing; if (was) pause(); frame(t); syncVideos(true); if (was) play(t); });
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); btn.click(); } });
  document.getElementById('vLink').href = vertical ? './' : './?v=1';
  document.getElementById('vLink').textContent = vertical ? '16:9' : '9:16';
}

async function seek(t) { frame(t); await syncVideos(true); await new Promise((r) => requestAnimationFrame(() => r())); }
async function wav() { const blob = wavBlob(await getAudio()); const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }

window.__promo = { ready: false, duration: plan.total, size: { W, H }, beat: BEAT, plan, seek, play, pause, wav, get t() { return now; } };
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
  const start = q.has('t') ? parseFloat(q.get('t')) || 0 : rendering ? 0 : POSTER_T;
  return seek(start);
}).then(() => { window.__promo.ready = true; updateUI(now); if (!rendering) setTimeout(() => getAudio(), 400); });
