/* SlopCut: inspector field widgets. Each returns { el, sync() }; sync() refreshes from the model
   without disturbing a field that has focus. set(v) runs inside SE.change with a coalescing key. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util;
  const h = U.h;
  const F = SE.fields = {};

  /** Apply a value to the selected clip(s) as one coalesced undo step. */
  F.setter = function (label, key, apply) {
    return (v) => SE.change(label, (p) => apply(p, v), { key: 'insp:' + key });
  };
  /** Slider + number. o: { min, max, step, unit, scale (display = value*scale), reset, hardMin, hardMax (what the number
   *  field takes, display units), curve: { steps, to(value) → slider position, from(position) → value } for a slider
   *  that is not linear (Scale: logarithmic, SE.fit) } */
  F.slider = function (label, get, set, o = {}) {
    const sc = o.scale || 1, dec = o.dec != null ? o.dec : (o.step || 1) < 1 ? 2 : 0, cv = o.curve;
    const range = cv ? h('input', { type: 'range', min: 0, max: cv.steps, step: 1, 'aria-label': label })
      : h('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, 'aria-label': label });
    const num = h('input', { class: 'inp', type: 'number', min: cv ? o.hardMin : o.min, max: cv ? o.hardMax : o.max, step: o.step || 1, 'aria-label': label + (o.unit ? ' (' + o.unit + ')' : ''), inputmode: 'decimal' });
    const put = (v) => set(U.clamp(v, o.hardMin != null ? o.hardMin : -Infinity, o.hardMax != null ? o.hardMax : Infinity) / sc);
    const shown = () => (cv ? cv.from(+range.value) * sc : +range.value);
    range.addEventListener('input', () => { const v = shown(); put(v); num.value = (+v).toFixed(dec); });
    range.addEventListener('change', () => SE.history.breakCoalescing());
    num.addEventListener('change', () => { if (num.value !== '' && isFinite(+num.value)) put(+num.value); SE.history.breakCoalescing(); });
    const name = h('span', { title: o.reset != null ? U.t('slopedit.insp.double_click_to_reset') : label }, label);
    if (o.reset != null) name.addEventListener('dblclick', () => { set(o.reset); SE.history.breakCoalescing(); });
    const el = h('label', { class: 'ins-row' }, name, range, num);
    const sync = () => { const v = get() * sc; if (document.activeElement !== range) range.value = String(cv ? cv.to(v / sc) : v); if (document.activeElement !== num) num.value = (+v).toFixed(dec); };
    sync();
    return { el, sync };
  };
  F.number = function (label, get, set, o = {}) {
    const num = h('input', { class: 'inp', type: 'number', min: o.min, max: o.max, step: o.step || 1, 'aria-label': label, inputmode: 'decimal' });
    num.addEventListener('change', () => { if (num.value !== '' && isFinite(+num.value)) set(+num.value); SE.history.breakCoalescing(); });
    const el = h('label', { class: 'ins-row' }, h('span', null, label), num, h('span', { class: 'ins-unit' }, o.unit || ''));
    const sync = () => { if (document.activeElement !== num) num.value = String(U.round(get(), o.dec != null ? o.dec : 3)); };
    sync();
    return { el, sync };
  };
  /** Two numbers in one row (x/y, w/h). */
  F.pair = function (label, a, b) {
    const mk = (f) => { const n = h('input', { class: 'inp', type: 'number', step: f.step || 1, 'aria-label': f.label, title: f.label, inputmode: 'decimal' }); n.addEventListener('change', () => { if (isFinite(+n.value)) f.set(+n.value); SE.history.breakCoalescing(); }); return n; };
    const na = mk(a), nb = mk(b);
    const el = h('div', { class: 'ins-row two' }, h('span', null, label), na, nb);
    const sync = () => { if (document.activeElement !== na) na.value = String(U.round(a.get(), 2)); if (document.activeElement !== nb) nb.value = String(U.round(b.get(), 2)); };
    sync();
    return { el, sync };
  };
  F.color = function (label, get, set) {
    const inp = h('input', { type: 'color', 'aria-label': label });
    const hex = h('input', { class: 'inp', type: 'text', maxlength: '7', 'aria-label': label + ' hex', spellcheck: 'false' });
    inp.addEventListener('input', () => { set(inp.value); hex.value = inp.value; });
    inp.addEventListener('change', () => SE.history.breakCoalescing());
    hex.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) set(hex.value.toLowerCase()); });
    const el = h('label', { class: 'ins-row' }, h('span', null, label), hex, inp);
    const sync = () => { const v = get() || '#000000'; if (document.activeElement !== inp) inp.value = v; if (document.activeElement !== hex) hex.value = v; };
    sync();
    return { el, sync };
  };
  F.select = function (label, options, get, set) {
    const s = h('select', { class: 'inp', 'aria-label': label }, options.map(([v, l]) => h('option', { value: v }, l)));
    s.addEventListener('change', () => set(s.value));
    const el = h('label', { class: 'ins-row' }, h('span', null, label), s, h('span'));
    const sync = () => { s.value = String(get()); };
    sync();
    return { el, sync };
  };
  /** Pill buttons; multi=false → one value. */
  F.chips = function (label, options, get, set) {
    const box = h('div', { class: 'ins-chips', role: 'group', 'aria-label': label });
    const btns = options.map(([v, l]) => { const b = h('button', { type: 'button', class: 'chip', onclick: () => set(v) }, l); b.dataset.v = String(v); box.append(b); return b; });
    const el = h('div', { class: 'ins-row' }, h('span', null, label), box);
    const sync = () => { const cur = get(); btns.forEach((b) => { const on = Array.isArray(cur) ? cur.includes(b.dataset.v) : String(cur) === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); };
    sync();
    return { el, sync };
  };
  F.text = function (label, get, set, { multiline = false } = {}) {
    const t = multiline ? h('textarea', { class: 'inp', rows: '3', 'aria-label': label, spellcheck: 'true' }) : h('input', { class: 'inp', type: 'text', 'aria-label': label });
    t.addEventListener('input', () => set(t.value));
    t.addEventListener('change', () => SE.history.breakCoalescing());
    const el = h('label', { class: 'ins-row' }, h('span', null, label), t);
    const sync = () => { if (document.activeElement !== t) t.value = get(); };
    sync();
    return { el, sync, input: t };
  };
  F.section = (title, icon, ...rows) => h('section', { class: 'ins-sec' }, h('h3', null, icon ? SE.icon(icon) : null, title), rows.map((r) => (r && r.el ? r.el : r)));
})();
