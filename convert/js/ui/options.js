/* Builds the option controls for a conversion from its spec list, and reads their values back.
 * Every control has a label; hints are linked with aria-describedby. type 'password' is a masked field (Protect PDF).
 * type 'image' (an operation of the registry, shared/ops: Watermark's logo) is a picture chosen from the device, kept as a
 * data URL: a thumbnail and Remove beside the file field, and a bubbling 'change' once the picture is read.
 * type 'watermark' (Watermark's spec option) is a choice of My watermarks, the watermarks saved in any app
 * (shared/watermark/saved.js, loaded on first use): the chosen one's spec, as JSON, is the value. */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';

/** prefix: a file's id and a dash ('3-') on its card, 'bulk-' in the bulk bar, so every id on the page is unique. */
const idOf = (key, prefix = '') => `cv-o-${prefix}${key}`;

export function renderOptions(container, specs, defaults = {}, prefix = '') {
  container.replaceChildren();
  for (const s of specs) {
    const id = idOf(s.key, prefix);
    const value = defaults[s.key] !== undefined ? defaults[s.key] : s.value;
    const hint = s.hint ? h('p', { class: 'cv-hint', id: `${id}-hint` }, s.hint) : null;
    const describe = s.hint ? `${id}-hint` : null;
    let control, wrap;
    if (s.type === 'checkbox') {
      control = h('input', { type: 'checkbox', id, checked: !!value, 'aria-describedby': describe });
      wrap = h('div', { class: 'cv-opt cv-check' }, h('label', { for: id }, control, ' ', s.label), hint);
    } else if (s.type === 'select') {
      control = h('select', { id, 'aria-describedby': describe }, s.options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
      wrap = h('div', { class: 'cv-opt' }, h('label', { for: id }, s.label), control, hint);
    } else if (s.type === 'range') {
      const out = h('output', { for: id }, String(value));
      control = h('input', { type: 'range', id, min: s.min, max: s.max, step: 1, value, 'aria-describedby': describe, oninput: () => { out.textContent = control.value; } });
      wrap = h('div', { class: 'cv-opt' }, h('label', { for: id }, s.label, ' ', out), control, hint);
    } else if (s.type === 'image') {
      ({ control, wrap } = imageField(s, id, value, hint, describe));
    } else if (s.type === 'watermark') {
      ({ control, wrap } = watermarkField(s, id, value, hint, describe));
    } else if (s.type === 'color') {
      control = h('input', { type: 'color', id, value, 'aria-describedby': describe });
      wrap = h('div', { class: 'cv-opt' }, h('label', { for: id }, s.label), control, hint);
    } else {
      control = h('input', { type: s.type === 'number' ? 'number' : s.type === 'password' ? 'password' : 'text', id, autocomplete: s.type === 'password' ? 'new-password' : undefined, spellcheck: s.type === 'password' ? 'false' : undefined, min: s.min, max: s.max, step: s.step, placeholder: s.placeholder, value: value ?? '', 'aria-describedby': describe, inputmode: s.type === 'number' ? (s.step && s.step < 1 ? 'decimal' : 'numeric') : undefined });
      wrap = h('div', { class: 'cv-opt' }, h('label', { for: id }, s.label), control, hint);
    }
    container.append(wrap);
  }
}

/** Current values as { key: value }. Numbers are numbers, blank number fields are undefined, checkboxes are booleans. */
export function readOptions(container, specs, prefix = '') {
  const out = {};
  for (const s of specs) {
    const el = container.querySelector(`#${CSS.escape(idOf(s.key, prefix))}`);
    if (!el) continue;
    if (s.type === 'checkbox') out[s.key] = el.checked;
    else if (s.type === 'number') out[s.key] = el.value === '' ? undefined : Number(el.value);
    else if (s.type === 'image' || s.type === 'watermark') out[s.key] = el.dataset.value || '';
    else out[s.key] = el.value;
  }
  return out;
}

/** A picture option: the file field holds the chosen picture as a data URL in data-value. */
function imageField(s, id, value, hint, describe) {
  const control = h('input', { type: 'file', id, accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', 'aria-describedby': describe }); // intake-ok: a conversion option's picture field (a value of the option, not a file into the app)
  const thumb = h('img', { class: 'cv-img-thumb', alt: tr('convert.opts.chosen_pic', { label: s.label }), hidden: !value, src: value || undefined });
  const clear = h('button', { type: 'button', class: 'cv-img-clear', hidden: !value }, tr('ui.remove'));
  const set = (v) => {
    control.dataset.value = v || '';
    if (v) thumb.src = v; else thumb.removeAttribute('src');
    thumb.hidden = !v; clear.hidden = !v; control.value = '';
    control.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: 'set' }));
  };
  control.dataset.value = value || '';
  control.addEventListener('change', (e) => {
    if (e.detail === 'set') return;
    e.stopPropagation();
    const f = control.files && control.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => set(String(r.result || ''));
    r.readAsDataURL(f);
  });
  clear.addEventListener('click', () => set(''));
  const wrap = h('div', { class: 'cv-opt cv-image' }, h('label', { for: id }, s.label), h('div', { class: 'cv-img-row' }, thumb, control, clear), hint);
  return { control, wrap };
}

const ROOT = new URL('../../../', import.meta.url);
const classic = (rel) => new Promise((res, rej) => {
  const src = new URL(rel, ROOT).href;
  if ([...document.scripts].some((x) => x.src === src)) { res(); return; }
  document.head.append(Object.assign(document.createElement('script'), { src, async: false, onload: res, onerror: () => rej(new Error('Could not load ' + rel)) }));
});
let savedP = null;
/** My watermarks, newest first ([] where storage is off). */
function savedMarks() {
  if (!savedP) savedP = (async () => {
    if (!window.SlopWatermarkSpec) await classic('shared/watermark/spec.js');
    if (!window.SlopWatermarkSaved) await classic('shared/watermark/saved.js');
    return window.SlopWatermarkSaved.list();
  })().catch(() => []).finally(() => { setTimeout(() => { savedP = null; }, 0); });
  return savedP;
}
/** A saved watermark: a choice of My watermarks; the value is the chosen spec as JSON ('' for none). */
function watermarkField(s, id, value, hint, describe) {
  const control = h('select', { id, 'aria-describedby': describe }, h('option', { value: '' }, tr('convert.opts.wm_none')));
  let rows = [], name = '';
  try { name = value ? JSON.parse(value).name || tr('convert.opts.wm_before') : ''; } catch (e) { name = ''; }
  if (value) control.append(h('option', { value: '=', selected: true }, name || tr('convert.opts.wm_before')));
  control.dataset.value = value || '';
  savedMarks().then((list) => {
    rows = list;
    for (const r of rows) {
      const same = value && JSON.stringify(r.spec) === value;
      control.append(h('option', { value: r.id, selected: same }, r.name));
      if (same) { const cur = control.querySelector('option[value="="]'); if (cur) cur.remove(); }
    }
  });
  control.addEventListener('change', () => {
    const v = control.value, r = rows.find((x) => x.id === v);
    if (v !== '=') control.dataset.value = r ? JSON.stringify(r.spec) : '';
  });
  const wrap = h('div', { class: 'cv-opt' }, h('label', { for: id }, s.label), control, hint);
  return { control, wrap };
}
