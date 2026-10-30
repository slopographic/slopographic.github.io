/* PhotoSlop: every menu item, tool and canvas key as a SlopCmd command (shared/commands), so the
 * Spotlight palette (⌘K) finds them and the person can rebind any shortcut. Without SlopCmd the
 * legacy keyboard handler in ui/doc-dialogs.js keeps working. */
'use strict';

let CMD_ON = false;
const cmdKey = (k) => k.replace(/Ctrl\+/g, 'Mod+');
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// The native paste event carries system images, so Ctrl+V stays with the legacy handler.
const NATIVE_KEYS = new Set(['Ctrl+V', 'Shift+Ctrl+V']);
/** Extra default keys that the menus don't show. */
const EXTRA_KEYS = { 'ps.edit-undo': ['Alt+Mod+Z'], 'ps.edit-redo': ['Mod+Y'], 'ps.edit-clear': ['Backspace'], 'ps.view-zoom-in': ['Shift+Mod+='] };

/** Menu label for an item's shortcut: the person's own binding when SlopCmd is active. */
function menuKey(it) {
  if (CMD_ON && it.cmdId && window.SlopCmd) return SlopCmd.keyFor(it.cmdId);
  return it.key ? keyLabel(it.key) : '';
}
/** The palette's group for an English group id: SlopCmd's search names File, Edit, View and Help itself (and keeps Help
 * last); the others are PhotoSlop's own words. */
const cmdGroup = (g) => (['File', 'Edit', 'View', 'Help'].includes(g) ? g : tr('photoslop.menu.bar_' + slug(g).replace(/-/g, '_')));   // i18n-ignore: ids, class names, key names or text for agents
/** A menu item's part of its command id: its k (menus.js), or the slug of its label for items from shared code. */
const idPart = (it) => (it.k ? it.k.replace(/_/g, '-') : slug(it.label || ''));
function menuCommands() {
  const out = [];
  const walk = (items, group, path) => {
    for (const it of items) {
      if (!it || it === '-') continue;
      if (it.sub) { walk(it.sub, group, path.concat(it)); continue; }
      if (!it.act || /^(cmd|macro)\./.test(it.cmdId || '')) continue;   // shared commands keep their own ids
      const id = it.cmdId || (it.cmdId = 'ps.' + [slug(group)].concat(path.map(idPart), idPart(it)).filter(Boolean).join('-'));
      const keys = NATIVE_KEYS.has(it.key) ? [] : [it.key].concat(it.alt || []).filter(Boolean).map(cmdKey).concat(EXTRA_KEYS[id] || []);
      const names = path.map((p) => p.label);
      out.push({ id, title: names.concat(it.label.replace(/…$/, '')).join(' › ') + (it.label.endsWith('…') ? '…' : ''), group: cmdGroup(group), keys, keywords: [group].concat(names),
        when: () => menuEnabled(it), checked: it.check, run: () => it.act() });
    }
  };
  MENUS.forEach(([n, items]) => { if (Array.isArray(items)) walk(items, n, []); });
  return out;
}

