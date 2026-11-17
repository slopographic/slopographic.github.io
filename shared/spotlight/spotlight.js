/* Spotlight: a Home link and an "All apps" search on every app page. Press Ctrl+K (⌘K on a Mac), or click the pill in the
 * corner (not on pages whose header has the brand and the shell's Apps button), and type to find an app by name, what it does or a keyword. Enter opens it; Escape closes the search.
 * Where the page has the shared command palette (SlopCmd), Ctrl+K opens that palette, which lists the apps too.
 * The app list comes from shared/apps.js and the descriptions from shared/finder/app-search.js: both are loaded here
 * when a page does not already have them. Classic script, self-contained, no network. */
(function () {
  'use strict';
  if (window.SlopSpotlight) return;
  const here = document.currentScript && document.currentScript.src;
  const root = here ? here.slice(0, here.indexOf('shared/spotlight/spotlight.js')) : '/';

  const css = `
  .sps-dock{position:fixed;left:12px;bottom:12px;z-index:60;display:flex;gap:6px}
  .sps-pill{display:flex;gap:6px;align-items:center;padding:6px 10px;border-radius:99px;
    border:1px solid rgba(127,127,140,.45);background:rgba(20,20,24,.82);color:#f1ede4;font:600 12px system-ui,sans-serif;text-decoration:none;cursor:pointer;
    -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
  .sps-pill:focus-visible{outline:2px solid #d4ff3a;outline-offset:2px}
  .sps-pill kbd{font:inherit;opacity:.6}
  .sps-back{position:fixed;inset:0;z-index:100;display:none;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;background:rgba(0,0,0,.45)}
  .sps-back.on{display:flex}
  .sps-box{width:min(560px,100%);max-height:70vh;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#17171b;color:#f1ede4;border:1px solid #2b2b33;box-shadow:0 18px 50px rgba(0,0,0,.5);font:14px system-ui,sans-serif}
  .sps-in{width:100%;box-sizing:border-box;padding:14px 16px;border:0;border-bottom:1px solid #2b2b33;background:transparent;color:inherit;font:inherit;font-size:16px;outline:none}
  .sps-list{list-style:none;margin:0;padding:6px;overflow:auto}
  .sps-item{display:grid;gap:2px;padding:10px 12px;border-radius:10px;cursor:pointer}
  .sps-item[aria-selected="true"],.sps-item:hover{background:rgba(212,255,58,.12)}
  .sps-name{font-weight:700}
  .sps-desc{font-size:12.5px;opacity:.7;line-height:1.4}
  .sps-none{padding:14px 16px;opacity:.7}
  @media (prefers-color-scheme: light){ .sps-box{background:#fff;color:#111;border-color:#ddd} .sps-in{border-color:#ddd} .sps-pill{background:rgba(255,255,255,.9);color:#111} }`;

  let back = null, input = null, list = null, shown = [], sel = 0, apps = null;
  /** Words: the chrome's (nav.*, switcher.*) and ui.spot.*; an app's name and tagline in the chosen language when the
   *  tables have it (app.<id>, apptag.<id>), else the registry's. */
  const I = () => window.SlopI18n;
  const tr = (k, v) => (I() ? I().t(k, v) : k);
  const own = (k, fallback) => (I() && I().has(k) ? I().t(k) : fallback);
  const nameOf = (a) => (window.slopAppName ? window.slopAppName(a) : own('app.' + a.id, a.name));   // the app's name in the chosen language
  const descOf = (a) => ((window.SLOP_APP_SEARCH || {})[a.id] || {}).desc || (window.slopAppTagline ? window.slopAppTagline(a) : own('apptag.' + a.id, a.tagline || ''));   // the long description (ui.appdesc.*), else the one-liner

  function addStyle() {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.append(st);
  }
  function load(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = root + src;
      s.onload = resolve;
      s.onerror = resolve;
      document.head.append(s);
    });
  }
  async function ensureData() {
    if (!window.SLOP_APPS) await load('shared/apps.js');
    if (!window.SLOP_APP_SEARCH) await load('shared/finder/app-search.js');
    apps = (window.SLOP_APPS || []).filter((a) => a.path && a.status !== 'moved');
  }
  const hay = (a) => {
    const d = (window.SLOP_APP_SEARCH || {})[a.id] || {};
    return [a.name, nameOf(a), a.tagline, descOf(a), d.desc, ...(d.keywords || [])].join(' ').toLowerCase();
  };
  function matches(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return apps.filter((a) => words.every((w) => hay(a).includes(w)));
  }
  function paint() {
    list.replaceChildren();
    if (!shown.length) { const p = document.createElement('p'); p.className = 'sps-none'; p.textContent = tr('ui.spot.none'); list.append(p); return; }
    shown.forEach((a, i) => {
      const li = document.createElement('li');
      li.className = 'sps-item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === sel));
      const n = document.createElement('div'); n.className = 'sps-name'; n.textContent = nameOf(a);
      const d = document.createElement('div'); d.className = 'sps-desc'; d.textContent = descOf(a);
      li.append(n, d);
      li.addEventListener('mousedown', (e) => { e.preventDefault(); go(a); }); // touch-ok: before the field's blur; a tap sends it too
      list.append(li);
    });
  }
  function go(a) { location.href = root + a.path; }
  /** The shared command palette (SlopCmd, Ctrl or Cmd+K) lists the apps too, when the page has it. */
  function registerWithCommands() {
    const C = window.SlopCmd;
    if (!C || !C.addProvider) return false;
    C.addProvider({ id: 'slop-apps', get title() { return tr('ui.spot.open_app'); }, search: (q) => matches(q).slice(0, 12).map((a) => ({
      id: 'app.open.' + a.id, title: nameOf(a), group: 'Apps', keywords: [], run: () => go(a),
    })) });
    return true;
  }
  function open() {
    if (registerWithCommands() && window.SlopCmd.run) { window.SlopCmd.run('cmd.palette'); return; }
    if (back.classList.contains('on')) return;
    back.classList.add('on');
    input.value = '';
    shown = apps.slice(0, 12); sel = 0; paint();
    input.focus();
  }
  function close() { back.classList.remove('on'); }
  /** Fills the marked words of a part (SlopI18n.apply does it on a switch; this does it when the part is made). */
  function words(el) {
    for (const n of [el, ...el.querySelectorAll('[data-i18n],[data-i18n-attr]')]) {
      if (n.hasAttribute('data-i18n')) n.textContent = tr(n.getAttribute('data-i18n'));
      for (const pair of (n.getAttribute('data-i18n-attr') || '').split(';')) { const c = pair.indexOf(':'); if (c > 0) n.setAttribute(pair.slice(0, c).trim(), tr(pair.slice(c + 1).trim())); }
    }
  }

  function build() {
    addStyle();
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'sps-pill';
    pill.setAttribute('data-i18n-attr', 'aria-label:switcher.all_apps');
    pill.innerHTML = '<span data-i18n="switcher.all_apps"></span><kbd>Ctrl K</kbd>';
    pill.addEventListener('click', () => open());
    const home = document.createElement('a');
    home.className = 'sps-pill';
    home.href = root;
    home.setAttribute('data-i18n', 'nav.home');
    const dock = document.createElement('div');
    dock.className = 'sps-dock';
    dock.append(home, pill);
    back = document.createElement('div');
    back.className = 'sps-back';
    back.innerHTML = '<div class="sps-box" role="dialog" data-i18n-attr="aria-label:switcher.all_apps"><input class="sps-in" type="search" data-i18n-attr="placeholder:ui.shell.find_app;aria-label:ui.shell.find_app" autocomplete="off"><ul class="sps-list" role="listbox"></ul></div>';
    input = back.querySelector('input');
    list = back.querySelector('.sps-list');
    input.addEventListener('input', () => { shown = matches(input.value).slice(0, 12); sel = 0; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); go(shown[sel]); }
      else if (e.key === 'Escape') { close(); }
    });
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); }); // touch-ok: a tap on the backdrop sends it too
    // A page whose header has the brand (Home) and the shell (Apps) does not need the corner pills: they would repeat them.
    const shell = !!(window.SlopShell || document.querySelector('script[src*="shell/shell.js"]'));
    const header = shell && !!document.querySelector('header a.brand, .smb-brand');
    // the marked words (data-i18n, data-i18n-attr) are filled now and again by SlopI18n.apply on a language switch
    for (const el of [dock, back]) words(el);
    document.body.append(...(header ? [] : [dock]), back);
    document.addEventListener('keydown', (e) => {
      if (!window.SlopCmd && (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
      else if (e.key === 'Escape' && back.classList.contains('on')) close();
    });
  }

  window.SlopSpotlight = { open, close };
  const start = () => { ensureData().then(() => { registerWithCommands(); build(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
