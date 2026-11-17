/* PhotoSlop UI: Image Size and Canvas Size dialogs (the work is in core/size.js) */
'use strict';

const SZ_MAX = 12000;
const szClamp = (v) => clamp(Math.round(v) || 1, 1, SZ_MAX);
const FILL_CHOICES = ['transparent', 'bg', 'fg', 'white', 'black'];   // the label is photoslop.size.fill_<value>
const SZ = (k, v) => tr('photoslop.size.' + k, v);
/** Colour for the new canvas area, or null for transparent. */
// a macro step's names for the anchor and the new area (ps.ai.canvas-size, app/ai-commands.js)
const SZ_ANCHOR = [['top-left', 'top', 'top-right'], ['left', 'center', 'right'], ['bottom-left', 'bottom', 'bottom-right']];
const SZ_FILL = { transparent: 'transparent', bg: 'background', fg: 'foreground', white: 'white', black: 'black' };
const canvasFill = (v) => ({ bg: C.bg, fg: C.fg, white: '#ffffff', black: '#000000' })[v] || null;
const LINK_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M6.5 9.5l3-3M7.2 4.6l1.3-1.3a2.6 2.6 0 0 1 3.7 3.7l-1.3 1.3M8.8 11.4l-1.3 1.3a2.6 2.6 0 0 1-3.7-3.7l1.3-1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

