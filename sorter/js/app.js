/* Slop Photo Sorter: swipe through a pile of photos and keep the best. Photos come from a drop, Choose files or a whole
 * folder; they stay in this browser's memory (nothing is uploaded or stored). Start sorting opens the swipe deck shared
 * with Slop Gallery (shared/deck/deck.js): like, dislike, skip, back, tag. The grid shows each photo with its decision and
 * tags, filtered by All, Not sorted yet, Liked, Disliked or a tag; a click opens the deck there. The liked photos download
 * as a ZIP or go to Slop Drive; the decisions download as CSV. The model is js/model.js. */
import { writeZip } from '../../shared/office/zip.js';

const M = window.SlopSorter.model, UI = window.SlopUI, $ = (id) => document.getElementById(id);
const set = M.create(), urls = new Map();
let which = 'all', dropZone = null;
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const say = (msg) => { $('soMsg').textContent = msg || ''; };
const urlOf = (id) => { if (!urls.has(id)) { const it = set.get(id); if (it) urls.set(id, URL.createObjectURL(it.file)); } return urls.get(id) || null; };
const shown = () => M.filter(set.items, which);

const deck = window.SlopDeck.create({
  photo: (id) => set.get(id), url: (id) => Promise.resolve(urlOf(id)), release: () => {},
  setLiked: (id, v) => set.setLiked(id, v), addTag: (id, tag) => set.addTag(id, tag), removeTag: (id, tag) => set.removeTag(id, tag),
  on: (fn) => set.on(fn), onClose: () => draw(),
});

function add(files) {
  const added = set.add(files);
  const skipped = [...(files || [])].length - added.length;
  say(added.length ? (skipped ? t('sorter.app.added_skipped', { n: added.length, others: t('sorter.app.others', { n: skipped }) }) : t('sorter.app.added', { n: added.length }))
    : t('sorter.app.no_photos'));
  draw();
  return added;
}

/** The filter buttons with their counts; a tag gets its own button once a photo has it. */
function drawFilters(c) {
  const opts = [['all', t('sorter.app.f_all', { n: c.all })], ['unsorted', t('sorter.app.f_unsorted', { n: c.unsorted })], ['liked', t('sorter.app.f_liked', { n: c.liked })], ['disliked', t('sorter.app.f_disliked', { n: c.disliked })],
    ...c.tags.map(([tag, n]) => [`tag:${tag}`, `#${tag} ${n}`])];
  if (!opts.some(([k]) => k === which)) which = 'all';
  $('soFilters').replaceChildren(...opts.map(([k, label]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'so-filter'; b.textContent = label; b.setAttribute('aria-pressed', String(k === which));
    b.addEventListener('click', () => { which = k; draw(); });
    return b;
  }));
}

function card(it, i, list) {
  const li = document.createElement('li');
  li.className = `so-card${it.liked ? ' is-' + it.liked : ''}`;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'so-thumb'; b.title = t('sorter.app.sort_here_tip', { name: it.name });
  b.setAttribute('aria-label', it.liked ? t('sorter.app.sort_here_state', { name: it.name, state: t('sorter.app.' + it.liked) }) : t('sorter.app.sort_here', { name: it.name }));
  const img = document.createElement('img');
  img.loading = 'lazy'; img.alt = ''; img.src = urlOf(it.id);
  b.append(img);
  b.addEventListener('click', () => deck.open(list.map((x) => x.id), { start: i }));
  const badge = document.createElement('span');
  badge.className = 'so-badge'; badge.textContent = it.liked === 'liked' ? '♥' : it.liked === 'disliked' ? '✕' : '';
  const name = document.createElement('span');
  name.className = 'so-name'; name.textContent = it.tags.length ? `${it.name} · ${it.tags.map((t) => '#' + t).join(' ')}` : it.name;
  li.append(b, badge, name);
  return li;
}

function draw() {
  const items = set.items, c = M.counts(items), list = shown();
  $('soWork').hidden = items.length === 0;
  if (dropZone) dropZone.empty(!items.length);
  drawFilters(c);
  $('soGrid').replaceChildren(...list.map((it, i) => card(it, i, list)));
  $('soNone').hidden = list.length > 0;
  $('soStart').textContent = c.unsorted ? t('sorter.app.start_n', { n: c.unsorted }) : t('sorter.app.again');
  $('soStart').disabled = !items.length;
  for (const id of ['soZip', 'soDrive']) $(id).disabled = !c.liked;
  $('soCsv').disabled = $('soClear').disabled = !items.length;
}

