/* SlopFramePanel: the content of a SlopFrame side panel (shared/frame/frame.js), the same in every app: a title, then
 * sections with a small heading, each holding key/value rows, a list of files with their own buttons, action buttons,
 * a note, or the app's own element. render() redraws the sections and keeps the keyboard focus on the same button.
 *   const p = SlopFramePanel.create(panelEl, { title: 'Message' });    // also SlopFrame.panel(panelEl, opts)
 *   p.render([{ title: 'Details', rows: [['From', 'Ann']] }, { title: 'Actions', actions: [{ label: 'Export', menu: [...] }] }]);
 *   p.setTitle(text)
 *   p.footer([{ label: 'Upscale', primary: true, run }], { note: 'Ctrl+Enter', more: 'Settings' })
 * Tool apps (resize, upscale, ocr…) put their settings and their main button here, the rule for every tool app
 * (shared/frame/HANDOFF.md): settings groups as { title, settings: element | [elements] } sections (the app's own form
 * controls, styled by .sf-field / .sf-lab / .sf-seg in frame.css), and the main button in footer(): a bar stuck to the
 * panel's bottom edge, so it is in reach however long the settings are. On a phone the closed sheet still shows the
 * footer at the bottom of the screen (the primary button is never hidden); its "more" button opens the whole sheet.
 * With { stack: true } the primary button takes the whole first row and the others wrap below it (more than two
 * actions, as in Slop Watermark: Watermark N files, Download, Save to Slop Drive, Open in…).
 * footer() redraws only the footer (call it on every state change; the settings are not touched). footer([]) removes it.
 * Big editors keep their own panel and take only the footer: create(theirPanel, { bare: true }).footer([...], { more,
 * onMore: () => theirSheet.open() }) (the panel needs SlopSheet on phones for the closed sheet to show the footer).
 * An action may be { el: existingButton, ...fields }: the page's own button moves in (a menu bar, a tour or a test that
 * looks the id up in the HTML still finds it); label, disabled, hidden, title and run, when given, update it.
 * Section and action shapes: see frame.js. A menu opens under its button with shared/ui/menubutton.js (SlopMenuButton);
 * items are { label, act, disabled?, keywords? } or { heading }. Classic script; styles in frame.css. */
