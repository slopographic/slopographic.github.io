// Shake anger and calm-down snacks.
// Shaking him while you drag: gentle wiggles make him giggle, real shaking makes him woozy, then
// mad (same rage meter as drops and throws). Once he is MAD the meter stops draining until you give
// him something from the "Give…" tray: a treat is placed near him (treats.js) and he goes and eats
// it when he's calm enough. Each item calms a different amount; he has a favourite (extra happy)
// and a least favourite (spits it out, madder). Items restock over time and more
// unlock with levels. Petting helps a little, but not at full rage.
import { M, now, reduced, setMood, changed, rand, cheer, listeners } from './state.js';
import { say, hearts, sparkle, crumbs } from './fx.js';
import { line, tr } from './lines.js';
import { size } from './look.js';
import { save } from './store.js';
import { addRage, calmRage, MAD, persistRage } from './rage.js';
import { offer, tickTreats } from './treats.js';
import { makeCandy, candyOut } from './candy.js';

export const ITEMS = [
  { id: 'cookie', icon: '🍪', name: 'ui.buddy.item.cookie', calm: 1.0, cd: 20000, level: 1, act: 'eat' },
  { id: 'candy', icon: '🍬', name: 'ui.buddy.item.candy', calm: 0.8, cd: 25000, level: 1, act: 'eat' },
  { id: 'juice', icon: '🧃', name: 'ui.buddy.item.juice', calm: 1.2, cd: 40000, level: 2, act: 'eat' },
  { id: 'plush', icon: '🧸', name: 'ui.buddy.item.plush', calm: 1.5, cd: 60000, level: 3, act: 'hug' },
  { id: 'hat', icon: '🎩', name: 'ui.buddy.item.hat', calm: 2.0, cd: 120000, level: 4, act: 'hat' },
];
const byId = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** How much an item calms him (negative: he hates it and gets madder). */
export function calmValue(id, fav = M.fav, hate = M.hate) {
  const it = byId[id];
  if (!it) return 0;
  if (id === hate) return -0.5;
  return it.calm * (id === fav ? 2 : 1);
}
export const unlocked = (level = M.level) => ITEMS.filter((i) => i.level <= level);
export const ready = (id, t = Date.now()) => t >= ((M.stock || {})[id] || 0);

/** Pick a favourite and a least favourite once per person, and keep them. */
function tastes() {
  if (M.fav && M.hate && M.fav !== M.hate) return;
  const ids = ITEMS.map((i) => i.id).sort(() => Math.random() - 0.5);
  M.fav = ids[0];
  M.hate = ids[1];
  save({ fav: M.fav, hate: M.hate });
}

/** He eats (or hugs) an item: apply its effect. Returns the change in rage (negative = calmer). */
export function feed(id) {
  const it = byId[id];
  if (!it) return null;
  const v = calmValue(id);
  const before = M.rage;
  if (v < 0) {
    M.squash = -0.5;
    setMood('annoyed', 2200);
    say(line('spit'), 1800, { force: true });
    if (!reduced()) crumbs(M.x + 20, M.y - size() * 0.4, '#a6ee14', 8);
    if (M.raging) M.raging += 3000; else M.rage = Math.min(2.5, M.rage - v);
  } else {
    if (it.act === 'hat') { const hats = ['crown', 'tophat', 'wizard', 'party', 'cowboy']; M.tempHat = hats[Math.floor(Math.random() * hats.length)]; }
    const fav = it.id === M.fav;
    cheer(fav ? 1 : 0.6);
    setMood(it.act === 'hug' || fav ? 'love' : 'chomp', fav ? 1600 : 900);
    M.squash = 0.6;
    if (!reduced()) { hearts(fav ? 6 : 2); if (fav) sparkle(); }
    say(fav ? tr('ui.buddy.omg', { item: tr(it.name).toLocaleUpperCase() }) : line(it.act === 'hug' ? 'hug' : 'snack'), 1800, { force: true });
    if (M.raging && v >= 1.5) calmRage();
    M.rage = Math.max(0, M.rage - v);
    if (before >= MAD && M.rage < MAD && !M.raging) setTimeout(() => say(line('calmed'), 1600), 1900);
  }
  persistRage();
  changed();
  return M.rage - before;
}

/** Petting: a little calming, but not at full rage. Returns false when he refuses. */
export function petAllowed() {
  if (M.raging || M.rage >= 2.5) { say(line('nopets'), 1400, { force: true }); M.squash = -0.3; return false; }
  if (M.rage > 0) { M.rage = Math.max(0, M.rage - 0.15); persistRage(); changed(); }
  return true;
}

/* ---------- shaking ---------- */
let samples = [], lastTier = 0, lastLevel = 0;
/**
 * Shake intensity over the last second of drag samples [[t, x, y], …]:
 * direction reversals (of fast moves) × mean speed / 1000. Gentle wiggles score under 2;
 * a real shake scores 8 or more.
 */
