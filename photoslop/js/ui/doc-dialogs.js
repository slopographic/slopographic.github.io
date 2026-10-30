/* PhotoSlop UI: document dialogs, themes and keyboard */
'use strict';

/* ---------- misc dialogs ---------- */
function dlgNumber(title, label, v, min, max, unit, fn) {
  const i = numInput(v, min, max, 0.5);
  dialog({ title, body: field(label, i, unit), buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => fn(clamp(+i.value, min, max)) }] });
}
/** New-document presets: [name, width, height]; the name is a getter for photoslop.doc.preset_<key>. */
const PRESETS = [['default', 1600, 1000], ['ig_post', 1080, 1080], ['ig_story', 1080, 1920], ['hd', 1920, 1080], ['uhd', 3840, 2160], ['x_header', 1500, 500], ['a4', 1240, 1754], ['meme', 800, 800], ['icon', 512, 512]]
  .map((r) => { const k = r[0]; Object.defineProperty(r, 0, { get: () => tr('photoslop.doc.preset_' + k), enumerable: true }); return r; });
const D_ = (k, v) => tr('photoslop.doc.' + k, v);
function dlgNew() {
  const w = numInput(1600, 1, 12000), hh = numInput(1000, 1, 12000);
  const preset = h('select', null, PRESETS.map(([n, a, b], i) => h('option', { value: i }, D_('preset_row', { name: n, w: String(a), h: String(b) }))), h('option', { value: 'clip' }, D_('clip_size')));
  preset.addEventListener('change', () => { if (preset.value === 'clip') { if (CLIP.canvas) { w.value = CLIP.canvas.width; hh.value = CLIP.canvas.height; } return; } const p = PRESETS[+preset.value]; w.value = p[1]; hh.value = p[2]; });
  const bg = h('select', null, [['#ffffff', 'white'], ['#000000', 'black'], ['fg', 'fg'], ['bg', 'bg'], ['transparent', 'transparent']].map(([v, l]) => h('option', { value: v }, D_('bg_' + l))));
  const name = h('input', { type: 'text', value: tr('ui.untitled') });
  dialog({ title: D_('new_title'), body: h('div', { class: 'form' }, field(D_('name'), name), field(D_('preset'), preset), field(D_('width'), w, 'px'), field(D_('height'), hh, 'px'), field(D_('background'), bg)),
    buttons: [{ label: tr('menu.cancel') }, { label: D_('create'), primary: true, act: () => {
      const b = bg.value === 'fg' ? C.fg : bg.value === 'bg' ? C.bg : bg.value;
      newDocTab(clamp(+w.value || 1, 1, 12000), clamp(+hh.value || 1, 1, 12000), b, name.value || tr('ui.untitled'));
    } }] });
}
function dlgLayerProps() {
  const L = activeLayer(); if (!L) return;
  const name = h('input', { type: 'text', value: L.name });
  dialog({ title: D_('layer_props'), body: h('div', { class: 'form' }, field(D_('name'), name)), buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => setLayerProps(L.id, { name: name.value || L.name }, D_('layer_props')) }] });
}
function dlgStroke() {
  const w = numInput(4, 1, 250), pos = h('select', null, h('option', { value: 'center' }, D_('center')), h('option', { value: 'inside' }, D_('inside')), h('option', { value: 'outside' }, D_('outside')));
  dialog({ title: D_('stroke'), body: h('div', { class: 'form' }, field(D_('width'), w, 'px'), field(D_('location'), pos), h('p', { class: 'dlg-p' }, D_('stroke_fg'))),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => {
      const r = clamp(+w.value, 1, 250), path = selectionPath(D.sel), c = mkCanvas(D.w, D.h), g = cx(c);
      g.strokeStyle = C.fg; g.lineWidth = pos.value === 'center' ? r : r * 2; g.lineJoin = 'round'; g.stroke(path);
      if (pos.value !== 'center') { g.globalCompositeOperation = pos.value === 'inside' ? 'destination-in' : 'destination-out'; g.drawImage(D.sel.mask, 0, 0); }
      fillSelection(c, D_('stroke'), 1, 'normal', true);
    } }] });
}
function dlgColorRange() {
  const tol = h('input', { type: 'range', min: 0, max: 200, value: 40 });
  dialog({ title: D_('color_range'), body: h('div', { class: 'form' }, h('p', { class: 'dlg-p' }, D_('color_range_p', { c: C.fg })), field(D_('fuzziness'), tol)),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => {
      const src = flattenCanvas(), d = cxr(src).getImageData(0, 0, D.w, D.h).data, [r, g, b] = hexToRgb(C.fg), f = +tol.value;
      const m = mkCanvas(D.w, D.h), mg = cxr(m), img = mg.createImageData(D.w, D.h), o = img.data;
      for (let i = 0; i < d.length; i += 4) { const dist = Math.max(Math.abs(d[i] - r), Math.abs(d[i + 1] - g), Math.abs(d[i + 2] - b)); o[i + 3] = d[i + 3] && dist <= f ? clamp((1 - dist / (f + 1)) * 2, 0, 1) * 255 : 0; }
      mg.putImageData(img, 0, 0); D.sel = makeSel(m); commit(D_('color_range'));
      if (!D.sel) toast(D_('no_match'));
    } }] });
}
function dlgShortcuts() {
  if (CMD_ON) { SlopCmd.openKeymap(); return; }
  const rows = [];
  const walk = (items, path) => { for (const it of items) { if (it === '-' || !it) continue; if (it.sub) walk(it.sub, path + ' › ' + it.label); else if (it.key) rows.push([path + ' › ' + it.label, it.key]); } };
  MENUS.forEach(([n, items]) => walk(typeof items === 'function' ? items() : items, barName(n)));
  const toolRows = TOOLS.map((t) => [t.name, TOOLS.filter((x) => x.key === t.key).length > 1 ? D_('key_cycles', { key: t.key }) : t.key]);
  const extra = [['k_pan', D_('kv_pan')], ['k_zoom', D_('kv_zoom')], ['k_size', D_('kv_size')], ['k_hardness', D_('kv_hardness')], ['k_opacity', '1 … 0'], ['k_swap', 'X'], ['k_default', 'D'], ['k_nudge', D_('kv_nudge')], ['k_commit', D_('kv_commit')]].map(([k, v]) => [D_(k), v]);
  const table = (list) => h('table', { class: 'keys' }, list.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, keyLabel(b))))));
  dialog({ title: D_('shortcuts'), cls: 'dlg-wide', body: h('div', { class: 'keys-wrap' }, h('div', null, h('h4', null, D_('h_tools')), table(toolRows), h('h4', null, D_('h_canvas')), table(extra)), h('div', null, h('h4', null, D_('h_menus')), table(rows))), buttons: [{ label: tr('menu.close'), primary: true }] });
}
function dlgAbout() {
  dialog({ title: D_('about_title'), body: h('div', { class: 'about' },
    h('p', { class: 'about-logo' }, 'PhotoSlop'), // i18n-ignore: brand
    h('p', null, D_('about_p1')),
    h('p', null, D_('about_p2')),
    h('p', { class: 'dlg-p' }, D_('about_part_of'), h('a', { href: '../' }, 'slopographic.com'), D_('about_prefer'), h('a', { href: 'classic/' }, 'Slop Paint Classic'), '.')), // i18n-ignore: brand names
  buttons: [{ label: tr('menu.close'), primary: true }] });
}