(function (g) {
  'use strict';
  if (g.SlopFramePanel) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  const doc = g.document;
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // A footer in the bottom of the window (a phone's sheet footer, at the edge or above an app's own bottom rail) is published
  // as --slop-foot-h on the page's root: the room from its top edge to the window's bottom, so cards in the bottom corner
  // (the consent card, shared/consent/banner.css) sit above it.
  const foots = new Set();
  function lift() {
    let h = 0;
    const vh = g.innerHeight;
    foots.forEach((f) => {
      if (!f.isConnected) { foots.delete(f); return; }
      const r = f.getBoundingClientRect();
      if (r.height && r.top < vh && r.bottom > vh * 0.75) h = Math.max(h, vh - r.top);
    });
    const v = Math.ceil(h) + 'px', root = doc.documentElement;
    if (root.style.getPropertyValue('--slop-foot-h') === v) return;
    root.style.setProperty('--slop-foot-h', v);
    g.dispatchEvent(new g.CustomEvent('slop-foot'));   // the buddy's button (shared/buddy/boot.js) moves up too
  }
  g.addEventListener('resize', lift);

  /** One button for an action. With a menu it is "Label ▾" and opens the menu under it. */
  function button(a, key) {
    if (a.el) {   // a button that is already in the page's markup (its id and listeners stay); the other fields update it
      const b = a.el;
      b.classList.add('sf-btn');
      b.dataset.sfKey = key;
      if (a.label != null) b.textContent = a.label;
      if ('disabled' in a) b.disabled = !!a.disabled;
      if ('hidden' in a) b.hidden = !!a.hidden;
      if (a.title) b.title = a.title;
      if (a.primary) b.classList.add('sui-primary');
      if (a.run) { b.sfRun = a.run; if (!b.sfWired) { b.sfWired = true; b.addEventListener('click', () => b.sfRun()); } }
      return b;
    }
    const b = el('button', 'sui-btn sf-btn' + (a.primary ? ' sui-primary' : '') + (a.menu ? ' sf-menu-btn' : ''));
    b.type = 'button';
    b.dataset.sfKey = key;
    if (a.id) b.id = a.id;
    b.disabled = !!a.disabled;
    if (a.title) b.title = a.title;
    if (a.aria) b.setAttribute('aria-label', a.aria);
    b.append(el('span', 'sf-btn-txt', a.label));
    if (a.menu) {
      b.append(el('span', 'sf-caret', '▾'));
      b.setAttribute('aria-haspopup', 'menu');
      let shown = [];
      const items = () => {
        const src = typeof a.menu === 'function' ? a.menu() : a.menu;
        shown = (src || []).filter(Boolean);
        return shown.map((it, i) => (it.heading ? { heading: it.heading } : { value: String(i), label: it.label, disabled: !!it.disabled, keywords: it.keywords }));
      };
      if (g.SlopMenuButton) {
        g.SlopMenuButton.attach(b, { label: a.label, items, empty: a.empty || tr('ui.nothing_here', 'Nothing here'), onPick: (v) => { const it = shown[Number(v)]; if (it && it.act) it.act(); } });
      } else {
        b.addEventListener('click', () => { const r = b.getBoundingClientRect(); items(); if (g.SlopUI) g.SlopUI.menu(shown.filter((it) => !it.heading), r.left, r.bottom + 4); });
      }
    } else if (a.run) {
      b.addEventListener('click', () => a.run());
    }
    return b;
  }

  function rows(list) {
    const dl = el('dl', 'sf-rows');
    for (const r of list) {
      if (!r || r[1] == null || r[1] === '') continue;
      const row = el('div', 'sf-row'), dd = el('dd', 'sf-val', String(r[1]));
      if (r[2]) dd.title = r[2];
      row.append(el('dt', 'sf-key', r[0]), dd);
      dl.append(row);
    }
    return dl;
  }

  function items(list, skey) {
    const ul = el('ul', 'sf-items');
    list.forEach((it, i) => {
      const li = el('li', 'sf-item');
      const main = el(it.open ? 'button' : 'div', 'sf-item-main');
      if (it.open) { main.type = 'button'; main.dataset.sfKey = skey + '/' + i + '/open'; main.title = it.title || it.name; main.addEventListener('click', () => it.open()); }
      main.append(el('span', 'sf-item-name', it.name));
      if (it.meta) main.append(el('span', 'sf-item-meta', it.meta));
      li.append(main);
      if (it.actions && it.actions.length) {
        const bar = el('div', 'sf-item-acts');
        it.actions.forEach((a, k) => bar.append(button(a, skey + '/' + i + '/' + k)));
        li.append(bar);
      }
      ul.append(li);
    });
    return ul;
  }

  function create(panel, o) {
    o = o || {};
    const head = el('div', 'sf-p-title'), h = el('h2', 'sf-p-h', o.title || '');
    head.append(h);
    const body = el('div', 'sf-p-body');
    if (!o.bare) panel.append(head, body);   // bare: an editor's own panel that only takes the footer

    function render(sections) {
      const focused = doc.activeElement && panel.contains(doc.activeElement) ? doc.activeElement.dataset.sfKey : null;
      // a settings control in use (the app's own element, moved by the redraw) keeps the focus and the caret
      const act = !focused && body.contains(doc.activeElement) ? doc.activeElement : null;
      let caret = null;
      try { if (act && typeof act.selectionStart === 'number') caret = [act.selectionStart, act.selectionEnd]; } catch (e) { /* number inputs */ }
      body.replaceChildren();
      (sections || []).filter(Boolean).forEach((s, si) => {
        const sec = el('section', 'sf-sec' + (s.cls ? ' ' + s.cls : ''));
        const skey = s.key || s.title || String(si);
        if (s.title) sec.append(el('h3', 'sf-h', s.title));
        if (s.note) sec.append(el('p', 'sf-note', s.note));
        if (s.rows) sec.append(rows(s.rows));
        if (s.list) sec.append(s.list.length ? items(s.list, skey) : el('p', 'sf-note', s.empty || tr('ui.none_dot', 'None.')));
        if (s.settings) {   // the settings first, then the section's buttons
          const set = el('div', 'sf-set');
          set.append(...[].concat(s.settings).filter(Boolean));
          sec.append(set);
        }
        if (s.actions) {
          const bar = el('div', 'sf-acts');
          s.actions.filter(Boolean).forEach((a, k) => bar.append(button(a, skey + '/a/' + (a.id || k))));
          sec.append(bar);
        }
        if (s.body) sec.append(s.body);
        body.append(sec);
      });
      if (act && act.isConnected && doc.activeElement !== act) {
        act.focus({ preventScroll: true });
        if (caret) try { act.setSelectionRange(caret[0], caret[1]); } catch (e) { /* not a text field */ }
      }
      if (focused) {
        const again = body.querySelector('[data-sf-key="' + focused.replace(/["\\]/g, '\\$&') + '"]');
        if (again && !again.disabled) again.focus({ preventScroll: true });
      }
    }

    // The footer: the main button(s), stuck to the panel's bottom; its height is kept in --sf-foot-h on the frame's root
    // (frame.css lifts the page above it on phones, where the closed sheet shows only the footer).
    const foot = el('div', 'sf-p-foot');
    const host = () => panel.closest('.sf-root') || doc.documentElement;
    const ro = g.ResizeObserver ? new g.ResizeObserver(() => { const r = host(); if (r) r.style.setProperty('--sf-foot-h', foot.offsetHeight + 'px'); lift(); }) : null;
    foots.add(foot);
    function footer(actions, fo) {
      fo = fo || {};
      const list = (actions || []).filter(Boolean);
      const focused = doc.activeElement && foot.contains(doc.activeElement) ? doc.activeElement.dataset.sfKey : null;
      foot.replaceChildren();
      const had = panel.classList.contains('sf-has-foot');
      panel.classList.toggle('sf-has-foot', list.length > 0);
      if (had !== list.length > 0) panel.dispatchEvent(new g.CustomEvent('sf-foot'));
      if (!list.length) { foot.remove(); lift(); return; }
      const bar = el('div', 'sf-foot-acts' + (fo.stack ? ' sf-foot-stack' : ''));
      list.forEach((a, k) => bar.append(button(a, 'foot/' + (a.id || k))));
      if (fo.more) {
        const m = button({ label: fo.more, run: fo.onMore || (() => panel.dispatchEvent(new g.CustomEvent('sf-sheet', { bubbles: true }))) }, 'foot/more');
        m.classList.add('sf-foot-more');
        m.setAttribute('aria-haspopup', 'dialog');
        bar.prepend(m);
      }
      foot.append(bar);
      if (fo.note) foot.append(el('p', 'sf-foot-note', fo.note));
      if (foot.parentNode !== panel || panel.lastChild !== foot) panel.append(foot);
      if (ro) { ro.observe(foot); ro.observe(panel); }   // the panel too: a footer that moves without resizing (the page got shorter)
      if (focused) { const again = foot.querySelector('[data-sf-key="' + focused.replace(/["\\]/g, '\\$&') + '"]'); if (again && !again.disabled) again.focus({ preventScroll: true }); }
    }
    return { render, footer, setTitle: (t) => { h.textContent = t; }, element: body, title: head, foot };
  }

  g.SlopFramePanel = { create };
})(window);
