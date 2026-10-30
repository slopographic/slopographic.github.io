/* PhotoSlop UI: menubar, toolbox and options bar */
'use strict';

let openMenu = null, menubarWired = false;
/** The menu bar's name for an English group id (menus.js MENUS). */
const barName = (name) => tr('photoslop.menu.bar_' + name.toLowerCase());
/** Builds the menu bar, or builds it again in the current language (relabelUI). */
function buildMenubar() {
  const bar = $('#menubar');
  bar.textContent = '';
  for (const [name, items] of MENUS) {
    const btn = h('button', { class: 'mb-item', type: 'button', 'aria-haspopup': 'true' }, barName(name));
    const list = () => (typeof items === 'function' ? items() : items);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (openMenu && openMenu.btn === btn) closeMenus(); else showMenu(btn, list()); });
    btn.addEventListener('pointerenter', () => { if (openMenu && openMenu.btn !== btn) showMenu(btn, list()); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); showMenu(btn, list(), true); } });
    bar.append(btn);
  }
  if (menubarWired) return;
  menubarWired = true;
  document.addEventListener('pointerdown', (e) => { if (openMenu && !e.target.closest('.menu, .mb-item')) closeMenus(); });
}
function closeMenus() { $$('.menu').forEach((m) => m.remove()); $$('.mb-item.open').forEach((b) => b.classList.remove('open')); openMenu = null; }
function menuEnabled(it) {
  if (it.en && !it.en()) return false;
  if (it.need === 'layer' && !activeLayer()) return false;
  return true;
}
let subT = 0; // the pending hover-open of a submenu (one at a time)
/** Removes the open menus deeper than a level, except one (keep). */
function closeDeeper(level, keep) { $$('.menu').forEach((mm) => { if (+mm.dataset.level > level && mm !== keep) mm.remove(); }); }
function collapseInline(row) {
  row.classList.remove('sub-open'); row.setAttribute('aria-expanded', 'false');
  if (row.inlineEl) { row.inlineEl.remove(); row.inlineEl = null; }
}
/** Escape or ArrowLeft in a menu: leave the inline group, close this submenu, or close the bar's menu. */
function leaveSub(m) {
  const cur = document.activeElement, grp = cur && cur.closest ? cur.closest('.menu-inline') : null;
  if (grp) { const p = grp.inlineOf; collapseInline(p); p.focus({ preventScroll: true }); return; }
  if (+m.dataset.level > 0) { const pr = m.ownerRow; closeDeeper(+m.dataset.level - 1); if (pr) { pr.subEl = null; pr.focus({ preventScroll: true }); } return; }
  const b = openMenu && openMenu.btn; closeMenus(); if (b) b.focus();
}
/** A submenu row: a flyout beside the menu on hover (after a short delay), click, Enter or ArrowRight;
 * on a phone, the rows open in place under the row. */