/* ---------- themes ---------- */
const theme = () => document.documentElement.dataset.theme || 'pro';
/* The in-app Theme menu is the shared switcher: Pro is the shared Dark, Light is Light, Paint '98 is Classic 98. Lime and Dark
 * both use data-theme "pro", so the menu saves the shared choice itself (SlopTheme.set) rather than its own key alone. */
const SHARED_OF = { pro: 'dark', light: 'light', paint: 'classic' };
function setTheme(t) {
  const shared = window.SlopTheme && SHARED_OF[t];
  if (!shared || !SlopTheme.set(SHARED_OF[t]).ok) { document.documentElement.dataset.theme = t; store.set('theme', t); if (shared) SlopTheme.apply(SHARED_OF[t]); }
  dirty(); emit('theme');
}

/* ---------- keyboard ---------- */
const TOOL_KEYS = {};
for (const t of TOOLS) (TOOL_KEYS[t.key] = TOOL_KEYS[t.key] || []).push(t.id);
function onKeyDown(e) {
  if (SlopUI.openDialogs || isTyping(e.target) || inMenu(e)) return;
  if (CMD_ON) { const c = comboOf(e); if (c === 'Ctrl+V' || c === 'Shift+Ctrl+V') armPasteCatcher(); return; } // SlopCmd handles the rest
  if (e.code === 'Space' && !e.repeat) { V.space = true; V.el.classList.add('space'); e.preventDefault(); return; } // i18n-ignore: ids, key names, CSS
  const combo = comboOf(e);
  const t = currentTool();
  if (t.onKey && t.onKey(e)) { e.preventDefault(); dirty(); return; }
  if (openMenu && e.key === 'Escape') { closeMenus(); return; }
  if (e.key === 'Escape' && D.sel && !(TE.el)) { /* Photoshop keeps the selection on Esc */ }
  const item = SHORTCUTS.get(combo) || (combo === 'Ctrl+Y' ? SHORTCUTS.get('Shift+Ctrl+Z') : null) || (combo === 'Alt+Ctrl+Z' ? SHORTCUTS.get('Ctrl+Z') : null) || (combo === 'Backspace' ? SHORTCUTS.get('Delete') : null) || (combo === 'Ctrl+Shift+=' || combo === 'Shift+Ctrl+=' ? SHORTCUTS.get('Ctrl+=') : null);
  if (item) {
    if (combo === 'Ctrl+V' || combo === 'Shift+Ctrl+V') { armPasteCatcher(); return; } // the native paste event carries system images
    if (combo === 'Ctrl+C' || combo === 'Ctrl+X') { e.preventDefault(); item.act(); return; }
    if (!menuEnabled(item)) { e.preventDefault(); return; }
    e.preventDefault(); closeMenus(); item.act(); return;
  }
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) { const r = DOCS[+e.code.slice(5) - 1]; if (r) { e.preventDefault(); switchToDoc(r); } return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = combo.replace('Shift+', '');
  if (TOOL_KEYS[k] && !e.repeat) {
    const ids = TOOL_KEYS[k];
    if (e.shiftKey && ids.includes(UI.tool)) selectTool(ids[(ids.indexOf(UI.tool) + 1) % ids.length]);
    else selectTool(ids.includes(store.get('lastOf.' + k)) ? store.get('lastOf.' + k) : ids[0]);
    e.preventDefault(); return;
  }
  const o = BRUSH_OPTS()[UI.tool];
  if (o && (e.code === 'BracketLeft' || e.code === 'BracketRight')) { // i18n-ignore: ids, key names, CSS
    const up = e.code === 'BracketRight'; // i18n-ignore: ids, key names, CSS
    if (e.shiftKey && o.hardness != null) o.hardness = clamp(Math.round((o.hardness + (up ? 0.25 : -0.25)) * 4) / 4, 0, 1);
    else { const s = o.size, step = s < 10 ? 1 : s < 50 ? 5 : s < 100 ? 10 : s < 300 ? 25 : 50; o.size = clamp(s + (up ? step : -step), 1, 1000); }
    saveToolOptions(); buildOptions(); dirty(); e.preventDefault(); return;
  }
  if (/^Digit\d$/.test(e.code) && o && o.opacity != null) { const n = +e.code.slice(5); o.opacity = n === 0 ? 1 : n / 10; saveToolOptions(); buildOptions(); toast(D_('opacity_toast', { pct: String(Math.round(o.opacity * 100)) }), 900); return; }
  if (combo === 'X') { swapColors(); return; }
  if (combo === 'D') { defaultColors(); return; }
  if (UI.tool === 'move' && e.key.startsWith('Arrow')) { // i18n-ignore: ids, key names, CSS
    const n = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
    nudge(dx, dy); e.preventDefault();
  }
}
function onKeyUp(e) { if (e.code === 'Space') { V.space = false; V.el.classList.remove('space'); } } // i18n-ignore: ids, key names, CSS
listeners.add((w) => { if (w === 'tool') { const t = TOOL[UI.tool]; if (t) store.set('lastOf.' + t.key, t.id); buildOptions(); V.el.style.cursor = ''; } });
