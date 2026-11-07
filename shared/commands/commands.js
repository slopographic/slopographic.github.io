/* SlopCmd: the shared command registry, customizable keyboard shortcuts and the Spotlight palette.
 * Classic script, no dependencies (uses SlopUI when present). Sets window.SlopCmd. See HANDOFF.md.
 * This file is the core (key parsing, registry, overrides, recents, dispatch). The UI parts
 * (search.js, palette.js, recorder.js, keymap.js) load on demand from this folder unless the page
 * already lists them with <script> tags (do that for offline single-file builds). */
(function () {
  'use strict';
  if (window.SlopCmd) return;
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded
  const SCRIPT = document.currentScript;
  const BASE = SCRIPT && SCRIPT.src ? new URL('./', SCRIPT.src).href : null;
  const PARTS = ['search', 'palette', 'recorder', 'keymap'];
  let mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

  /* ---------- key parsing and display ---------- */
  const MODS = { mod: 'Mod', cmd: 'Mod', command: 'Mod', '⌘': 'Mod', ctrl: 'Ctrl', control: 'Ctrl', '⌃': 'Ctrl', alt: 'Alt', option: 'Alt', opt: 'Alt', '⌥': 'Alt', shift: 'Shift', '⇧': 'Shift', meta: 'Meta', win: 'Meta', super: 'Meta' };
  const NAMES = { esc: 'Escape', escape: 'Escape', del: 'Delete', delete: 'Delete', backspace: 'Backspace', return: 'Enter', enter: 'Enter', space: 'Space', ' ': 'Space', spacebar: 'Space', tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', plus: '+', minus: '-', pageup: 'PageUp', pgup: 'PageUp', pagedown: 'PageDown', pgdn: 'PageDown', home: 'Home', end: 'End', insert: 'Insert' };
  const ORDER = ['Ctrl', 'Mod', 'Meta', 'Alt', 'Shift'];
  const IS_MOD_KEY = /^(Control|Shift|Alt|Meta|OS|AltGraph|CapsLock|Fn|FnLock|Hyper|Super|Dead|Unidentified|Process)$/;
  function normKey(k) {
    if (!k) return '';
    const low = k.toLowerCase();
    if (NAMES[low]) return NAMES[low];
    if (/^f([1-9]|1[0-9]|2[0-4])$/.test(low)) return k.toUpperCase();
    if (k.length === 1) return k.toUpperCase();
    return k[0].toUpperCase() + k.slice(1);
  }
  /** One step ("Shift+Mod+Z") → canonical "Mod+Shift+Z" ('' if invalid). On Windows/Linux Ctrl is Mod; on a Mac Meta (⌘) is. */
  function canonStep(step, m = mac) {
    const parts = String(step).trim().split(/\+(?!$)/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return '';
    const mods = new Set();
    let key = '', bad = false;
    parts.forEach((p, i) => {
      const md = MODS[p.toLowerCase()];
      if (i === parts.length - 1) { key = md ? '' : normKey(p); return; }
      if (!md) { bad = true; return; }
      mods.add(md === 'Ctrl' && !m ? 'Mod' : md === 'Meta' && m ? 'Mod' : md);
    });
    if (bad) return '';
    if (!key || (key.length > 1 && !/^[A-Z][A-Za-z0-9]*$/.test(key))) return '';
    return ORDER.filter((x) => mods.has(x)).concat(key).join('+');
  }
  /** "Mod+K Mod+S" → ['Mod+K', 'Mod+S'], or null when invalid. */
  function parse(binding, m = mac) {
    if (Array.isArray(binding)) binding = binding.join(' ');
    const steps = String(binding || '').trim().split(/\s+/).filter(Boolean).map((s) => canonStep(s, m));
    return steps.length && steps.every(Boolean) ? steps : null;
  }
  const canon = (binding, m = mac) => { const p = parse(binding, m); return p ? p.join(' ') : ''; };
  const MAC_SYM = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘', Meta: '⌘' };
  const PC_NAME = { Ctrl: 'Ctrl', Mod: 'Ctrl', Meta: 'Win', Alt: 'Alt', Shift: 'Shift' };
  function keyName(k, m) {
    const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc', PageUp: 'PgUp', PageDown: 'PgDn', Space: 'Space' };
    if (m) Object.assign(map, { Enter: '↩', Backspace: '⌫', Delete: '⌦', Tab: '⇥' }); else Object.assign(map, { Delete: 'Del' });
    return map[k] || k;
  }
  /** Display string for a binding: '⇧⌘Z' on a Mac, 'Ctrl+Shift+Z' elsewhere. Chord steps are joined by a space. */
  function format(binding, m = mac) {
    const steps = parse(binding, m);
    if (!steps) return '';
    return steps.map((s) => {
      const parts = s.split(/\+(?!$)/), key = keyName(parts.pop(), m);
      if (m) return ['Ctrl', 'Alt', 'Shift', 'Mod', 'Meta'].filter((x) => parts.includes(x)).map((x) => MAC_SYM[x]).join('') + key;
      return ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'].filter((x) => parts.includes(x)).map((x) => PC_NAME[x]).filter((x, i, a) => a.indexOf(x) === i).concat(key).join('+');
    }).join(' ');
  }
  /** Canonical step candidates for a keydown: [primary, symbol form without Shift?]; null for lone modifiers. */
  function eventSteps(e, m = mac) {
    const k = e.key;
    if (!k || IS_MOD_KEY.test(k)) return null;
    const c = e.code || '';
    let key;
    if (/^[a-z]$/i.test(k)) key = k.toUpperCase();
    else if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
    else if (/^Digit[0-9]$/.test(c)) key = c.slice(5);
    else key = normKey(k);
    const mods = [];
    if (m ? e.metaKey : e.ctrlKey) mods.push('Mod');
    if (m && e.ctrlKey) mods.push('Ctrl');
    if (!m && e.metaKey) mods.push('Meta');
    if (e.altKey) mods.push('Alt');
    const head = ORDER.filter((x) => mods.includes(x));
    const out = [head.concat(e.shiftKey ? ['Shift', key] : [key]).join('+')];
    const sym = k.length === 1 && !/[\p{L}\p{N}\s]/u.test(k) ? normKey(k) : null;
    if (sym) { const alt = head.concat(sym).join('+'); if (alt !== out[0]) out.push(alt); }
    const phys = PUNCT[c]; // the unshifted key on a US layout, so 'Shift+Mod+]' matches when Shift turns ] into }
    if (phys && phys !== key) { const p = head.concat(e.shiftKey ? ['Shift', phys] : [phys]).join('+'); if (!out.includes(p)) out.push(p); }
    return out;
  }
  const PUNCT = { BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Backquote: '`' };
  const hasMod = (seq) => seq.some((s) => /(^|\+)(Mod|Ctrl|Meta)\+/.test(s));

  /* ---------- storage ---------- */
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  let app = 'default', overrides = {}, recents = {}, stamp = 0;
  const keyStore = () => 'slop.keys.' + app, recStore = () => 'slop.cmd.recent.' + app;

  /* ---------- registry ---------- */
  const cmds = new Map(), listeners = {};
  let index = [];
  function emit(type, data) { for (const fn of (listeners[type] || []).slice()) try { fn(data); } catch (err) { console.error(err); } }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); return () => off(type, fn); } function off(type, fn) { const l = listeners[type]; if (l && l.indexOf(fn) >= 0) l.splice(l.indexOf(fn), 1); }
  const bindings = (id) => { const c = cmds.get(id); if (!c) return []; return (Object.prototype.hasOwnProperty.call(overrides, id) ? overrides[id] : c.keys).slice(); };
  function rebuild() {
    index = [];
    for (const [id] of cmds) for (const b of bindings(id)) { const seq = parse(b); if (seq) index.push({ id, seq, key: seq.join(' ') }); }
  }
  let changeQueued = false; function changed() { rebuild(); if (changeQueued) return; changeQueued = true; Promise.resolve().then(() => { changeQueued = false; emit('change'); }); }
  function register(list) {
    for (const c of [].concat(list || [])) {
      if (!c || !c.id || typeof c.run !== 'function') { console.warn('SlopCmd.register: needs id and run()', c); continue; }
      cmds.set(c.id, Object.assign({}, c, { keys: [].concat(c.keys || []).filter((k) => parse(k)) }));
    }
    changed();
  }
  function unregister(id) { for (const i of [].concat(id)) cmds.delete(i); changed(); }
  const enabled = (c) => { try { return !c.when || !!c.when(); } catch (e) { return false; } };
  const checkedOf = (c) => { try { return c.checked ? !!c.checked() : undefined; } catch (e) { return undefined; } };
  function view(c) { return { id: c.id, title: c.title || c.id, group: c.group || '', icon: c.icon || '', keywords: c.keywords || [], keys: bindings(c.id), defaults: c.keys.slice(), enabled: enabled(c), checked: checkedOf(c), hidden: !!c.hidden, args: c.args || null, tool: c.tool || null, description: c.description || '', destructive: c.destructive, ai: c.ai, macro: c.macro, readOnly: !!c.readOnly, sends: !!c.sends }; }
  const list = () => [...cmds.values()].map(view);
  function run(id, ctx = {}) {
    const c = cmds.get(id);
    if (!c || !enabled(c)) { if (c && window.SlopUI && ctx.source !== 'palette') SlopUI.toast(c.why || tr('ui.cmd.not_available', { title: c.title || id })); return false; }
    if (ctx.record !== false && !c.noRecent) { const r = recents[id] || [0, 0]; stamp = Math.max(Date.now(), stamp + 1); recents[id] = [r[0] + 1, stamp]; trimRecents(); ls.set(recStore(), recents); }
    try { call(c, ctx); } catch (err) { console.error(err); if (window.SlopUI) SlopUI.toast(tr('ui.cmd.failed', { title: c.title || id, error: err.message })); }
    emit('run', { id, source: ctx.source || 'api' });
    return true;
  }
  /** A command with an args schema gets run(args, ctx): args null when the caller gave none (keys, palette), else checked
   * against the schema (args.js) with defaults filled. Others get run(ctx) as always. */
  function call(c, ctx) {
    const full = Object.assign({ id: c.id, source: 'api' }, ctx);
    if (!c.args) return c.run(full);
    const A = window.SlopCmdArgs, a = ctx.args == null ? null : A ? A.validate(c.args, ctx.args).args : Object.assign({}, ctx.args);
    return c.run(a, full);
  }
  /** Run with arguments and wait for the command to finish: { ok, value, args, notes } or { ok: false, error }. */
  async function exec(id, args, ctx = {}) {
    const c = cmds.get(id); if (!c) return { ok: false, error: `No command "${id}"` };
    if (!enabled(c)) return { ok: false, error: c.why || (c.title || id) + ' is not available right now' };
    let v = { args: args || {}, notes: [] };
    if (c.args) { await ensureArgs(); v = window.SlopCmdArgs.validate(c.args, args || {}); if (!v.ok) return { ok: false, error: v.errors.join('; '), args: v.args }; }
    try {
      const value = await call(c, Object.assign({ source: 'api' }, ctx, { args: v.args }));
      emit('run', { id, source: ctx.source || 'api', args: v.args });
      return { ok: true, value, args: v.args, notes: v.notes };
    } catch (err) { return { ok: false, error: String((err && err.message) || err), args: v.args }; }
  }
  const ensureArgs = () => (window.SlopCmdArgs || !BASE ? Promise.resolve() : loadPart('args'));
  /** What an app shares with the assistant: provide({ state, checkpoint: () => rollbackFn, prepare, snapshot: () => Blob|canvas (look_at_canvas), context }); only a provided
   * prepare is remembered (one provided after an early prepare() call still runs). No state or snapshot: view.js gives the page's. */
  const prov = {}, provide = (o) => { if (o && o.prepare && o.prepare !== prov.prepare) prepP = null; Object.assign(prov, o || {}); };
  let prepP = null, srcP = null; const pageView = () => (parts.view ? Promise.resolve(parts.view) : BASE ? loadPart('view').then(() => parts.view) : Promise.reject(new Error('This page has no view summary')));
  function trimRecents() { const ids = Object.keys(recents); if (ids.length > 60) ids.sort((a, b) => recents[a][1] - recents[b][1]).slice(0, ids.length - 60).forEach((i) => delete recents[i]); }
  /** Frecency: use count weighted by how recently it was used (half-life about a day). */
  function frecency(id, now = Date.now()) { const r = recents[id]; if (!r) return 0; return r[0] * Math.pow(0.5, (now - r[1]) / 864e5) + 1 / (1 + (now - r[1]) / 6e4); }
  function recent(n = 6) { return Object.keys(recents).filter((i) => cmds.has(i)).sort((a, b) => recents[b][1] - recents[a][1]).slice(0, n); }
  /** Extra palette results: addProvider({ id, title, search(query) → [{ id, title, group?, icon?, keywords?, run }] }). */
  const providers = new Map();
  function addProvider(p) { if (p && p.id && typeof p.search === 'function') providers.set(p.id, p); return () => providers.delete(p.id); }
  /* ---------- overrides ---------- */
  function setKeys(id, keys) {
    const c = cmds.get(id), clean = [...new Set([].concat(keys || []).map((k) => canon(k)).filter(Boolean))];
    if (c && clean.join('|') === c.keys.map((k) => canon(k)).join('|')) delete overrides[id]; else overrides[id] = clean;
    ls.set(keyStore(), overrides); changed();
  }
  function resetKeys(id) { if (id == null) overrides = {}; else delete overrides[id]; ls.set(keyStore(), overrides); changed(); }
  const overlaps = (a, b) => { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; };
  /** Commands (other than exceptId) whose binding equals the given one or shadows it as a chord prefix. */
  function conflicts(binding, exceptId) {
    const seq = parse(binding); if (!seq) return [];
    const out = [];
    for (const e of index) if (e.id !== exceptId && overlaps(e.seq, seq) && !out.some((o) => o.id === e.id && o.key === e.key)) out.push({ id: e.id, key: e.key, title: (cmds.get(e.id).title || e.id) });
    return out;
  }
  function allConflicts() { const out = {}; for (const e of index) { const c = conflicts(e.key, e.id); if (c.length) (out[e.id] = out[e.id] || []).push(...c); } return out; }
  const exportKeys = () => ({ format: 'slop-keys', version: 1, app, keys: JSON.parse(JSON.stringify(overrides)) });
  function importKeys(data) {
    const keys = data && typeof data === 'object' ? (data.keys && typeof data.keys === 'object' ? data.keys : data) : null;
    if (!keys || Array.isArray(keys)) throw new Error('Not a shortcuts file');
    const next = {};
    for (const id in keys) { if (id === 'format' || id === 'version' || id === 'app') continue; const v = keys[id]; if (!Array.isArray(v)) throw new Error('Bad entry for ' + id); next[id] = v.map((k) => canon(k)).filter(Boolean); }
    overrides = Object.assign({}, overrides, next); ls.set(keyStore(), overrides); changed();
    return Object.keys(next).length;
  }

  /* ---------- dispatch ---------- */
  let target = null, pending = null, paletteOpen = false, recording = 0; const CHORD_MS = 1500;
  // Typing in a field is shared/input/typing.js's call (the one guard every shortcut handler uses); loaded here if no one did
  if (!window.SlopTyping && BASE) document.head.append(Object.assign(document.createElement('script'), { src: BASE + '../input/typing.js', async: false }));
  const isTyping = (t) => !!(window.SlopTyping && window.SlopTyping.isTyping(t));
  const dialogOpen = () => !!(window.SlopUI && SlopUI.openDialogs > 0) || paletteOpen;
  function candidates(seq, typing, blocked) {
    const exact = [], prefix = [];
    for (const e of index) {
      if (e.seq.length < seq.length || !overlaps(e.seq, seq)) continue;
      const c = cmds.get(e.id);
      if (blocked && !c.global) continue;
      if (typing && !hasMod(e.seq)) continue;
      if (!enabled(c)) continue;
      (e.seq.length === seq.length ? exact : prefix).push(e);
    }
    return { exact, prefix };
  }
  const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);
  function onKey(e) {
    if (recording || e.isComposing) return;
    if (e.target && e.target.closest && e.target.closest('[role="menu"]')) return; // an open menu takes its own keys
    if (e.key === 'Escape' && document.querySelector('[data-slop-escape]')) return; // an open sheet (shared/ui/sheet.js) closes first
    if (TAB_KEYS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && e.target && e.target.closest && e.target.closest('[role="tablist"]')) return; // and a focused tab strip its arrows
    if (window.SlopTyping && window.SlopTyping.yields(e)) return;   // a key the field uses (Ctrl+A, Ctrl+Z, Home…) is never a shortcut there
    const steps = eventSteps(e);
    if (!steps) return;
    const typing = isTyping(e), blocked = dialogOpen();
    const now = Date.now();
    const pre = pending && now - pending.t < CHORD_MS ? pending.seq : [];
    pending = null;
    for (const prefixSeq of pre.length ? [pre, []] : [[]]) {
      for (const s of steps) {
        const seq = prefixSeq.concat(s), { exact, prefix } = candidates(seq, typing, blocked);
        if (exact.length) {
          e.preventDefault(); e.stopPropagation();
          const c = cmds.get(exact[0].id);
          if (e.repeat && !c.repeat) return;
          run(c.id, { source: 'key', event: e });
          return;
        }
        if (prefix.length) { e.preventDefault(); e.stopPropagation(); pending = { seq, t: now }; emit('chord', seq); return; }
      }
    }
  }
  function attach(t) { if (target) target.removeEventListener('keydown', onKey, true); target = t; target.addEventListener('keydown', onKey, true); }

  /* ---------- UI parts (loaded on demand) ---------- */
  const parts = {};
  let uiP = null;
  function ensureUI() {
    const missing = PARTS.filter((p) => !parts[p]);
    if (!missing.length) return Promise.resolve(parts);
    if (uiP) return uiP;
    if (!BASE) return Promise.reject(new Error('SlopCmd UI parts are not loaded'));
    if (!document.querySelector('link[href*="commands/commands.css"]')) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: BASE + 'commands.css' }));   // the palette's look, where the page did not link it
    uiP = missing.reduce((p, name) => p.then(() => (parts[name] ? null : loadPart(name))), Promise.resolve()).then(() => parts, (err) => { uiP = null; throw err; });
    return uiP;
  }
  const loadPart = (name) => new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: BASE + name + '.js', onload: res, onerror: () => rej(new Error('Could not load ' + name + '.js')) })));
  const withUI = (fn) => ensureUI().then(fn, (err) => { console.warn(err); if (window.SlopUI) SlopUI.toast(tr('ui.cmd.offline')); });
  let opts = {};
  function init(o = {}) {
    opts = o;
    app = String(o.app || 'default');
    overrides = ls.get(keyStore()) || {};
    recents = ls.get(recStore()) || {};
    attach(o.target || window);
    if (o.paletteKeys) { const pc = cmds.get('cmd.palette'); pc.keys = [].concat(o.paletteKeys).filter((k) => parse(k)); }
    changed();
    const pre = () => setTimeout(() => withUI((p) => { if (o.fab && p.palette.fab) p.palette.fab(o.fab); }), 0);
    if (document.readyState === 'complete') pre(); else addEventListener('load', pre, { once: true });
    return api;
  }
  const OWN = { 'cmd.palette': 'ui.cmd.palette_dots', 'cmd.keymap': 'ui.cmd.keymap_dots', 'cmd.workflow': 'ui.cmd.workflow_dots' }, own = (id) => tr(OWN[id]);   // titles follow a language change; groups stay ids
  register([
    { id: 'cmd.palette', title: own('cmd.palette'), group: 'Help', keys: ['Mod+K', 'Shift+Mod+P', '/'], keywords: ['spotlight', 'palette', 'find', 'actions'], global: true, noRecent: true, run: () => (paletteOpen ? api.close() : api.open()) },
    { id: 'cmd.keymap', title: own('cmd.keymap'), group: 'Help', keywords: ['keys', 'keymap', 'hotkeys', 'bindings', 'customize'], noRecent: true, run: () => api.openKeymap() },
    { id: 'cmd.workflow', title: own('cmd.workflow'), group: 'File', keywords: ['workflow', 'batch', 'pipeline', 'automate', 'chain', 'apps'], when: () => !!BASE && !window.SlopWorkflowsPage, run: () => import(new URL('../ops/dialog.js', BASE).href).then((m) => m.open({})) },   // shared/ops/dialog.js
  ]);
  if (window.SlopI18n && SlopI18n.on) SlopI18n.on(() => { for (const id in OWN) { const c = cmds.get(id); if (c) c.title = own(id); } changed(); });
  const api = {
    init, register, unregister, run, list, on, off, parse, canon, format, eventSteps, isTyping, conflicts, allConflicts,
    setKeys, resetKeys, exportKeys, importKeys, recent, frecency, ensureUI, bindings, addProvider, _parts: parts,
    providers: () => [...providers.values()], removeProvider: (id) => providers.delete(id),
    get: (id) => cmds.get(id) || null,
    exec, provide,
    // a value or a promise (an app's state may be async, as aitools' is): callers await it; a failure is { error } either way
    state: () => { try { const v = prov.state ? prov.state() : pageView().then((p) => p.state(), () => null); return v && typeof v.then === 'function' ? v.then(null, (e) => ({ error: String((e && e.message) || e) })) : v; } catch (e) { return { error: e.message }; } },
    checkpoint: () => (prov.checkpoint ? prov.checkpoint() : null),
    snapshot: () => (prov.snapshot ? prov.snapshot() : pageView().then((v) => v.snapshot(), () => null)),
    ownState: () => !!prov.state, context: () => (prov.context ? prov.context() : null),   // what the AI panel's ready-made prompts fill in (shared/ai/quick/context.js)
    prepare: () => (!prov.prepare ? Promise.resolve(null) : (prepP = prepP || Promise.resolve(prov.prepare()).catch((e) => { prepP = null; throw e; }))),
    keyFor: (id) => { const b = bindings(id); return b.length ? format(b[0]) : ''; },
    keysFor: (id) => bindings(id).map((b) => format(b)),
    overrides: () => JSON.parse(JSON.stringify(overrides)),
    search: (q) => (parts.search ? parts.search.rank(q, list()) : list().filter((c) => !q || (c.title + ' ' + c.id).toLowerCase().includes(String(q).toLowerCase()))),
    open: (q) => withUI((p) => p.palette.open(q)),
    close: () => { if (parts.palette) parts.palette.close(); },
    openKeymap: () => { api.close(); return withUI((p) => p.keymap.open()); },
    get isOpen() { return paletteOpen; }, get app() { return app; }, get options() { return opts; },
    /** add(tool, title, args, run, extra) for an app's assistant commands: id '<prefix>.ai.<tool with dashes>', hidden, in
     * the AI group; run gets the defaults when called with no arguments (keys, palette). Pushes into list when given. */
    aiAdder: (prefix, list) => (tool, title, args, run, extra) => { const c = Object.assign({ id: prefix + '.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args, run: (a) => run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})) }, extra); if (list) list.push(c); return c; },
    /** shared/commands/sources.js (Slop Drive and site files for commands), loaded once on demand: resolves SlopCmdSources. */
    sources: () => (window.SlopCmdSources || !BASE ? Promise.resolve(window.SlopCmdSources) : (srcP = srcP || loadPart('sources').then(() => window.SlopCmdSources, (e) => { srcP = null; throw e; }))),
    get mac() { return mac; }, set mac(v) { mac = !!v; changed(); }, get base() { return BASE; },
    _setOpen(v) { paletteOpen = !!v; pending = null; emit(v ? 'open' : 'close'); },
    _recording(d) { recording = Math.max(0, recording + d); pending = null; }, _emit: emit,
  };
  window.SlopCmd = api;
})();
