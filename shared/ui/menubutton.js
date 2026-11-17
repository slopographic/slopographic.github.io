/* SlopMenuButton: a button that opens a menu of choices beside it (a "menu button"), for any app. Each choice can carry
 * an icon node (a format tile, say), choices can sit under group headings, and the chosen one is marked. Unlike
 * SlopUI.menu (a context menu opened at the pointer), this menu belongs to its button: it opens under it (above when
 * there is no room), the button says whether it is open (aria-expanded), and focus goes back to the button on close.
 *
 *   const mb = SlopMenuButton.attach(button, {
 *     label: 'Convert photo.png to',                       // the menu's accessible name
 *     items: () => [{ heading: 'Images' }, { value: 'to-jpg', label: 'To JPG', icon: node, checked: true, tag: 'beta' }, ...],
 *     empty: 'Nothing to choose',                           // shown when items() is empty
 *     onPick: (value) => { ... },
 *     search: 'auto',                                      // a search box at the top: true, false, or 'auto' (6+ choices)
 *     anchor: () => element,                               // optional: open under this one instead (a More it is folded into)
 *   });
 *   mb.open(); mb.close(); mb.isOpen(); mb.destroy();
 *
 * Keys: Enter, Space or ArrowDown on the button open it on the chosen row (ArrowUp on the last). In the menu: the arrows,
 * Home and End move, a letter jumps to the next row that starts with it, Enter or Space picks, Escape and Tab close.
 * With a search box (items may carry `keywords`), the menu opens with the cursor in it: typing filters the rows by
 * label, value and keywords (groups with no match hide), ArrowDown goes to the first row, Enter picks the first match,
 * and a letter typed on a row goes back to the box.
 * A click outside closes it. Classic script; also works as a side-effect ES-module import. Injects its styles once;
 * colours come from the page-wide theme tokens (see T below). */
