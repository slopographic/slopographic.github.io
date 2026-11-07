/* Slop Compare: the two sides, A (original) and B (changed). Each is a text box (type or paste text; a text file opens
 * in it, still editable) or, for a PDF or a picture, a card with the file. Every file comes in through the intake (spec
 * 'diff', main.js): Open… and Slop Drive… on each side pass the side as data, and a drop on a side lands there.
 *   wire({ onEdit })   once: the buttons, the drops, the typing (onEdit after a pause, for the live re-compare)
 *   refresh()          draws both sides from S.sides
 *   readFile(file)     a side's value for a file: { name, type, file } for a PDF or picture, { name, type, text } for text */
import { S, setSide, clearSide, swap } from './state.js';
import { kindOf } from '../core/kind.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const SIDES = ['a', 'b'];
const kb = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const urls = { a: '', b: '' };

export async function readFile(file) {
  const kind = kindOf(file.name, file.type);
  if (!kind) throw new Error(t('diff.err.not_kind'));
  if (kind === 'pdf' || kind === 'image') return { name: file.name, type: file.type, file };
  if (file.size > 30 * 1048576) throw new Error(t('diff.err.too_long'));
  return { name: file.name, type: file.type, text: await file.text() };
}

function card(k) {
  const s = S.sides[k], box = $(`df-${k}-file`);
  if (urls[k]) { URL.revokeObjectURL(urls[k]); urls[k] = ''; }
  box.textContent = '';
  if (!s.file) { box.hidden = true; return; }
  const kind = kindOf(s.name, s.type);
  if (kind === 'image') {
    urls[k] = URL.createObjectURL(s.file);
    const img = Object.assign(document.createElement('img'), { src: urls[k], alt: `${k.toUpperCase()}: ${s.name}`, className: 'df-thumb' });
    box.append(img);
  } else {
    const tag = document.createElement('span');
    tag.className = 'df-pdf'; tag.textContent = 'PDF'; tag.setAttribute('aria-hidden', 'true');
    box.append(tag);
  }
  const meta = document.createElement('p');
  meta.className = 'df-meta';
  meta.textContent = `${kind === 'pdf' ? 'PDF' : t('diff.side.picture')} · ${kb(s.file.size)}`;
  box.append(meta);
  box.hidden = false;
}

export function refresh() {
  for (const k of SIDES) {
    const s = S.sides[k], ta = $(`df-${k}-text`);
    ta.hidden = !!s.file;
    if (!s.file && ta.value !== s.text) ta.value = s.text;
    $(`df-${k}-name`).textContent = s.name || (s.text ? t('diff.side.typed') : '');
    $(`df-${k}-name`).title = s.name || '';
    card(k);
    for (const b of document.querySelectorAll(`.df-side[data-side="${k}"] [data-act="clear"]`)) b.disabled = !s.file && !s.text;
  }
  $('df-swap').disabled = !S.sides.a.file && !S.sides.a.text && !S.sides.b.file && !S.sides.b.text;
}

export function wire({ onEdit }) {
  let timer = 0;
  for (const k of SIDES) {
    const ta = $(`df-${k}-text`);
    ta.addEventListener('input', () => {
      S.sides[k].text = ta.value;
      if (!S.sides[k].name) $(`df-${k}-name`).textContent = ta.value ? t('diff.side.typed') : '';
      clearTimeout(timer); timer = setTimeout(onEdit, 350);
    });
    const side = document.querySelector(`.df-side[data-side="${k}"]`);
    window.SlopIntake.dropTarget(side, { to: 'diff', data: () => ({ side: k }) });
    side.addEventListener('dragover', () => side.classList.add('df-over'));
    for (const ev of ['dragleave', 'drop']) side.addEventListener(ev, () => side.classList.remove('df-over'));
  }
  document.getElementById('df-sides').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const k = b.dataset.side;
    if (b.dataset.act === 'open') window.SlopIntake.pick({ to: 'diff', data: { side: k }, multiple: false });
    else if (b.dataset.act === 'drive') window.SlopIntake.fromDrive({ to: 'diff', data: { side: k }, title: t('diff.side.drive_title', { side: k.toUpperCase() }) });
    else if (b.dataset.act === 'clear') { clearSide(k); $(`df-${k}-text`).focus(); }
  });
  $('df-swap').addEventListener('click', swap);
}

export { setSide };