/** Anchor grid: nine positions. state.ax / state.ay: 0 = left/top, 1 = centre, 2 = right/bottom. */
function anchorGrid(state) {
  const g = h('div', { class: 'anchor', role: 'group', 'aria-label': SZ('anchor') });
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const b = h('button', { type: 'button', class: 'anchor-b' + (state.ax === i && state.ay === j ? ' on' : ''), 'aria-label': SZ('anchor_' + ['top', 'middle', 'bottom'][j] + '_' + ['left', 'centre', 'right'][i]) });
    b.addEventListener('click', () => { state.ax = i; state.ay = j; $$('.anchor-b', g).forEach((x) => x.classList.remove('on')); b.classList.add('on'); });
    g.append(b);
  }
  return g;
}
function dlgCanvasSize() {
  const w = numInput(D.w, 1, SZ_MAX), hh = numInput(D.h, 1, SZ_MAX), st = { ax: 1, ay: 1 };
  w.setAttribute('aria-label', SZ('width')); hh.setAttribute('aria-label', SZ('height'));
  const fill = h('select', { 'aria-label': SZ('extension') }, FILL_CHOICES.map((v) => h('option', { value: v }, SZ('fill_' + v))));
  dialog({ title: SZ('canvas_title'), body: h('div', { class: 'form' }, h('p', { class: 'dlg-p' }, SZ('current', { w: D.w, h: D.h })), field(SZ('width'), w, 'px'), field(SZ('height'), hh, 'px'),
    h('div', { class: 'field' }, h('span', { class: 'field-l' }, SZ('anchor')), anchorGrid(st)), field(SZ('new_area'), fill)),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => {
      const nw = szClamp(+w.value), nh = szClamp(+hh.value);
      if (nw === D.w && nh === D.h) return;
      resizeCanvas(nw, nh, Math.round(((nw - D.w) * st.ax) / 2), Math.round(((nh - D.h) * st.ay) / 2), SZ('canvas_title'), canvasFill(fill.value));
      fitView();
      if (window.SlopMacros) SlopMacros.note('ps.ai.canvas-size', { width: nw, height: nh, anchor: SZ_ANCHOR[st.ay][st.ax], fill: SZ_FILL[fill.value] || 'transparent' }, 'Canvas Size'); // i18n-ignore: saved in the macro
    } }] });
}
function dlgImageSize() {
  const pw = D.w, ph = D.h, flat = flattenCanvas();
  const st = { link: true, w: pw, h: ph };
  const wi = numInput(pw, 1, SZ_MAX), hi = numInput(ph, 1, SZ_MAX);
  wi.setAttribute('aria-label', SZ('width')); hi.setAttribute('aria-label', SZ('height'));
  const uw = h('span', { class: 'field-u' }, 'px'), uh = h('span', { class: 'field-u' }, 'px');
  const unit = h('select', { 'aria-label': SZ('units') }, h('option', { value: 'px' }, SZ('pixels')), h('option', { value: '%' }, SZ('percent')));
  const mode = h('select', { 'aria-label': SZ('resample') }, RESAMPLE_MODES.map(([v, l]) => h('option', { value: v, selected: v === 'bicubic' }, l)));
  const link = h('button', { type: 'button', class: 'btn primary', 'aria-pressed': 'true', title: SZ('keep_aspect') }, h('span', { html: LINK_ICON }), h('span', null, ' ' + SZ('keep_aspect'))); // i18n-ignore: ids, key names, CSS
  const prev = h('canvas', { 'aria-label': SZ('preview'), style: 'display:block;margin:8px auto;border:1px solid rgba(127,127,127,.5);max-width:100%' });
  const info = h('p', { class: 'dlg-p', 'aria-live': 'polite' });
  const base = (axis) => (axis === 'w' ? pw : ph);
  const shown = (px, axis) => (unit.value === '%' ? Math.round((px / base(axis)) * 1000) / 10 : px);
  const toPx = (v, axis) => szClamp(unit.value === '%' ? (v * base(axis)) / 100 : v);
  const read = () => { st.w = toPx(+wi.value || 1, 'w'); st.h = toPx(+hi.value || 1, 'h'); };
  const draw = () => {
    const s = Math.min(220 / st.w, 160 / st.h, 1), dw = Math.max(1, Math.round(st.w * s)), dh = Math.max(1, Math.round(st.h * s));
    prev.width = dw; prev.height = dh;
    const g = cx(prev); setInterp(g, 'bicubic'); g.clearRect(0, 0, dw, dh); g.drawImage(flat, 0, 0, dw, dh);
    info.textContent = SZ('new_size', { w: st.w, h: st.h, pw, ph });
  };
  // from = the field the person typed in: the linked field follows it.
  const onInput = (from) => {
    read();
    if (st.link) {
      if (from === 'w') { st.h = szClamp((st.w * ph) / pw); hi.value = shown(st.h, 'h'); }
      else { st.w = szClamp((st.h * pw) / ph); wi.value = shown(st.w, 'w'); }
    }
    draw();
  };
  wi.addEventListener('input', () => onInput('w'));
  hi.addEventListener('input', () => onInput('h'));
  unit.addEventListener('change', () => {
    uw.textContent = uh.textContent = unit.value === '%' ? '%' : 'px';
    wi.step = hi.step = unit.value === '%' ? 0.1 : 1;
    wi.value = shown(st.w, 'w'); hi.value = shown(st.h, 'h'); draw();
  });
  link.addEventListener('click', () => {
    st.link = !st.link; link.classList.toggle('primary', st.link); link.setAttribute('aria-pressed', String(st.link));
    if (st.link) onInput('w');
  });
  const row = (label, input, u) => h('label', { class: 'field' }, h('span', { class: 'field-l' }, label), input, u);
  draw();
  dialog({ title: SZ('image_title'), body: h('div', { class: 'form' }, row(SZ('width'), wi, uw), row(SZ('height'), hi, uh),
    h('div', { class: 'field' }, h('span', { class: 'field-l' }, SZ('units')), unit), h('div', { class: 'field' }, link), field(SZ('resample'), mode), prev, info),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => {
      read();
      if (st.w === pw && st.h === ph) return;
      imageSize(st.w, st.h, mode.value);
      fitView();
      if (window.SlopMacros) SlopMacros.note('ps.ai.image-size', { width: st.w, height: st.h, keep_aspect: false, resample: mode.value }, 'Image Size'); // i18n-ignore: saved in the macro
    } }] });
}
