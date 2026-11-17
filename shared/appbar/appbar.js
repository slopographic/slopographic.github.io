/* Slop app header: the title bar every app mounts. Classic script; exposes window.SlopAppBar.
 *   SlopAppBar.mount(hostEl, { title, subtitle?, home?, icon?, actions?, menu? }) → { setTitle, setSubtitle, setActions, setMenu, setDirty, destroy }
 *   home     the site root ('../'): the bar leads with the home link (header a.brand), which brand/brand.js draws as the
 *            app's icon with the Slopographic badge, as in every app header. Optional.
 *   icon     a SLOP_ICONS key (shared/app-icons.js). Draws the app badge with SLOP_ICON_BADGE. Optional.
 *   actions  [{ id, label, icon?, primary?, onClick, disabled? }]. Shown as buttons. A narrow host moves them into the ⋯ menu.
 *   menu     [{ id, label, icon?, onClick, disabled? } | { separator: true }]. Always listed in the ⋯ menu.
 *   icon (action) one of the ICONS names below, or none for a label-only button.
 * A host 600 px wide or less collapses the actions into the menu (ResizeObserver). The dirty dot shows unsaved changes.
 * Keyboard: Tab reaches every control. The ⋯ button (Enter, Space or ArrowDown) opens the menu; ArrowUp and ArrowDown
 * move in it, Home and End jump, Escape or Tab closes it, and focus goes back to the ⋯ button.
 * Colours come only from the --sl-* tokens that shared/theme/theme.js sets on every page. */