(function (g) {
  'use strict';
  if (g.SlopMenuButton) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /* Colours: the menu sits in <body>, outside the app's own themed boxes, so it reads only page-wide tokens: SlopUI's --s-*
   * (shared/slopui.css sets them on .smb-menu from the app's --sui-* map, as for its own menus), else the theme's --sl-*
   * (shared/theme/theme.js), else the system colours. Never an app's own --ink or --muted, which mean a background in some
   * apps (--ink is the near-black page colour in Slop PDF): that put dark text on the dark menu. --smb-* overrides all. */
  const T = {
    bg: 'var(--smb-bg, var(--s-bg2, var(--sl-surface, Canvas)))', fg: 'var(--smb-fg, var(--s-fg, var(--sl-text, CanvasText)))',
    line: 'var(--smb-line, var(--s-line, var(--sl-border, GrayText)))',
    dim: 'var(--smb-dim, var(--s-dim, color-mix(in srgb, var(--sl-text, CanvasText) 72%, transparent)))',
    accent: 'var(--smb-accent, var(--s-accent, var(--sl-accent, Highlight)))', focus: 'var(--smb-focus, var(--s-ring, var(--sl-accent, Highlight)))',
  };
  const CSS = `
.smb-menu[role="menu"] { position: fixed; z-index: 2000; min-inline-size: 220px; max-inline-size: calc(100vw - 16px); max-block-size: min(60vh, 420px); overflow-y: auto;
  padding: 6px; margin: 0; box-sizing: border-box; background: ${T.bg}; color: ${T.fg};
  border: 1px solid ${T.line}; border-radius: 10px; box-shadow: 0 12px 36px rgba(0, 0, 0, .35); font: inherit; font-size: 14px; }
.smb-group + .smb-group { margin-block-start: 4px; padding-block-start: 4px; border-block-start: 1px solid ${T.line}; }
.smb-h { margin: 0; padding-block: 4px 2px; padding-inline: 8px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${T.dim}; }
.smb-row { display: flex; align-items: center; gap: 10px; inline-size: 100%; min-block-size: 40px; padding-block: 4px; padding-inline: 6px 10px; border: 0; border-radius: 6px;
  background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.smb-row:hover:not([disabled]) { background: color-mix(in srgb, ${T.fg} 10%, transparent); }
.smb-row:focus-visible { outline: 2px solid ${T.focus}; outline-offset: -2px; }
.smb-row[aria-checked="true"] { font-weight: 600; background: color-mix(in srgb, ${T.accent} 12%, transparent); }
.smb-row[disabled] { color: ${T.dim}; cursor: default; opacity: 1; }
.smb-lbl { flex: 1 1 auto; min-inline-size: 0; }
.smb-chk { flex: none; inline-size: 1.2em; text-align: center; color: ${T.fg}; }
.smb-icon { flex: none; display: inline-flex; }
.smb-tag { flex: none; padding-block: 1px; padding-inline: 6px; border: 1px solid ${T.line}; border-radius: 999px; font-size: 11px; color: ${T.fg}; }
.smb-empty { margin: 0; padding: 8px 10px; color: ${T.dim}; }
.smb-search { position: sticky; inset-block-start: -6px; z-index: 1; display: block; inline-size: 100%; box-sizing: border-box; margin-block-end: 6px; padding: 8px 10px;
  border: 1px solid ${T.line}; border-radius: 6px; background: ${T.bg}; color: inherit; font: inherit; }
.smb-search::placeholder { color: ${T.dim}; opacity: 1; }
.smb-search:focus-visible { outline: 2px solid ${T.focus}; outline-offset: -1px; }
.smb-row[hidden], .smb-group[hidden], .smb-empty[hidden] { display: none; }
@media (max-width: 480px) { .smb-menu[role="menu"] { min-inline-size: min(280px, calc(100vw - 16px)); } }`;
  let openOne = null;   // the one open menu on the page: { close }
  let uid = 0;

  function style(doc) {
    if (doc.getElementById('smb-style')) return;
    const s = doc.createElement('style');
    s.id = 'smb-style';
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function attach(button, opts) {
    const doc = button.ownerDocument, win = doc.defaultView;
    style(doc);
    const o = opts || {};
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    let menu = null, typed = '', typedAt = 0;

    const rows = () => (menu ? [...menu.querySelectorAll('.smb-row:not([disabled]):not([hidden])')] : []);
    let search = null;
    function build() {
      const m = doc.createElement('div');
      m.className = 'smb-menu';
      m.setAttribute('role', 'menu');
      m.id = 'smb-' + (++uid);
      if (o.label) m.setAttribute('aria-label', o.label);
      const list = (typeof o.items === 'function' ? o.items() : o.items) || [];
      const count = list.filter((it) => it && it.heading === undefined).length;
      search = (o.search === true || ((o.search === undefined || o.search === 'auto') && count >= 6)) ? searchBox(m) : null;
      let group = null;
      const newGroup = (heading) => {
        group = doc.createElement('div');
        group.className = 'smb-group';
        group.setAttribute('role', 'group');
        if (heading) {
          const hd = doc.createElement('p');
          hd.className = 'smb-h';
          hd.id = m.id + '-g' + m.children.length;
          hd.setAttribute('role', 'presentation');
          hd.textContent = heading;
          group.setAttribute('aria-labelledby', hd.id);
          group.append(hd);
        }
        m.append(group);
      };
      for (const it of list) {
        if (!it) continue;
        if (it.heading !== undefined) { newGroup(it.heading); continue; }
        if (!group) newGroup('');
        const r = doc.createElement('button');
        r.type = 'button';
        r.className = 'smb-row';
        r.tabIndex = -1;
        r.setAttribute('role', 'menuitemradio');
        r.setAttribute('aria-checked', String(!!it.checked));
        r.dataset.value = it.value;
        r.dataset.find = [it.label, it.value, ...(it.keywords || [])].join(' ').toLowerCase();
        if (it.disabled) r.disabled = true;
        const chk = doc.createElement('span'); chk.className = 'smb-chk'; chk.setAttribute('aria-hidden', 'true'); chk.textContent = it.checked ? '✓' : '';
        const lbl = doc.createElement('span'); lbl.className = 'smb-lbl'; lbl.textContent = it.label;
        r.append(chk);
        if (it.icon) { const ic = doc.createElement('span'); ic.className = 'smb-icon'; ic.setAttribute('aria-hidden', 'true'); ic.append(it.icon); r.append(ic); }
        r.append(lbl);
        if (it.tag) { const tg = doc.createElement('span'); tg.className = 'smb-tag'; tg.textContent = it.tag; r.append(tg); }
        r.addEventListener('click', () => { if (r.disabled) return; close(true); if (o.onPick) o.onPick(it.value); });
        group.append(r);
      }
      if (!count) {
        const p = doc.createElement('p'); p.className = 'smb-empty'; p.textContent = o.empty || tr('ui.mb.nothing', 'Nothing to choose'); m.append(p);
      } else if (search) {
        const p = doc.createElement('p'); p.className = 'smb-empty smb-nomatch'; p.textContent = tr('ui.mb.no_match', 'No match'); p.hidden = true; m.append(p);
      }
      m.addEventListener('keydown', onMenuKey);
      return m;
    }
    /** The search box: filters the rows as you type; ArrowDown goes into the list, Enter picks the first match. */
    function searchBox(m) {
      const inp = doc.createElement('input');
      inp.type = 'search'; inp.className = 'smb-search'; inp.placeholder = tr('ui.search', 'Search');
      inp.setAttribute('aria-label', tr('ui.mb.search_aria', 'Search {what}', { what: o.label || tr('ui.mb.choices', 'choices') }));
      inp.setAttribute('autocomplete', 'off');
      inp.addEventListener('input', () => filter(inp.value));
      inp.addEventListener('keydown', (e) => {
        const all = rows();
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); if (all[0]) all[0].focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (all[0]) all[0].click(); }
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close(true); }
        else e.stopPropagation();   // letters are for the box, not the menu's type-ahead
      });
      m.append(inp);
      return inp;
    }
    function filter(text) {
      const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
      for (const r of menu.querySelectorAll('.smb-row')) r.hidden = !words.every((w) => r.dataset.find.includes(w));
      for (const gp of menu.querySelectorAll('.smb-group')) gp.hidden = !gp.querySelector('.smb-row:not([hidden])');
      const none = menu.querySelector('.smb-nomatch');
      if (none) none.hidden = !!menu.querySelector('.smb-row:not([hidden])');
    }
    function place() {
      if (!menu) return;
      const b = (o.anchor && o.anchor() || button).getBoundingClientRect(), vw = win.innerWidth, vh = win.innerHeight;
      const w = menu.offsetWidth, hgt = menu.offsetHeight;
      const rtl = win.getComputedStyle(button).direction === 'rtl';
      let x = rtl ? b.right - w : b.left;
      x = Math.max(8, Math.min(x, vw - w - 8));
      let y = b.bottom + 4;
      if (y + hgt > vh - 8 && b.top - hgt - 4 >= 8) y = b.top - hgt - 4;
      menu.style.left = Math.round(x) + 'px';
      menu.style.top = Math.round(Math.max(8, y)) + 'px';
    }
    function open(where) {
      if (openOne) openOne.close(false);
      menu = build();
      doc.body.append(menu);
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-controls', menu.id);
      place();
      openOne = api;
      doc.addEventListener('pointerdown', onOutside, true);
      win.addEventListener('resize', onResize);
      win.addEventListener('scroll', place, true);
      const all = rows();
      if (search && where !== 'last') { search.focus({ preventScroll: true }); return; }
      const target = where === 'last' ? all[all.length - 1] : menu.querySelector('.smb-row[aria-checked="true"]:not([disabled])') || all[0];
      if (target) target.focus({ preventScroll: true });
      else { menu.tabIndex = -1; menu.focus({ preventScroll: true }); }
    }
    function close(refocus) {
      if (!menu) return;
      menu.remove();
      menu = null;
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-controls');
      if (openOne === api) openOne = null;
      doc.removeEventListener('pointerdown', onOutside, true);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('scroll', place, true);
      if (refocus !== false && button.isConnected) button.focus({ preventScroll: true });
    }
    function onOutside(e) { if (menu && !menu.contains(e.target) && !button.contains(e.target)) close(false); }
    function onResize() { close(false); }
    function onMenuKey(e) {
      const all = rows(), i = all.indexOf(doc.activeElement);
      const go = (n) => { e.preventDefault(); if (all.length) all[(n + all.length) % all.length].focus(); };
      if (e.key === 'ArrowDown') go(i + 1);
      else if (e.key === 'ArrowUp') { if (search && i === 0) { e.preventDefault(); search.focus(); } else go(i < 0 ? all.length - 1 : i - 1); }
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(all.length - 1);
      else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); all[i].click(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (search && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); search.focus(); search.value += e.key; filter(search.value);   // typing goes back to the box
      }
      else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        typed = now - typedAt < 700 ? typed + e.key.toLowerCase() : e.key.toLowerCase();
        typedAt = now;
        const start = typed.length > 1 ? i : i + 1;
        for (let k = 0; k < all.length; k++) {
          const r = all[(start + k + all.length) % all.length];
          if (r.querySelector('.smb-lbl').textContent.toLowerCase().startsWith(typed)) { e.preventDefault(); r.focus(); break; }
        }
      }
    }
    const onClick = () => { if (menu) close(true); else open(); };
    const onKey = (e) => {
      // Enter and Space reach onClick as the button's own click; the arrows open it too.
      if (e.key === 'ArrowDown' && !menu) { e.preventDefault(); open(); }
      else if (e.key === 'ArrowUp' && !menu) { e.preventDefault(); open('last'); }
    };
    button.addEventListener('click', onClick);
    button.addEventListener('keydown', onKey);
    const api = {
      open, close: (refocus) => close(refocus), isOpen: () => !!menu, get menu() { return menu; },
      destroy() { close(false); button.removeEventListener('click', onClick); button.removeEventListener('keydown', onKey); },
    };
    return api;
  }

  g.SlopMenuButton = { attach, close: () => { if (openOne) openOne.close(false); } };
})(typeof window !== 'undefined' ? window : globalThis);