function subRow(row, it, level) {
  const openFly = (focus) => {
    closeDeeper(level, row.subEl);
    if (!(row.subEl && row.subEl.isConnected)) {
      const sm = renderMenu(it.sub, 0, 0, level + 1);
      sm.ownerRow = row; row.subEl = sm;
      SlopUI.placeFlyout(sm, row);
    }
    row.setAttribute('aria-expanded', 'true');
    if (focus) { const f = row.subEl.querySelector('.menu-row:not([disabled])'); if (f) f.focus({ preventScroll: true }); }
  };
  const toggleInline = () => {
    const was = row.classList.contains('sub-open');
    $$('.menu-row').forEach((r) => { if (r.inlineEl) collapseInline(r); });
    if (was) return;
    const grp = renderMenu(it.sub, 0, 0, level, true);
    grp.inlineOf = row; row.after(grp); row.inlineEl = grp;
    row.classList.add('sub-open'); row.setAttribute('aria-expanded', 'true');
  };
  row.addEventListener('pointerenter', (e) => {
    clearTimeout(subT);
    if (e.pointerType === 'touch' || SlopUI.narrow() || (row.subEl && row.subEl.isConnected)) return;
    subT = setTimeout(() => openFly(false), 180);
  });
  row.addEventListener('click', () => { clearTimeout(subT); if (SlopUI.narrow()) toggleInline(); else openFly(false); });
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation(); clearTimeout(subT);
    if (SlopUI.narrow()) { if (!row.classList.contains('sub-open')) toggleInline(); if (row.inlineEl) { const f = row.inlineEl.querySelector('.menu-row:not([disabled])'); if (f) f.focus({ preventScroll: true }); } }
    else openFly(true);
  });
}
function renderMenu(items, x, y, level, inline = false) {
  const m = h('div', { class: 'menu' + (inline ? ' menu-inline' : ''), role: 'menu' });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    const en = menuEnabled(it);
    const row = h('button', { class: 'menu-row' + (it.sub ? ' has-sub' : ''), type: 'button', role: 'menuitem', disabled: !en, 'aria-haspopup': it.sub ? 'menu' : null },
      h('span', { class: 'menu-check' }, it.check ? (it.check() ? '✓' : '') : ''),
      h('span', { class: 'menu-label' }, it.dyn ? it.dyn() : it.label),
      h('span', { class: 'menu-key' }, it.sub ? '▸' : menuKey(it)));
    if (it.sub) subRow(row, it, level);
    else {
      row.addEventListener('pointerenter', () => { clearTimeout(subT); closeDeeper(level); });
      row.addEventListener('click', () => { closeMenus(); if (en) it.act(); });
    }
    m.append(row);
  }
  m.dataset.level = level;
  if (inline) return m;
  m.addEventListener('keydown', (e) => {
    const rows = $$('.menu-row:not([disabled])', m), i = rows.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (rows[i + 1] || rows[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (rows[i - 1] || rows[rows.length - 1]).focus(); }
    else if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); leaveSub(m); }
  });
  m.style.left = x + 'px'; m.style.top = y + 'px';
  document.body.append(m);
  const r = m.getBoundingClientRect();
  if (r.bottom > innerHeight) m.style.top = Math.max(0, innerHeight - r.height - 4) + 'px';
  if (r.right > innerWidth) m.style.left = Math.max(0, innerWidth - r.width - 4) + 'px';
  return m;
}
function showMenu(btn, items, focus) {
  closeMenus();
  btn.classList.add('open');
  const r = btn.getBoundingClientRect();
  const m = renderMenu(items, r.left, r.bottom, 0);
  openMenu = { btn, m };
  if (focus) { const f = m.querySelector('.menu-row:not([disabled])'); if (f) f.focus(); }
}

/* ---------- toolbox ---------- */
function buildToolbox() {
  const box = $('#toolbox');
  const order = ['move', 'marquee', 'ellipse', 'lasso', 'polylasso', 'wand', 'crop', 'eyedropper', 'brush', 'pencil', 'clone', 'heal', 'spot', 'redeye', 'remove', 'eraser', 'gradient', 'bucket', 'blur', 'sharpen', 'smudge', 'dodge', 'sponge', 'type', 'shape', 'hand', 'zoom'];
  const grid = h('div', { class: 'tools' });
  for (const id of order) {
    const t = TOOL[id];
    const b = h('button', { class: 'tool', type: 'button', 'data-tool': id, html: t.icon });
    b.addEventListener('click', () => selectTool(id));
    grid.append(b);
  }
  const at = (k1, k2) => ({ 'data-i18n-attr': `title:photoslop.chrome.${k1};aria-label:photoslop.chrome.${k2}`, title: tr('photoslop.chrome.' + k1), 'aria-label': tr('photoslop.chrome.' + k2) });
  const fg = h('button', Object.assign({ class: 'sw-fg', type: 'button' }, at('fg_set', 'fg')));
  const bg = h('button', Object.assign({ class: 'sw-bg', type: 'button' }, at('bg_set', 'bg')));
  const swap = h('button', Object.assign({ class: 'sw-swap', type: 'button', html: '<svg viewBox="0 0 12 12"><path d="M2 4h6l-2-2M10 8H4l2 2"/></svg>' }, at('swap_key', 'swap')));
  const def = h('button', Object.assign({ class: 'sw-def', type: 'button' }, at('default_key', 'default')), h('i'), h('i'));
  for (const [b, which] of [[fg, 'fg'], [bg, 'bg']]) {
    b.addEventListener('click', () => editSwatch(which));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); editSwatch(which); });
  }
  swap.addEventListener('click', swapColors);
  def.addEventListener('click', defaultColors);
  box.append(grid, h('div', { class: 'swatches-fgbg' }, bg, fg, swap, def));
  labelToolbox();
  const sync = () => {
    $$('.tool', box).forEach((b) => b.classList.toggle('active', b.dataset.tool === UI.tool && !TRANSFORM.active));
    fg.style.background = C.fg; bg.style.background = C.bg;
  };
  listeners.add((w) => { if (w === 'tool' || w === 'color') sync(); });
  sync();
}
/** The tool buttons' names (TOOL[id].name follows the language); run again by relabelUI. */
function labelToolbox() {
  $$('#toolbox .tool').forEach((b) => { const t = TOOL[b.dataset.tool]; b.title = `${t.name} (${t.key})`; b.setAttribute('aria-label', t.name); });
}
function swapColors() { const f = C.fg; setColor('fg', C.bg); setColor('bg', f); }
function defaultColors() { setColor('fg', '#000000'); setColor('bg', '#ffffff'); }