export function shakeScore(list) {
  let rev = 0, speed = 0, n = 0, px = 0, py = 0;
  for (let i = 1; i < list.length; i++) {
    const [t0, x0, y0] = list[i - 1], [t1, x1, y1] = list[i], dt = Math.max(8, t1 - t0) / 1000;
    const vx = (x1 - x0) / dt, vy = (y1 - y0) / dt, v = Math.hypot(vx, vy);
    speed += v; n++;
    if (v > 150) {
      if ((px && Math.sign(vx) !== Math.sign(px) && Math.abs(vx) > 150) || (py && Math.sign(vy) !== Math.sign(py) && Math.abs(vy) > 150)) rev++;
      px = vx; py = vy;
    }
  }
  return n ? (rev * (speed / n)) / 1000 : 0;
}
export const SHAKE = { giggle: 1.5, woozy: 4, mad: 8 };

/** Start an item's cooldown. Returns false if it isn't available yet (or not unlocked). */
export function take(id) {
  const it = byId[id];
  if (!it || it.level > M.level || !ready(id)) return false;
  M.stock = Object.assign({}, M.stock, { [id]: Date.now() + it.cd });
  save({ stock: M.stock });
  return true;
}
export const item = (id) => byId[id];

/** Called by input.js for every drag move. */
export function onDrag(t, x, y) {
  samples.push([t, x, y]);
  while (samples.length && t - samples[0][0] > 1000) samples.shift();
  const sc = shakeScore(samples);
  const tier = sc >= SHAKE.mad ? 3 : sc >= SHAKE.woozy ? 2 : sc >= SHAKE.giggle ? 1 : 0;
  if (!tier || (tier <= lastLevel && t - lastTier < 1300)) return sc;   // escalating always reacts
  lastTier = t;
  lastLevel = tier;
  if (tier === 3) { samples = []; setMood('woozy', 1800); slosh(); addRage(1, 'shake'); }
  else if (tier === 2) { setMood('woozy', 1500); slosh(); say(line('woozy'), 1000); }
  else say(line('giggle'), 900);
  return sc;
}
export const dragEnded = () => { samples = []; };
function slosh() { if (!reduced()) crumbs(M.x, M.y - size() * 0.5, '#a6ee14', 7); }

/* ---------- the 'Give…' section (opens only when pressed; the tray shows while he is angry) ---------- */
let tray = null, giveBtn = null, giveBody = null, candyBtn = null, giveOpen = false;
export function mount(panel) {
  tastes();
  tray = document.createElement('div');
  tray.className = 'sh-give';
  tray.hidden = true;
  giveBtn = document.createElement('button');
  giveBtn.type = 'button';
  giveBtn.className = 'sh-give-l';
  giveBtn.setAttribute('aria-controls', 'sh-give-body');
  giveBtn.addEventListener('click', () => { giveOpen = !giveOpen; render(); });
  giveBody = document.createElement('div');
  giveBody.className = 'sh-give-body';
  giveBody.id = 'sh-give-body';
  giveBody.hidden = true;
  candyBtn = document.createElement('button');
  candyBtn.type = 'button';
  candyBtn.className = 'sh-mk';
  candyBtn.addEventListener('click', () => makeCandy());
  giveBody.append(candyBtn);
  for (const it of ITEMS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sh-item';
    b.dataset.item = it.id;
    b.textContent = it.icon;
    b.addEventListener('click', () => { if (take(it.id)) offer(it.id); });
    giveBody.append(b);
  }
  tray.append(giveBtn, giveBody);
  panel.append(tray);
  listeners.add(render);                   // the candy button follows changes at once
  render();
}

function render() {
  if (!tray) return;
  const t = Date.now();
  tray.hidden = !(M.rage >= 1 || M.raging);
  if (tray.hidden || !M.hudOpen) giveOpen = false;
  giveBody.hidden = !giveOpen;
  giveBtn.setAttribute('aria-expanded', String(giveOpen));
  // the words, here so a language switch reaches them on the next render
  giveBtn.textContent = tr('ui.buddy.give');
  candyBtn.textContent = tr('ui.buddy.make_candy');
  candyBtn.title = tr('ui.buddy.make_candy_tip');
  candyBtn.disabled = candyOut();
  for (const b of giveBody.querySelectorAll('.sh-item')) {
    const it = byId[b.dataset.item];
    b.hidden = it.level > M.level;
    b.title = tr('ui.buddy.give_him', { item: tr(it.name) });
    b.setAttribute('aria-label', tr('ui.buddy.give_sloppo', { item: tr(it.name) }));
    b.disabled = !ready(it.id, t);
    const left = Math.max(0, ((M.stock || {})[it.id] || 0) - t);
    b.style.setProperty('--cd', left ? (left / it.cd).toFixed(3) : 0);
  }
}
let nextRender = 0;
export function tick(dt, t) {
  tickTreats(dt, t);
  if (t > nextRender) { nextRender = t + 250; render(); }
}
