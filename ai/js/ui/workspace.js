/* Slop AI — ui/workspace: the workspace panel beside the chat. Slopographic apps from the registry (shared/apps.js) open
 * in same-origin frames, one tab each. The assistant reaches them only through their SlopCmd registry (ids, run, search,
 * a state summary). It never gets to run JavaScript in a frame. Websites never get a frame: they open in a new tab with
 * window.open(url, '_blank', 'noopener,noreferrer'). Classic script; adds window.SlopWorkspace. Also loaded by the tests. */
(function () {
  'use strict';
  const ME = document.currentScript;
  const ROOT = ME && ME.src ? new URL('../../../', ME.src).href : new URL('../', location.href).href;
  const frames = new Map();   // app id → { app, frame, tab, loaded: Promise, ok }
  const granted = new Set();  // app ids the person allowed to run commands, for this page session only
  let timeout = 5000, host = null, panel = null, tabBox = null, nameEl = null, linkEl = null, framesBox = null, active = null;

  const apps = () => window.SLOP_APPS || [];
  /** The panel's words (ai/i18n): English when the page has no tables (the tests load this script alone). */
  const tr = (key, en, vars) => { const I = window.SlopI18n; return I && I.has(key) ? I.t(key, vars) : en.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)); };
  const own = (S) => S.list().filter((c) => !/^cmd\./.test(c.id)); // the app's commands, not SlopCmd's palette and keymap
  function h(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.filter((x) => x != null && x !== false));
    return n;
  }
  function findApp(id) { const s = String(id || '').trim().toLowerCase(); return apps().find((a) => a.id === s || a.name.toLowerCase() === s) || null; }
  const urlOf = (app) => new URL(app.path, ROOT).href;
  /** Only registry apps of kind "app", same origin, can be framed (not Slop AI itself, not anchors). */
  function framable(app) {
    return !!app && app.kind === 'app' && app.id !== 'ai' && !String(app.path).startsWith('#') && new URL(app.path, ROOT).origin === location.origin;
  }
  function withTimeout(p, msg) {
    let t;
    return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(msg)), timeout); })]).finally(() => clearTimeout(t));
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** The frame entry of an open app; throws when the id is unknown or the app is not open. */
  function entryOf(id) {
    const app = findApp(id);
    if (!app) throw new Error(`No app "${id}". Use list_apps to see the ids.`);
    const e = frames.get(app.id);
    if (!e) throw new Error(`${app.name} is not open. Call open_app with "${app.id}" first.`);
    return e;
  }
  /** Waits (up to the timeout) for the frame to finish loading. */
  function ready(id) {
    const e = entryOf(id);
    return withTimeout(e.loaded, `${e.app.name} did not finish loading within ${timeout / 1000} s.`).then(() => e);
  }
  /** The app's own commands, once it has registered them (apps register at boot). Throws when it has no registry. */
  async function commands(id) {
    const e = await ready(id), win = e.frame.contentWindow, t0 = Date.now();
    while (!(win.SlopCmd && own(win.SlopCmd).length) && Date.now() - t0 < timeout) await sleep(50);
    if (!win.SlopCmd) throw new Error(`${e.app.name} has no command registry (SlopCmd), so it can only be opened.`);
    if (win.SlopCmd.prepare) await win.SlopCmd.prepare().catch(() => {});   // the app's commands with arguments, loaded on demand
    const list = own(win.SlopCmd);
    if (!list.length) throw new Error(`${e.app.name} registered no commands within ${timeout / 1000} s.`);
    return { app: e.app, list };
  }

  function addFrame(app) {
    const frame = h('iframe', { class: 'ws-frame', title: app.name, hidden: true, src: urlOf(app) });
    const e = { app, frame, tab: null, ok: false, loaded: null };
    e.loaded = new Promise((res) => frame.addEventListener('load', function onLoad() {
      if (frame.contentWindow && frame.contentWindow.location.href === 'about:blank') return;
      frame.removeEventListener('load', onLoad);
      e.ok = true; res(e);
    }));
    e.tab = h('div', { class: 'ws-tab', role: 'tab' },
      h('button', { type: 'button', class: 'ws-tab-name', onclick: () => show(app.id) }, app.name),
      h('button', { type: 'button', class: 'ws-tab-x', 'aria-label': tr('ui.close_name', 'Close {name}', { name: app.name }), title: tr('ui.close_name', 'Close {name}', { name: app.name }), onclick: () => close(app.id) }, '×'));
    frames.set(app.id, e);
    tabBox.append(e.tab); framesBox.append(frame);
    return e;
  }
  function show(id) {
    const e = frames.get(id);
    if (!e) return;
    active = id;
    for (const [k, v] of frames) { v.frame.hidden = k !== id; v.tab.setAttribute('aria-selected', String(k === id)); }
    nameEl.textContent = e.app.name;
    linkEl.href = urlOf(e.app);
    panel.hidden = false; host.classList.add('ws-on');
  }
  function hide() { if (panel) panel.hidden = true; if (host) host.classList.remove('ws-on'); }
  /** Closes an app's tab and frame. The panel hides when the last one closes. */
  function close(id) {
    const app = findApp(id), e = app && frames.get(app.id);
    if (!e) return;
    e.frame.remove(); e.tab.remove(); frames.delete(app.id);
    if (active === app.id) {
      active = null;
      const next = [...frames.keys()].pop();
      if (next) show(next); else hide();
    }
  }

  /** The panel goes into `el` (the chat's views container). Frames stay loaded while the panel is hidden. */
  function mount(el) {
    if (panel || !el) return;
    host = el;
    tabBox = h('div', { class: 'ws-tabs', role: 'tablist' });
    nameEl = h('span', { class: 'ws-name' });
    linkEl = h('a', { class: 'ws-btn', target: '_blank', rel: 'noopener noreferrer', title: tr('ai.ws.open_tab_tip', 'Open this app in a new tab'), 'data-i18n': 'ai.ws.open_tab', 'data-i18n-attr': 'title:ai.ws.open_tab_tip' }, tr('ai.ws.open_tab', 'Open in new tab ↗'));
    framesBox = h('div', { class: 'ws-frames' });
    panel = h('aside', { class: 'ws', 'aria-label': tr('ai.ws.label', 'Workspace'), 'data-i18n-attr': 'aria-label:ai.ws.label', hidden: true },
      h('header', { class: 'ws-head' }, tabBox,
        h('button', { type: 'button', class: 'ws-btn', title: tr('ai.ws.hide_tip', 'Hide the workspace (the apps stay open)'), 'aria-label': tr('ai.ws.hide', 'Hide the workspace'), 'data-i18n-attr': 'title:ai.ws.hide_tip;aria-label:ai.ws.hide', onclick: hide }, '×')),
      h('div', { class: 'ws-bar' }, nameEl, linkEl),
      framesBox);
    el.append(panel);
    if (window.SlopI18n && SlopI18n.on) SlopI18n.on(() => { for (const e of frames.values()) { const x = e.tab.querySelector('.ws-tab-x'), s = tr('ui.close_name', 'Close {name}', { name: e.app.name }); x.title = s; x.setAttribute('aria-label', s); } });
  }

  /** Opens an app in the workspace, or focuses it. Resolves once its page has loaded. */
  async function open(id) {
    const app = findApp(id);
    if (!app) throw new Error(`No app "${id}". Use list_apps to see the ids.`);
    if (!framable(app)) throw new Error(`${app.name} cannot be opened beside the chat.`);
    if (!host) throw new Error('The workspace is not on this page.');
    const e = frames.get(app.id) || addFrame(app);
    show(app.id);
    await withTimeout(e.loaded, `${app.name} did not finish loading within ${timeout / 1000} s.`);
    return { id: app.id, name: app.name, drivable: !!e.frame.contentWindow.SlopCmd };
  }

  /** Websites: a new browser tab only, never framed. Only http and https. */
  function openUrl(raw) {
    let u;
    try { u = new URL(String(raw || '').trim()); } catch (e) { throw new Error(`"${raw}" is not a web address.`); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http and https addresses can be opened.');
    window.open(u.href, '_blank', 'noopener,noreferrer');
    return `Opened ${u.hostname} in a new browser tab. Websites never open inside the workspace.`;
  }

  /** Runs one command through the frame's SlopCmd.run. Returns SlopCmd's answer: false when it is missing or not enabled. */
  async function run(id, cmdId, args) {
    const S = entryOf(id).frame.contentWindow.SlopCmd;
    if (!S) return false;
    if (!S.exec) return S.run(cmdId, { source: 'ai', args: args || {} });
    const r = await S.exec(cmdId, args || {}, { source: 'ai' });   // checked and clamped against the command's args schema
    if (!r.ok) throw new Error(r.error);
    return r;
  }
  /** Up to ten commands matching a query (the app's palette search), as { id, title, group, enabled, args?, does? }. With no
   * query: every command that can run now, those that take arguments (create, add, edit, export) first. */
  async function search(id, q) {
    await commands(id);
    const S = entryOf(id).frame.contentWindow.SlopCmd, all = !String(q || '').trim();
    const usable = (c) => { try { return c.enabled !== false && (!c.when || c.when()); } catch (e) { return false; } };
    const list = (all ? S.list().filter(usable).map((c) => Object.assign({}, c, { enabled: true })).sort((x, y) => !!y.args - !!x.args) : S.search(String(q)))
      .filter((c) => !/^cmd\./.test(c.id) && (!c.hidden || c.args) && c.ai !== false);
    return list.slice(0, all ? 80 : 10).map((c) => Object.assign({ id: c.id, title: c.title, group: c.group || '', enabled: !!c.enabled },
      c.args ? { args: argList(c.args, entryOf(id).frame.contentWindow.SlopCmdArgs || window.SlopCmdArgs) } : null, c.args && c.description ? { does: String(c.description).slice(0, 160) } : null));
  }
  /** A command's arguments for the model: ['radius: number 0.1–250, default 4', …] (shared/commands/args.js shapes). */
  const argList = (args, A = window.SlopCmdArgs) => { return (Array.isArray(args) ? args : Object.keys(args).map((k) => Object.assign({ name: k }, args[k]))).map((a) =>
    (A ? `${a.name}${a.required ? '' : '?'}: ${A.hint(A.normalize([a])[0])}` : `${a.name}: ${a.type || 'string'}${a.min != null && a.max != null ? ` ${a.min}–${a.max}` : ''}${a.values ? ' (' + a.values.join('|') + ')' : ''}${a.default !== undefined ? ', default ' + a.default : ''}`)
    + (a.description ? ` (${String(a.description).slice(0, 80)})` : '')); };
  /** A summary of an open app: title, whether it can be driven, and what it shares through window.SlopAppState(). */
  async function state(id) {
    const e = await ready(id), w = e.frame.contentWindow;
    let st = null, note = null;
    if (w.SlopCmd && w.SlopCmd.state) {
      if (w.SlopCmd.prepare) await w.SlopCmd.prepare().catch(() => {});
      try { st = JSON.parse(JSON.stringify((await w.SlopCmd.state()) || null)); } catch (err) { note = 'The app state hook failed: ' + err.message; }
    }
    if (st == null && !note && typeof w.SlopAppState === 'function') {
      try { st = JSON.parse(JSON.stringify(w.SlopAppState())); } catch (err) { note = 'The app state hook failed: ' + err.message; }
    } else if (st == null && !note) note = 'This app shares no state (no SlopCmd.provide({ state }) or window.SlopAppState hook), so only its title and command count are known.';
    return { app: e.app.name, title: w.document.title || e.app.name, drivable: !!w.SlopCmd, commands: w.SlopCmd ? own(w.SlopCmd).length : 0, state: st, note };
  }
  /** A picture of an open app's work: its own SlopCmd.snapshot() (or the page drawn, shared/commands/view.js), as a canvas or Blob. */
  async function snapshot(id) {
    const e = await ready(id), S = e.frame.contentWindow.SlopCmd;
    if (!S || !S.snapshot) throw new Error(`${e.app.name} has no command registry, so it cannot show its work.`);
    if (S.prepare) await S.prepare().catch(() => {});
    const pic = await S.snapshot();
    if (!pic) throw new Error(`${e.app.name} has nothing to show yet.`);
    return pic;
  }
  /** One command of an open app as the registry lists it, or null (sync, for the destructive check). */
  function findCommand(id, cmdId) {
    const app = findApp(id), e = app && frames.get(app.id);
    const S = e && e.ok && e.frame.contentWindow.SlopCmd;
    return S ? S.list().find((c) => c.id === cmdId) || null : null;
  }

  window.SlopWorkspace = {
    mount, open, openUrl, close, hide, show: (id) => show(id),
    isOpen: (id) => { const app = findApp(id); return !!app && frames.has(app.id); },
    openIds: () => [...frames.keys()],
    ready, commands, run, search, state, snapshot, findCommand, findApp, framable,
    granted: (id) => { const app = findApp(id); return !!app && granted.has(app.id); },
    grant: (id) => { const app = findApp(id); if (app) granted.add(app.id); },
    forgetGrants: () => granted.clear(),
    configure: (o = {}) => { if (o.timeout != null) timeout = Number(o.timeout); },
    root: ROOT,
  };
})();