/* ---------- options bar ---------- */
function optRange(label, obj, key, min, max, step = 1, fmt = (v) => v, toVal = (v) => v, fromVal = (v) => v) {
  const range = h('input', { type: 'range', min, max, step, value: fromVal(obj[key]), 'aria-label': label });
  const num = h('input', { type: 'number', min, max, step, value: fmt(fromVal(obj[key])), class: 'opt-num', 'aria-label': label });
  const set = (v) => { v = clamp(+v, min, max); obj[key] = toVal(v); range.value = v; if (document.activeElement !== num) num.value = fmt(v); saveToolOptions(); emit('options'); dirty(); };
  range.addEventListener('input', () => set(range.value));
  num.addEventListener('change', () => set(num.value));
  return h('label', { class: 'opt' }, h('span', null, label), range, num);
}
function optCheck(label, obj, key) {
  const c = h('input', { type: 'checkbox', checked: !!obj[key] });
  c.addEventListener('change', () => { obj[key] = c.checked; saveToolOptions(); emit('options'); });
  return h('label', { class: 'opt opt-check' }, c, h('span', null, label));
}
function optSelect(label, obj, key, options, onChange) {
  const s = h('select', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: obj[key] === v }, l)));
  s.addEventListener('change', () => { obj[key] = s.value; saveToolOptions(); emit('options'); if (onChange) onChange(); });
  return h('label', { class: 'opt' }, label ? h('span', null, label) : null, s);
}
function optSelMode() {
  const modes = [['replace', O('sel_new'), 'M3 3h12v12H3z'], ['add', O('sel_add'), 'M3 3h9v9H3zM9 9h9v9H9z'], ['sub', O('sel_sub'), 'M3 3h9v9H3zM9 9h9v9H9z'], ['int', O('sel_int'), 'M3 3h9v9H3zM9 9h9v9H9z']];
  const wrap = h('div', { class: 'opt seg', role: 'group', 'aria-label': O('sel_mode') });   // i18n-ignore: ids, class names, key names or text for agents
  for (const [m, title, d] of modes) {
    const b = h('button', { type: 'button', class: 'seg-b' + (T.select.mode === m ? ' on' : ''), title, 'aria-label': title, html: `<svg viewBox="0 0 21 21" class="selmode-${m}"><path d="${d}"/></svg>` });
    b.addEventListener('click', () => { T.select.mode = m; saveToolOptions(); buildOptions(); });
    wrap.append(b);
  }
  return wrap;
}
const pct = (v) => Math.round(v);
/** An options-bar word (photoslop/i18n/<code>/chrome.js); the bar is built again on a language change. */
const O = (k, vars) => tr('photoslop.chrome.' + k, vars);
/** Clone and heal: Set source makes the next press pick the source (a finger or a pen has no Alt key; see takeSource). */
const srcButton = (id) => h('button', { class: 'btn', type: 'button', onclick: () => { TOOL[id].pickSource = true; toast(O('src_tap')); } }, O('src_set'));
const srcHint = (paint) => O(paint ? 'src_hint_paint' : 'src_hint', { click: isMac ? '⌥-click' : 'Alt-click' });   // i18n-ignore: a key name
function buildOptions() {
  const bar = $('#options'); bar.textContent = '';
  const t = currentTool();
  const icon = h('span', { class: 'opt-icon', html: t.icon || '' });
  bar.append(icon, h('span', { class: 'opt-name' }, t.name));
  const add = (...els) => bar.append(...els);
  if (TRANSFORM.active) {
    const tf = TRANSFORM;
    const n = (label, get, set, unit) => { const i = h('input', { type: 'number', class: 'opt-num wide', value: get(), step: 0.1 }); i.addEventListener('change', () => { set(+i.value); dirty(true); }); listeners.add((w) => { if (w === 'transform' && document.activeElement !== i) i.value = get(); }); return h('label', { class: 'opt' }, h('span', null, label), i, unit ? h('span', { class: 'opt-u' }, unit) : null); };
    add(n('X', () => Math.round(tf.cx + tf.tx), (v) => { tf.tx = v - tf.cx; }, 'px'), n('Y', () => Math.round(tf.cy + tf.ty), (v) => { tf.ty = v - tf.cy; }, 'px'),
      n('W', () => Math.round(tf.sx * 1000) / 10, (v) => tfScale('x', v), '%'), lockButton(), n('H', () => Math.round(tf.sy * 1000) / 10, (v) => tfScale('y', v), '%'),
      n('∠', () => Math.round((tf.rot * 180) / Math.PI * 10) / 10, (v) => { tf.rot = (v * Math.PI) / 180; }, '°'),
      optSelect(O('interp'), tf, 'interp', RESAMPLE_MODES, () => dirty(true)),
      h('span', { class: 'opt-spacer' }),
      h('button', { class: 'btn', type: 'button', onclick: cancelTransform, title: O('cancel_esc') }, O('cancel')),
      h('button', { class: 'btn primary', type: 'button', onclick: commitTransform, title: O('commit_enter') }, O('commit')));   // i18n-ignore: ids, class names, key names or text for agents
    return;
  }
  if (t.options) { t.options(add); return; }   // a tool that builds its own options (retouch/tool.js)
  const blendOpts = BLENDS.map((b) => [b[0], b[1]]);
  switch (t.id) {
    case 'brush': add(brushPickerButton(), optSelect(O('tip'), T.brush, 'tip', tipOptions(T.brush)), optRange(O('size'), T.brush, 'size', 1, 1000, 1, (v) => v + ''), optRange(O('hardness'), T.brush, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optSelect(O('mode'), T.brush, 'blend', blendOpts), optRange(O('opacity'), T.brush, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('flow'), T.brush, 'flow', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optCheck(O('pressure'), T.brush, 'pressure')); break;
    case 'pencil': add(optRange(O('size'), T.pencil, 'size', 1, 200), optRange(O('opacity'), T.pencil, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break;
    case 'eraser': add(brushPickerButton(), optSelect(O('tip'), T.eraser, 'tip', tipOptions(T.eraser)), optRange(O('size'), T.eraser, 'size', 1, 1000), optRange(O('hardness'), T.eraser, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('opacity'), T.eraser, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('flow'), T.eraser, 'flow', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optCheck(O('pressure'), T.eraser, 'pressure')); break;
    case 'clone': add(optRange(O('size'), T.clone, 'size', 1, 1000), optRange(O('hardness'), T.clone, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('opacity'), T.clone, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optCheck(O('aligned'), T.clone, 'aligned'), optCheck(O('sample_all'), T.clone, 'sampleAll'), srcButton('clone'), h('span', { class: 'opt-hint' }, srcHint(false))); break;
    case 'heal': add(brushPickerButton(), optRange(O('size'), T.heal, 'size', 1, 1000), optRange(O('hardness'), T.heal, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('opacity'), T.heal, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optCheck(O('aligned'), T.heal, 'aligned'), optCheck(O('sample_all'), T.heal, 'sampleAll'), srcButton('heal'), h('span', { class: 'opt-hint' }, srcHint(true))); break;
    case 'spot': add(brushPickerButton(), optRange(O('size'), T.spot, 'size', 1, 1000), optRange(O('hardness'), T.spot, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('opacity'), T.spot, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), h('span', { class: 'opt-hint' }, O('spot_hint'))); break;
    case 'redeye': add(optRange(O('tolerance'), T.redeye, 'tol', 0, 100, 1, pct, (v) => v, (v) => v), optRange(O('darkening'), T.redeye, 'dark', 0, 100, 1, pct, (v) => v, (v) => v), h('span', { class: 'opt-hint' }, O('redeye_hint'))); break;
    case 'blur': case 'sharpen': { const o = T[t.id]; add(brushPickerButton(), optRange(O('size'), o, 'size', 1, 500), optRange(O('hardness'), o, 'hardness', 0, 100, 1, pct, (v) => v / 100, (v) => v * 100), optRange(O('strength'), o, 'strength', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break; }
    case 'sponge': add(brushPickerButton(), optSelect('', T.sponge, 'mode', [['saturate', O('saturate')], ['desaturate', O('desaturate')]]), optRange(O('size'), T.sponge, 'size', 1, 500), optRange(O('flow'), T.sponge, 'flow', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break;
    case 'smudge': add(optRange(O('size'), T.smudge, 'size', 1, 500), optRange(O('strength'), T.smudge, 'strength', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break;
    case 'dodge': add(optSelect('', T.dodge, 'mode', [['dodge', O('dodge')], ['burn', O('burn')]]), optRange(O('size'), T.dodge, 'size', 1, 1000), optRange(O('exposure'), T.dodge, 'exposure', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break;
    case 'marquee': case 'ellipse': case 'lasso': case 'polylasso': add(optSelMode(), optRange(O('feather'), T.select, 'feather', 0, 250, 1, (v) => v), h('span', { class: 'opt-hint' }, t.id === 'polylasso' ? O('polylasso_hint') : O('select_hint'))); break;
    case 'wand': add(optSelMode(), optRange(O('tolerance'), T.wand, 'tol', 0, 255), optCheck(O('contiguous'), T.wand, 'contiguous'), optCheck(O('sample_all'), T.wand, 'sampleAll')); break;
    case 'bucket': add(optRange(O('tolerance'), T.bucket, 'tol', 0, 255), optRange(O('opacity'), T.bucket, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100), optCheck(O('contiguous'), T.bucket, 'contiguous'), optCheck(O('all_layers'), T.bucket, 'sampleAll')); break;
    case 'gradient': add(optSelect('', T.gradient, 'type', [['linear', O('linear')], ['radial', O('radial')], ['reflected', O('reflected')], ['angle', O('angle')]]), optSelect('', T.gradient, 'mode', [['fgbg', O('fg_bg')], ['fgt', O('fg_transparent')], ['slop', O('slop_green')], ['spectrum', O('spectrum')]]), optCheck(O('reverse'), T.gradient, 'reverse'), optRange(O('opacity'), T.gradient, 'opacity', 1, 100, 1, pct, (v) => v / 100, (v) => v * 100)); break;
    case 'shape': add(optSelect('', T.shape, 'kind', [['rect', O('rect')], ['rounded', O('rounded')], ['ellipse', O('ellipse')], ['polygon', O('polygon')], ['star', O('star')], ['heart', O('heart')], ['line', O('line')]], () => { if (T.shape.kind === 'rounded' && !T.shape.radius) T.shape.radius = 32; buildOptions(); }), optCheck(O('fill_fg'), T.shape, 'fill'), optCheck(O('stroke'), T.shape, 'stroke'), optRange(O('stroke'), T.shape, 'strokeW', 1, 200)); if (T.shape.kind === 'rect' || T.shape.kind === 'rounded') add(optRange(O('radius'), T.shape, 'radius', 0, 500)); if (T.shape.kind === 'polygon' || T.shape.kind === 'star') add(optRange(O('sides'), T.shape, 'sides', 3, 40)); break;
    case 'type': buildTypeOptions(add); break;
    case 'move': add(optCheck(O('auto_select'), T.move, 'auto'), ...moveBoxOptions(), h('span', { class: 'opt-hint' }, O('move_hint'))); break;
    case 'crop': add(optCheck(O('delete_cropped'), T.crop, 'del'), h('span', { class: 'opt-spacer' }), h('button', { class: 'btn', type: 'button', onclick: () => { TOOL.crop.activate(); dirty(); } }, O('reset')), h('button', { class: 'btn primary', type: 'button', onclick: () => TOOL.crop.apply() }, O('crop'))); break;   // i18n-ignore: ids, class names, key names or text for agents
    case 'eyedropper': add(optSelect(O('sample_size'), T.eyedrop, 'size', [[1, O('point')], [3, O('avg3')], [5, O('avg5')], [11, O('avg11')]].map(([v, l]) => [String(v), l])), sampleSourceOpt()); break;
    case 'hand': case 'zoom': add(h('button', { class: 'btn', type: 'button', onclick: () => actualPixels() }, '100%'), h('button', { class: 'btn', type: 'button', onclick: () => fitView() }, O('fit_screen'))); break;
  }
  if (t.id === 'eyedropper') { const s = bar.querySelector('select'); s.value = String(T.eyedrop.size); s.onchange = () => { T.eyedrop.size = +s.value; saveToolOptions(); }; }
}