/* ---------- tools and canvas keys ---------- */
function pickToolKey(k, cycle) {
  const ids = TOOL_KEYS[k]; if (!ids) return;
  if (cycle && ids.includes(UI.tool)) selectTool(ids[(ids.indexOf(UI.tool) + 1) % ids.length]);
  else selectTool(ids.includes(store.get('lastOf.' + k)) ? store.get('lastOf.' + k) : ids[0]);
}
function brushStep(up, hard) {
  const o = BRUSH_OPTS()[UI.tool]; if (!o) return;
  if (hard) { if (o.hardness != null) o.hardness = clamp(Math.round((o.hardness + (up ? 0.25 : -0.25)) * 4) / 4, 0, 1); }
  else { const s = o.size, step = s < 10 ? 1 : s < 50 ? 5 : s < 100 ? 10 : s < 300 ? 25 : 50; o.size = clamp(s + (up ? step : -step), 1, 1000); }
  saveToolOptions(); buildOptions(); dirty();
}
function toolOpacity(n) { const o = BRUSH_OPTS()[UI.tool]; if (!o || o.opacity == null) return; o.opacity = n === 0 ? 1 : n / 10; saveToolOptions(); buildOptions(); toast(tr('photoslop.cmd.opacity_toast', { pct: Math.round(o.opacity * 100) }), 900); }
function toolCommands() {
  const out = [], hasBrush = () => !!BRUSH_OPTS()[UI.tool];
  for (const k in TOOL_KEYS) {
    const ids = TOOL_KEYS[k];
    ids.forEach((id, i) => out.push({ id: 'ps.tool.' + id, title: TOOL[id].name, group: cmdGroup('Tools'), icon: TOOL[id].icon, keys: i ? [] : [k], keywords: ['tool', k], checked: () => UI.tool === id, run: () => (i ? selectTool(id) : pickToolKey(k, false)) }));   // i18n-ignore: ids, class names, key names or text for agents
    if (ids.length > 1) out.push({ id: 'ps.tool.cycle-' + slug(k), title: tr('photoslop.cmd.cycle_tools', { tools: ids.map((id) => TOOL[id].short || TOOL[id].name).join(' / ') }), group: cmdGroup('Tools'), keys: ['Shift+' + k], run: () => pickToolKey(k, true) });   // i18n-ignore: ids, class names, key names or text for agents
  }
  const C2 = (id, key, keys, run, extra, vars) => out.push(Object.assign({ id: 'ps.' + id, title: tr('photoslop.cmd.' + key, vars), group: cmdGroup((extra && extra.group) || 'Canvas'), keys, run }, extra, extra && extra.group ? { group: cmdGroup(extra.group) } : {}));   // i18n-ignore: ids, class names, key names or text for agents
  C2('swap-colors', 'swap_colors', ['X'], swapColors);
  C2('default-colors', 'default_colors', ['D'], defaultColors);
  C2('brush-bigger', 'brush_bigger', [']'], () => brushStep(true), { when: hasBrush, repeat: true });
  C2('brush-smaller', 'brush_smaller', ['['], () => brushStep(false), { when: hasBrush, repeat: true });
  C2('brush-harder', 'brush_harder', ['Shift+]'], () => brushStep(true, true), { when: hasBrush });
  C2('brush-softer', 'brush_softer', ['Shift+['], () => brushStep(false, true), { when: hasBrush });
  for (let n = 0; n <= 9; n++) C2('opacity-' + n, 'tool_opacity', [String(n)], () => toolOpacity(n), { when: hasBrush, hidden: true }, { pct: n ? n * 10 : 100 });
  for (const [dir, dx, dy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]]) {
    const A = 'Arrow' + dir[0].toUpperCase() + dir.slice(1), isMove = () => UI.tool === 'move' && !TRANSFORM.active;   // i18n-ignore: ids, class names, key names or text for agents
    C2('nudge-' + dir, 'nudge_' + dir, [A], () => nudge(dx, dy), { when: isMove, repeat: true }, { n: 1 });
    C2('nudge-' + dir + '-10', 'nudge_' + dir, ['Shift+' + A], () => nudge(dx * 10, dy * 10), { when: isMove, repeat: true }, { n: 10 });
  }
  C2('next-doc', 'next_doc', ['Mod+Tab'], () => cycleDoc(1), { group: 'Window', when: () => DOCS.length > 1 });   // i18n-ignore: ids, class names, key names or text for agents
  C2('prev-doc', 'prev_doc', ['Shift+Mod+Tab'], () => cycleDoc(-1), { group: 'Window', when: () => DOCS.length > 1 });   // i18n-ignore: ids, class names, key names or text for agents
  for (let i = 1; i <= 9; i++) C2('doc-' + i, 'go_to_doc', ['Alt+' + i], () => { if (DOCS[i - 1]) switchToDoc(DOCS[i - 1]); }, { group: 'Window', when: () => !!DOCS[i - 1], hidden: true }, { i: String(i) });   // i18n-ignore: ids, class names, key names or text for agents
  C2('transform-restore-aspect', 'restore_aspect', [], () => restoreAspect(null), { group: 'Edit', when: tfCanRestore, keywords: ['transform', 'proportion', 'ratio', 'free transform'] });   // i18n-ignore: ids, class names, key names or text for agents
  C2('guides-panel', 'guides_panel', [], () => openGuidesPanel(), { group: 'Window', keywords: ['guideguide', 'grid', 'columns', 'layout'] });   // i18n-ignore: ids, class names, key names or text for agents
  return out;
}

