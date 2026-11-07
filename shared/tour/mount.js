/* SlopTour mount: the one script an app page loads (a script tag for …/shared/tour/mount.js with data-app="photoslop").
 * It adds a Tour button to the header, registers "Start tour: <name>" in the command palette and opens the
 * tour when the URL has ?tour=1 (the homepage links use that). The engine loads only when a tour starts.
 * On the homepage (data-home="1") it adds a Tours menu that links to each app's tour. Classic script. */
(function () {
  'use strict';
  const me = document.currentScript;
  if (!me || !me.src) return;
  /** A word from the shared tables (shell.* in shared/i18n/strings.js, ui.tour.* in shared/i18n/ui/<code>.js); the key
   *  itself without SlopI18n. Everything built once is marked (data-i18n) or rebuilt from SlopI18n.on, so it follows a switch. */
  const tr = (key, vars) => { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; };
  const BASE = new URL('./', me.src).href;
  const APP = me.dataset.app || '';
  const HOME = me.dataset.home === '1';
  const TOURS = [
    ['photoslop', 'PhotoSlop'], ['slopvector', 'SlopVector'], ['slopcut', 'Slop Cut'], ['remix', 'Reel Remix'],
    ['slopisolate', 'Slop Isolate'], ['drive', 'Slop Drive'], ['orders', 'Slop Orders'], ['invoices', 'Slop Invoices'],
    ['crm', 'Slop CRM'], ['calendar', 'Slop Calendar'], ['projects', 'Slop Projects'], ['todo', 'Slop To-do'], ['notes', 'Slop Notes'],
    ['paste', 'Slop Paste'], ['resize', 'Slop Resize'], ['upscale', 'Slop Upscale'], ['aitools', 'Slop AI Tools'],
    ['3d', 'Slop 3D'], ['img3d', 'Slop Image to 3D'], ['effects', 'Slop Effects'], ['docs', 'Slop Docs'],
    ['slides', 'Slop Slides'], ['tables', 'Slop Tables'], ['label', 'Slop Label'], ['gallery', 'Slop Gallery'],
    ['hex', 'Slop Hex'], ['code', 'Slop Code'], ['fontcreator', 'Slop Font'], ['scan', 'Slop Scan'],
  ];
  const NAME = Object.fromEntries(TOURS);
  let loading = null;

  function script(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('could not load ' + src));
      document.head.append(s);
    });
  }
  /** Load the engine (once): stylesheet, then core, spot, panel and engine in order. */
  function ensure() {
    if (window.SlopTour && window.SlopTour.start) return Promise.resolve(window.SlopTour);
    if (loading) return loading;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = BASE + 'tour.css';
    document.head.append(css);
    loading = (async () => {
      for (const f of ['core', 'spot', 'panel', 'engine']) await script(BASE + f + '.js');
      return window.SlopTour;
    })();
    return loading;
  }
  async function startTour(app) {
    try {
      const T = await ensure();
      await T.start(app);
    } catch (e) {
      console.warn('SlopTour: the tour did not start. ' + e.message);
    }
  }
  /** A header button. lk, tk: the label and title keys, marked for SlopI18n so a later language change retranslates them. */
  function button(lk, tk, vars, fn) {
    const b = document.createElement('button');
    // The shared header-button look (shared/ui/hbtn.css): a compass, and the label that gives way to it in a full header.
    b.type = 'button'; b.className = 'stour-btn slop-hbtn';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m15 9-2 4-4 2 2-4z"/></svg><span class="slop-hbtn-txt"></span>';
    b.lastChild.setAttribute('data-i18n', lk);
    b.setAttribute('data-i18n-attr', `title:${tk};aria-label:${tk}`);
    if (vars) b.setAttribute('data-i18n-vars', JSON.stringify(vars));
    b.lastChild.textContent = tr(lk);
    b.title = tr(tk, vars); b.setAttribute('aria-label', b.title);
    b.addEventListener('click', fn);
    return b;
  }
  function headerButton() {
    const host = document.querySelector('.top-actions') || document.querySelector('header.topbar') || document.querySelector('header') || document.querySelector('main') || document.body;
    if (host.querySelector('.stour-btn')) return;
    const b = button('shell.tour', 'shell.tour_title', { app: NAME[APP] }, () => startTour(APP));
    const slot = host.querySelector('.stour-slot');   // room kept for it in the page's own HTML, so nothing moves
    if (slot) slot.replaceWith(b); else if (host.matches('.top-actions, main, body')) host.prepend(b); else host.append(b);
  }
  /** Register "Start tour: <name>". Pages without the palette get its registry core (no key handling) to hold it. */
  function paletteCommand() {
    const reg = () => window.SlopCmd && SlopCmd.register && SlopCmd.register([{
      id: 'tour.start.' + APP, title: tr('ui.tour.start_cmd', { name: NAME[APP] }), group: 'Help',   // a group id (shared/commands/search.js shows it translated)
      keywords: ['tour', 'guide', 'walkthrough', 'learn', 'help'], run: () => startTour(APP),
    }]);
    if (window.SlopCmd) reg(); else script(BASE + '../commands/commands.js').then(reg, () => {});
    if (window.SlopI18n && SlopI18n.on) SlopI18n.on(reg);   // the title in the new language
  }
  /** The registry entry (window.SLOP_APPS) for a tour. Matched by path: the tour id can differ from the registry id (slopcut is slopedit). */
  function registryEntry(app) {
    const list = window.SLOP_APPS || [];
    return list.find((a) => a.path === app + '/') || list.find((a) => a.id === app) || null;
  }
  /** The app's Sloppo badge as an SVG-namespace <svg>, or null when the icon scripts are missing. */
  function badgeSvg(id) {
    const glyph = window.SLOP_ICONS && window.SLOP_ICONS[id];
    if (!glyph || !window.SLOP_ICON_BADGE) return null;
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 48 48'); s.setAttribute('class', 'stour-icon'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = window.SLOP_ICON_BADGE(glyph); // innerHTML on an SVG element parses in SVG context
    return s;
  }
  /** The homepage Tours menu: a modal dialog (showModal, so centred with a backdrop) with a search box and a card per tour. */
  function homeMenu() {
    const nav = document.querySelector('header.nav') || document.querySelector('header');
    if (!nav) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'stour-menu'; dlg.setAttribute('aria-labelledby', 'stour-menu-title');
    const head = document.createElement('div'); head.className = 'stour-menu-head';
    const h = document.createElement('h2'); h.id = 'stour-menu-title'; h.textContent = tr('ui.tour.guided'); h.dataset.i18n = 'ui.tour.guided';
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'stour-menu-x'; x.textContent = '×';
    x.setAttribute('aria-label', tr('ui.tour.close_list')); x.dataset.i18nAttr = 'aria-label:ui.tour.close_list'; x.addEventListener('click', () => dlg.close());
    head.append(h, x);
    const lede = document.createElement('p'); lede.className = 'stour-menu-lede';
    lede.textContent = tr('ui.tour.lede'); lede.dataset.i18n = 'ui.tour.lede';
    const search = document.createElement('input');
    search.type = 'search'; search.className = 'stour-search'; search.placeholder = tr('ui.tour.search');
    search.setAttribute('aria-label', search.placeholder); search.dataset.i18nAttr = 'placeholder:ui.tour.search;aria-label:ui.tour.search'; search.autocomplete = 'off';
    const ul = document.createElement('ul'); ul.className = 'stour-grid';
    const items = TOURS.map(([app, fallback]) => {
      const entry = registryEntry(app);
      const name = entry ? entry.name : fallback;
      const li = document.createElement('li'); li.dataset.app = app;
      const a = document.createElement('a'); a.className = 'stour-card'; a.href = app + '/?tour=1';
      const icon = entry && badgeSvg(entry.id);
      if (icon) a.append(icon);
      const text = document.createElement('span'); text.className = 'stour-card-text';
      const strong = document.createElement('strong'); strong.textContent = name;
      text.append(strong);
      if (entry && entry.tagline) {
        const desc = document.createElement('span'); desc.className = 'stour-card-desc'; desc.textContent = entry.tagline;
        text.append(desc);
      }
      a.append(text); li.append(a); ul.append(li);
      return { li, key: name.toLowerCase() };
    });
    const empty = document.createElement('p'); empty.className = 'stour-empty'; empty.hidden = true;
    empty.textContent = tr('ui.tour.no_match'); empty.dataset.i18n = 'ui.tour.no_match';
    const filter = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const it of items) { const on = !q || it.key.includes(q); it.li.hidden = !on; if (on) shown++; }
      empty.hidden = shown > 0;
    };
    search.addEventListener('input', filter);
    dlg.append(head, lede, search, ul, empty);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    let opener = null;
    const tours = button('shell.tours', 'shell.tours_title', null, () => {
      opener = tours; search.value = ''; filter();
      dlg.showModal();
    });
    tours.setAttribute('aria-haspopup', 'dialog');
    dlg.addEventListener('close', () => { if (opener) opener.focus(); opener = null; });
    document.body.append(dlg);
    const slot = nav.querySelector('.stour-slot');   // room kept for it in the page's own HTML, so nothing moves
    if (slot) slot.replaceWith(tours); else nav.append(tours);
  }
  function init() {
    if (HOME) { homeMenu(); return; }
    if (!APP || !NAME[APP]) return;
    headerButton();
    paletteCommand();
    const params = new URLSearchParams(location.search);
    if (params.get('tour') === '1') {
      history.replaceState(null, '', location.pathname + location.hash);
      startTour(APP);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