/** Start sorting: the photos not sorted yet (or, when all are, the ones shown). */
function start() {
  const todo = M.filter(set.items, 'unsorted'), list = todo.length ? todo : shown();
  if (list.length) deck.open(list.map((x) => x.id));
}

const liked = () => M.filter(set.items, 'liked');
/** A name not used yet in the ZIP or the Drive folder (two photos of the same name from different folders). */
function names(list) {
  const seen = new Set();
  return list.map((x) => {
    let n = x.name, k = 2;
    while (seen.has(n.toLowerCase())) n = x.name.replace(/(\.[^.]*)?$/, (ext) => ` (${k++})${ext || ''}`);
    seen.add(n.toLowerCase());
    return n;
  });
}
async function zipLiked() {
  const list = liked(), n = names(list);
  say(t('sorter.app.packing', { n: list.length }));
  const bytes = await writeZip(list.map((x, i) => ({ path: n[i], data: x.file })), { compress: false });   // photos are compressed already
  UI.download(bytes, 'liked-photos.zip');   // writeZip gives a Blob already
  say(t('sorter.app.zipped', { n: list.length }));
}
async function driveLiked() {
  const H = window.SlopHub;
  if (!H) { say(t('sorter.app.no_drive')); return; }
  const list = liked(), n = names(list), stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const folderId = await H.appSubfolderId('sorter', `Liked ${stamp}`);
  for (let i = 0; i < list.length; i++) await H.put(list[i].file, { name: n[i], from: 'sorter', folderId, meta: { tags: list[i].tags } });
  say(t('sorter.app.saved_drive', { n: list.length, folder: `Photo Sorter › Liked ${stamp}` }));   // the folder's name is the user's data: English
}
function clear() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear(); set.clear(); which = 'all'; say(''); draw();
}

function wire() {
  // The one way in (shared/intake, spec 'sorter'): a drop of photos or folders, the zone's Choose files and sample, Choose
  // a folder…, a paste, ?drive=<id> (another app's Open in Photo Sorter) and a PWA launch reach add().
  window.SlopIntake.register({
    id: 'sorter', accept: { types: ['image/*'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg', '.bmp'], noun: 'sorter.app.a_photo' },
    processAll: async (files) => { add(files); return files.map((f) => f.name); },
  });
  dropZone = window.SlopDrop.attach($('soDrop'), {
    intake: 'sorter', label: 'sorter.drop.label', hint: 'sorter.drop.hint',
    preview: { picture: { src: '../assets/shots/sorter.jpg', alt: 'sorter.drop.alt' },
      steps: ['sorter.drop.step1', 'sorter.drop.step2', 'sorter.drop.step3'] },
    sample: { label: 'sorter.drop.sample', files: () => window.SlopSamples.photos(8) },
    files: (dt) => window.SlopDrop.folders.read(dt),   // a dropped folder is read whole, keeping each photo's folder path
  });
  $('soFolder').addEventListener('click', () => window.SlopIntake.pick({ to: 'sorter', folder: true }));
  if (window.SlopHub) { try { window.SlopHub.register('sorter'); } catch (e) { /* bus unavailable */ } }
  window.SlopIntake.launch({ to: 'sorter' });
  $('soStart').addEventListener('click', start);
  $('soZip').addEventListener('click', zipLiked);
  $('soDrive').addEventListener('click', driveLiked);
  $('soCsv').addEventListener('click', () => UI.download(new Blob([M.csv(set.items)], { type: 'text/csv' }), 'photo-decisions.csv'));
  $('soClear').addEventListener('click', clear);
  set.on(() => draw());
  addEventListener('beforeunload', (e) => { if (set.items.some((x) => x.liked || x.tags.length)) { e.preventDefault(); e.returnValue = ''; } });
  // a language change: the filters, the cards, the start button (and the status line, kept as it was said)
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => draw());
  draw();
}

wire();
window.SlopSorter.app = { set, deck, add, clear, start, draw, zipLiked, driveLiked, get which() { return which; } };
// SlopCmd: the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
if (window.SlopCmd) { window.SlopCmd.init({ app: 'sorter' }); if (window.SlopCmd.provide) window.SlopCmd.provide({ prepare: () => import('./ai-commands.js') }); }