(function (g) {
  'use strict';
  if (g.SlopAppBar) return;
  const NARROW = 600;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /** Action glyphs on a 24 grid. Stroked, except the ⋯ dots, which are filled. */
  const ICONS = {
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    open: '<path d="M3 7h6l2 2h10v10H3z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    print: '<path d="M7 9V4h10v5M6 9h12v7H6zM8 16h8v4H8z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    more: '<circle cx="6" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  };

  /** A word from the shared tables (shared/i18n/ui), the key without SlopI18n. */
  const tx = (key) => (g.SlopI18n ? g.SlopI18n.t(key) : key);
  /** Attributes that read a word, marked for SlopI18n so a language change re-applies them: { attr: key } → attrs. */
  function words(map) {
    const out = { 'data-i18n-attr': Object.keys(map).map((a) => a + ':' + map[a]).join(';') };
    for (const a in map) out[a] = tx(map[a]);
    return out;
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  /** An inline icon from ICONS, or null when the name is unknown. */
  function icon(name) {
    if (!ICONS[name]) return null;
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', 'sab-ic');
    s.innerHTML = ICONS[name];
    return s;
  }
  /** The app badge: SLOP_ICON_BADGE over the app's glyph. Null when the app has no glyph or app-icons.js did not load. */
  function badge(key) {
    const glyph = g.SLOP_ICONS && key ? g.SLOP_ICONS[key] : null;
    if (!glyph || !g.SLOP_ICON_BADGE) return null;
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 48 48');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = g.SLOP_ICON_BADGE(glyph);
    return s;
  }

  /** Builds the header in hostEl and returns its controls. Calling mount again on the same host replaces the old bar. */
  function mount(host, opts = {}) {
    if (!host) throw new Error('SlopAppBar.mount needs a host element');
    const st = { actions: [], menu: [], dirty: false, narrow: false, open: false };
    const brandBadge = el('span', { class: 'sab-badge' }, badge(opts.icon));
    if (!brandBadge.firstChild) brandBadge.hidden = true;
    const name = el('span', { class: 'sab-name' }, opts.title || '');
    const dot = el('span', { class: 'sab-dirty', role: 'img', ...words({ 'aria-label': 'ui.appbar.unsaved', title: 'ui.appbar.unsaved' }), hidden: true });
    const sub = el('p', { class: 'sab-sub' }, opts.subtitle || '');
    sub.hidden = !opts.subtitle;
    const acts = el('div', { class: 'sab-actions', role: 'group', ...words({ 'aria-label': 'ui.appbar.actions' }) });
    const moreBtn = el('button', { type: 'button', class: 'sab-btn sab-more-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', ...words({ 'aria-label': 'ui.appbar.more', title: 'ui.appbar.more' }) }, icon('more'));
    const menuEl = el('div', { class: 'sab-menu', role: 'menu', ...words({ 'aria-label': 'ui.appbar.more' }), hidden: true });
    const more = el('div', { class: 'sab-more' }, moreBtn, menuEl);
    const home = opts.home ? el('a', { class: 'brand', href: opts.home, ...words({ title: 'ui.mb.home', 'aria-label': 'ui.mb.home' }) }) : null;
    const root = el('header', { class: 'sab', 'data-narrow': 'false' },
      el('div', { class: 'sab-brand' }, home, brandBadge, el('div', { class: 'sab-titles' }, el('h1', { class: 'sab-title' }, name, dot), sub)),
      acts, more);

    function run(a) { closeMenu(false); if (!a.disabled && typeof a.onClick === 'function') a.onClick(); }
    function actionButton(a) {
      const b = el('button', { type: 'button', class: 'sab-btn' + (a.primary ? ' sab-primary' : ''), 'data-id': a.id, 'aria-label': a.label, title: a.label, disabled: !!a.disabled }, icon(a.icon), el('span', { class: 'sab-label' }, a.label));
      b.addEventListener('click', () => run(a));
      return b;
    }
    function menuItem(i) {
      if (i.separator) return el('div', { class: 'sab-sep', role: 'separator' });
      const b = el('button', { type: 'button', class: 'sab-item', role: 'menuitem', 'data-id': i.id, tabindex: '-1', disabled: !!i.disabled }, icon(i.icon), el('span', null, i.label));
      b.addEventListener('click', () => run(i));
      return b;
    }
    function renderActions() { acts.replaceChildren(...st.actions.map(actionButton)); }
    /** The ⋯ menu: every action when narrow, then the menu entries. Hidden when there is nothing to list. */
    function renderMenu() {
      const items = st.narrow ? st.actions.slice() : [];
      if (items.length && st.menu.length) items.push({ separator: true });
      items.push(...st.menu);
      menuEl.replaceChildren(...items.map(menuItem));
      const any = items.some((i) => !i.separator);
      more.hidden = !any;
      if (!any) closeMenu(false);
    }
    const menuButtons = () => [...menuEl.querySelectorAll('.sab-item:not([disabled])')];
    function openMenu(first) {
      if (!menuButtons().length) return;
      menuEl.hidden = false; st.open = true;
      moreBtn.setAttribute('aria-expanded', 'true');
      const list = menuButtons();
      (first === 'last' ? list[list.length - 1] : list[0]).focus();
    }
    function closeMenu(returnFocus) {
      if (!st.open) return;
      st.open = false; menuEl.hidden = true;
      moreBtn.setAttribute('aria-expanded', 'false');
      if (returnFocus) moreBtn.focus();
    }
    moreBtn.addEventListener('click', () => (st.open ? closeMenu(true) : openMenu()));
    moreBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); openMenu(); } });
    menuEl.addEventListener('keydown', (e) => {
      const list = menuButtons(), i = list.indexOf(document.activeElement), n = list.length;
      const go = (k) => { e.preventDefault(); list[k].focus(); };
      if (e.key === 'ArrowDown') go((i + 1 + n) % n);
      else if (e.key === 'ArrowUp') go((i - 1 + n) % n);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(n - 1);
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(false);
    });
    const outside = (e) => { if (st.open && !more.contains(e.target)) closeMenu(false); };
    document.addEventListener('pointerdown', outside);

    function setNarrow(n) {
      if (n === st.narrow && root.dataset.narrow === String(n)) return;
      st.narrow = n; root.dataset.narrow = String(n);
      renderMenu();
    }
    const ro = g.ResizeObserver ? new ResizeObserver(() => setNarrow(host.clientWidth <= NARROW)) : null;
    if (ro) ro.observe(host);

    host.replaceChildren(root);
    host.classList.add('sab-host');
    st.actions = (opts.actions || []).slice();
    st.menu = (opts.menu || []).slice();
    renderActions();
    setNarrow(host.clientWidth > 0 && host.clientWidth <= NARROW);
    renderMenu();

    return {
      element: root,
      setTitle(t) { name.textContent = t || ''; },
      setSubtitle(t) { sub.textContent = t || ''; sub.hidden = !t; },
      setActions(list) { st.actions = (list || []).slice(); renderActions(); renderMenu(); },
      setMenu(list) { st.menu = (list || []).slice(); renderMenu(); },
      setDirty(b) { st.dirty = !!b; dot.hidden = !st.dirty; },
      destroy() {
        if (ro) ro.disconnect();
        document.removeEventListener('pointerdown', outside);
        host.replaceChildren();
        host.classList.remove('sab-host');
      },
    };
  }

  g.SlopAppBar = Object.freeze({ mount, ICONS: Object.keys(ICONS), NARROW });
})(typeof window !== 'undefined' ? window : globalThis);
