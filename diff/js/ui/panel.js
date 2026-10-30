/* Slop Compare: the settings in the right panel (SlopFrame.panel; a bottom sheet on phones), drawn from the one table of
 * options (core/compare.js OPTIONS), so the panel, the commands and the Workflows step offer the same choices.
 *   build(host) → { sections(kind) }   the form controls (ids df-opt-<key>) in their sections; every change goes to setOpts
 *   sync()      the controls show S.opts again (after a command changed them)
 * Sections: Compare (as, view, whitespace, case, context lines), CSV (the key column, with the columns as suggestions),
 * Pictures and PDFs (the view, the threshold, PDF text or pages). The words are the page's (diff/i18n: diff.opt.<key>,
 * diff.opt.<key>_<value>, diff.opt.<key>_hint), marked so a language change rewrites them; OPTIONS keeps the English. */
import { S, setOpts } from './state.js';
import { OPTIONS } from '../core/compare.js';
import { t, mark } from './i18n.js';

const BY = Object.fromEntries(OPTIONS.map((o) => [o.key, o]));
const el = (tag, attrs = {}, text) => { const n = Object.assign(document.createElement(tag), attrs); if (text != null) n.textContent = text; return n; };
const word = (tag, attrs, key) => mark(el(tag, attrs), key);

function field(key) {
  const o = BY[key], id = `df-opt-${key}`;
  if (typeof o.value === 'boolean') {
    const lab = el('label', { className: 'sf-field df-check' });
    const box = el('input', { type: 'checkbox', id });
    box.addEventListener('change', () => setOpts({ [key]: box.checked }));
    lab.append(box, word('span', {}, `diff.opt.${key}`));
    return lab;
  }
  if (o.options && o.options.length <= 3) {
    const wrap = el('div', { className: 'sf-field' });
    wrap.append(word('span', { className: 'sf-lab', id: `${id}-lab` }, `diff.opt.${key}`));
    const seg = el('div', { className: 'sf-seg', id, role: 'group' });
    seg.setAttribute('aria-labelledby', `${id}-lab`);
    for (const [v] of o.options) {
      const b = word('button', { type: 'button', className: 'sui-btn' }, `diff.opt.${key}_${v}`);
      b.dataset.value = v;
      b.addEventListener('click', () => setOpts({ [key]: v }));
      seg.append(b);
    }
    wrap.append(seg);
    return wrap;
  }
  const lab = el('label', { className: 'sf-field' });
  lab.append(word('span', { className: 'sf-lab' }, `diff.opt.${key}`));
  let input;
  if (o.options) {
    input = el('select', { id });
    for (const [v] of o.options) input.append(mark(new Option('', v), `diff.opt.${key}_${v}`));
    input.addEventListener('change', () => setOpts({ [key]: input.value }));
  } else if (typeof o.value === 'number') {
    input = el('input', { id, type: key === 'threshold' ? 'range' : 'number', min: o.min, max: o.max, step: 1 });
    input.addEventListener(key === 'threshold' ? 'input' : 'change', () => setOpts({ [key]: input.value }));
  } else {
    input = el('input', { id, type: 'text', autocomplete: 'off', spellcheck: false, placeholder: 'auto' });
    input.setAttribute('list', 'df-cols');
    input.addEventListener('change', () => setOpts({ [key]: input.value || 'auto' }));
  }
  lab.append(input);
  if (o.hint) lab.append(word('span', { className: 'sf-note' }, `diff.opt.${key}_hint`));
  return lab;
}

/** Has the person chosen the settings before (kept in this browser)? */
export function chosen() { try { return !!localStorage.getItem('slop-diff:opts'); } catch (e) { return false; } }

export function sync() {
  for (const o of OPTIONS) {
    const n = document.getElementById(`df-opt-${o.key}`), v = S.opts[o.key];
    if (!n) continue;
    if (n.classList.contains('sf-seg')) for (const b of n.children) b.setAttribute('aria-pressed', String(b.dataset.value === v));
    else if (n.type === 'checkbox') n.checked = !!v;
    else if (n.value !== String(v)) n.value = String(v);
  }
  const inp = document.getElementById('df-opt-threshold');
  if (inp) inp.title = `${S.opts.threshold}%`;
  const out = document.getElementById('df-thr-val');
  if (out) out.textContent = `${S.opts.threshold}%`;
  const cols = document.getElementById('df-cols');
  if (cols) { cols.textContent = ''; for (const c of (S.result && S.result.csv ? S.result.csv.columns : [])) cols.append(new Option(c)); cols.append(new Option('none')); }
}

export function build(host) {
  const group = (keys) => { const d = el('div', { className: 'df-group' }); for (const k of keys) d.append(field(k)); return d; };
  const compare = group(['mode', 'view', 'ignoreWs', 'ignoreCase', 'context']);
  const csv = group(['key']);
  csv.append(el('datalist', { id: 'df-cols' }));
  const pics = group(['imageView', 'threshold', 'pdfView']);
  const thr = pics.querySelector('#df-opt-threshold');
  thr.after(el('output', { id: 'df-thr-val', className: 'sf-note' }));
  host.append(compare, csv, pics);
  sync();
  return {
    /** The sections to show for what is compared (kind: the result's, or null before a comparison). */
    sections(kind) {
      const all = !kind;
      return [{ title: t('diff.panel.compare'), key: 'compare', settings: compare }]
        .concat(all || kind === 'csv' ? [{ title: 'CSV', key: 'csv', settings: csv }] : [])
        .concat(all || kind === 'image' || kind === 'pdf' ? [{ title: t('diff.panel.pics'), key: 'pics', settings: pics }] : []);
    },
  };
}