/* ---------- keys that must run before the commands ---------- */
// Space-to-pan and tool keys (Enter/Esc/Backspace in transforms, crop, lassos) win over shortcuts, as before.
/** Keys pressed in an open menu (SlopUI or the menu bar) belong to the menu, not the tools. */
function inMenu(e) { return !!(e.target.closest && e.target.closest('[role="menu"]')); }
function onEarlyKey(e) {
  if (!CMD_ON || SlopUI.openDialogs || isTyping(e.target) || inMenu(e) || (window.SlopCmd && SlopCmd.isOpen)) return;
  if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) { if (!e.repeat) { V.space = true; V.el.classList.add('space'); } e.preventDefault(); e.stopImmediatePropagation(); return; }   // i18n-ignore: ids, class names, key names or text for agents
  const t = currentTool();
  if (t.onKey && t.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); dirty(); return; }
  if (openMenu && e.key === 'Escape') { closeMenus(); e.stopImmediatePropagation(); }
}
/** Registers the menu, tool and canvas commands (again after a language change: the ids stay, the titles follow). */
function registerCommands() {
  SlopCmd.register(menuCommands().concat(toolCommands()));
  SlopCmd.register(psGenCommands());   // ps.generate / ps.edit-ai with arguments (over the menu items' own entries)
  SlopCmd.register(psRetouchCommands());   // Auto retouch on this device (js/retouch/boot.js)
  const b = $('#cmdBtn'); if (b) { b.hidden = false; b.title = tr('photoslop.cmd.search_key', { key: SlopCmd.keyFor('cmd.palette') }); }
}
function wireCommands() {
  window.addEventListener('keydown', onEarlyKey, true);
  if (!window.SlopCmd || !SlopCmd.register) return false;
  try {
    SlopCmd.init({ app: 'photoslop' });
    CMD_ON = true;
    registerCommands();
    if (SlopCmd.provide) SlopCmd.provide({ prepare: loadAICommands });   // the assistant's commands load when the AI panel first needs them
  } catch (err) { console.warn(err); CMD_ON = false; }
  return CMD_ON;
}
/** The Slop AI panel's commands with arguments, the state summary and the checkpoint (ai-*.js), loaded on demand. */
function loadAICommands() {
  const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
  return ['js/app/ai-ops.js', 'js/app/ai-tools.js', 'js/app/ai-draw.js', 'js/app/ai-tool-use.js', 'js/app/ai-draw-cmds.js', 'js/app/ai-commands.js'].reduce((p, src) => p.then(() => add(src)), Promise.resolve());
}
/* AI pictures (Layer › Generate Image…, Edit with AI…): the shared module shared/ai/imagegen/ and js/app/imagegen.js
 * load on first use. window.SlopImageSink is there from the start, so the AI panel's generate_image puts its picture in
 * a new layer. ps.generate with arguments opens the dialog filled in; Generate there is the go-ahead to spend. */
let psGenP = null;
function psGenLoad() {
  const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s); });
  if (!psGenP) psGenP = add('../shared/ai/imagegen/index.js').then(() => SlopAIKit.imageGenReady).then(() => add('js/app/imagegen.js')).catch((e) => { psGenP = null; throw e; });
  return psGenP;
}
function psImageGen(mode, args) { return psGenLoad().then(() => psImageGenOpen(mode, args)).catch((e) => { toast(e.message); return e.message; }); }
window.SlopImageSink = { app: 'photoslop', name: 'PhotoSlop', targets: ['layer', 'document', 'drive'],   // i18n-ignore: ids, class names, key names or text for agents
  place: (images, o) => psGenLoad().then(() => psImageSink.place(images, o)), source: () => psGenLoad().then(() => psImageSink.source()) };
function psGenCommands() {
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 4000, description }, extra);
  const E = (name, values, description) => ({ name, type: 'enum', values, description });
  const args = [S('prompt', 'what the picture shows'), E('aspect', ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9'], 'width:height'), E('resolution', ['1K', '2K', '4K']),   // i18n-ignore: ids, class names, key names or text for agents
    E('quality', ['low', 'medium', 'high']), E('style', ['none', 'photo', 'illustration', 'painting', '3d', 'pixel-art', 'line-art', 'anime', 'watercolor']),
    { name: 'n', type: 'number', min: 1, max: 4, integer: true }, { name: 'transparent', type: 'boolean' }, E('target', ['layer', 'document', 'drive']), S('provider', 'openai, gemini, openrouter, …', { maxLength: 40 }), S('model', '', { maxLength: 120 })];
  const C = (id, mode, title, extra) => Object.assign({ id, title, group: cmdGroup('Layer'), keywords: ['ai', 'image', 'picture', 'generate', 'dall-e', 'gpt image', 'gemini', 'nano banana'], ai: false, macro: false, args, run: (a) => psImageGen(mode, a) }, extra);   // i18n-ignore: ids, class names, key names or text for agents
  const title = (k) => tr('photoslop.menu.bar_layer') + ' › ' + tr('photoslop.menu.' + k);
  return [C('ps.generate', 'generate', title('generate_image')), C('ps.edit-ai', 'edit', title('edit_with_ai'), { when: () => !!activeLayer() })];
}
function openCommandPalette(q) { if (CMD_ON) SlopCmd.open(q); else dlgShortcuts(); }
function openKeymap() { if (CMD_ON) SlopCmd.openKeymap(); else dlgShortcuts(); }
