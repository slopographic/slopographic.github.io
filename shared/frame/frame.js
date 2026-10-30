/* SlopFrame: the suite's "List · View · Panel" layout, for every app that shows items one at a time (mail, files, records):
 * an optional list on the left, the item in the centre, and a panel of details and actions on the right. One look and one
 * behaviour everywhere (see shared/frame/HANDOFF.md):
 *   - wide screens: three columns; the panel's width is dragged on its edge (or the arrow keys on the edge) and remembered;
 *     the panel can be hidden and shown (a header button, the View command, Ctrl+Alt+B), and that choice is remembered;
 *   - phones: the list is the main view and an item opens over it (back returns to the list); the panel is a bottom sheet
 *     (shared/ui/sheet.js, SlopSheet) opened by the same header button.
 *
 *   const fr = SlopFrame.mount(root, {
 *     list: listEl, view: viewEl, panel: panelEl,     // list is optional (null: two columns)
 *     phone: '(max-width: 900px)', panelLabel: 'Actions', storageKey: 'eml',
 *                                                     // panelLabel, listLabel: an i18n key ('eml.panel.actions'), a
 *                                                     //   function or plain text; a key follows a language change
 *     button: '.smb-tools',                           // where the header's show/hide button goes (selector or element; optional;
 *                                                     //   a selector not on the page yet is tried again at DOMContentLoaded)
 *     phoneButton: true,                              // false: no header button on phones (the app opens the sheet itself)
 *     width: 300, min: 240, max: 520,                 // panel width in px (default, limits), resized and kept by
 *     listWidth: 320, listMin: 220, listMax: 560,     //   shared/ui/resize-panel.js (load it before this file); the list too
 *     app: 'eml',                                     // the key of the sizes in the settings store (default storageKey)
 *     command: true,                                  // register '<storageKey>.panel' in SlopCmd (default true when present)
 *     onChange: (state) => {},                        // { panel: shown, width, viewing } after any change
 *   });
 *   fr.setPanel(bool) fr.togglePanel() fr.panelShown() fr.setWidth(px) fr.width()
 *   fr.setList(bool)     the list column is there or not (an app shows it only when it has more than one item)
 *   fr.showView() fr.showList() fr.viewing()   phones: the item over the list, or the list (wide screens: both shown)
 *   fr.openSheet() fr.closeSheet() fr.isPhone() fr.destroy()
 *
 *   SlopFrame.panel(panelEl, { title, icon }).render(sections)   the panel's content, the same in every app:
 *     { title, rows: [[label, value, hint?]] }                       key/value rows (empty values are skipped)
 *     { title, list: [{ name, meta, open?, actions: [action] }] }    files or items, each with its own buttons
 *     { title, actions: [action] }                                   buttons; one may be primary
 *     { title, note }  { title, body: element }                      a line of text, or the app's own element
 *     { title, settings: element | [elements] }                      a tool's settings group (the app's own controls)
 *   .footer([action], { note, more })   the panel's main button(s), stuck to its bottom (tool apps: the rule)
 *   action = { label, run?, menu?: items | () => items, primary?, disabled?, title?, id? }  or { el: a button already in the page }
 *     menu items = [{ label, act, disabled?, heading? }] open under the button (shared/ui/menubutton.js) as "Label ▾".
 * Classic script; styles in frame.css. Needs shared/ui/sheet.js for phones and shared/ui/menubutton.js for menus. */
(function (g) {
  'use strict';
  if (g.SlopFrame) return;
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }
  /** A label given to mount (panelLabel, listLabel): an i18n key, a function or plain text (SlopI18n.label). */
  const lab = (v) => { const I = g.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };
  const doc = g.document;
  const ls = {
    get(k) { try { return JSON.parse(g.localStorage.getItem(k)) || {}; } catch (e) { return {}; } },
    set(k, v) { try { g.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } },
  };
  const el = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M15 4.5v15"/></svg>';
  const pick = (x) => (typeof x === 'string' ? doc.querySelector(x) : x || null);

  function mount(root, o) {
    o = o || {};
    const list = pick(o.list), view = pick(o.view), panel = pick(o.panel), win = root.ownerDocument.defaultView;
    const key = 'slop-frame:' + (o.storageKey || 'app');
    const panelLabel = o.panelLabel || (() => tr('ui.frame.panel', 'Panel')), listLabel = o.listLabel || (() => tr('ui.frame.list', 'List'));
    let label = lab(panelLabel);
    const min = o.min || 240, max = o.max || 520, mq = win.matchMedia(o.phone || '(max-width: 900px)');
    const saved = ls.get(key), app = o.app || o.storageKey || 'app';
    let shown = saved.hidden !== true, width = o.width || 300, viewing = false, hasList = !!list;

    root.classList.add('sf-root');
    if (list) list.classList.add('sf-list');
    view.classList.add('sf-view');
    panel.classList.add('sf-panel');
    const ownAria = !panel.getAttribute('aria-label');   // ours: it follows a language change (words())
    if (ownAria) panel.setAttribute('aria-label', label);

    // The panel's edge and the list's edge resize them: the one shared implementation (shared/ui/resize-panel.js), which
    // keeps the widths in the site's settings store (app + 'frame-panel' / 'frame-list').
    const grip = el('div', 'sf-grip');
    panel.before(grip);
    const lgrip = list ? el('div', 'sf-grip sf-lgrip') : null;
    if (lgrip) list.after(lgrip);

    // The header button goes into o.button; a host that is not on the page yet (a menu bar mounted after this script)
    // is looked up again once the page is parsed.
    let btn = null;
    const host = pick(o.button);
    if (o.button) {
      btn = el('button', 'slop-hbtn sf-toggle' + (o.phoneButton === false ? ' sf-toggle-wide' : ''));
      btn.type = 'button';
      btn.innerHTML = ICON + '<span class="slop-hbtn-txt"></span>';
      if (host) host.append(btn);
      else doc.addEventListener('DOMContentLoaded', () => { const h = pick(o.button); if (h) h.append(btn); }, { once: true });
    }

    const sheet = g.SlopSheet ? g.SlopSheet.attach({
      root, panel, side: 'bottom', phone: o.phone || '(max-width: 900px)', label: panelLabel, toggles: btn ? [btn] : [],
      onChange: () => paint(),
    }) : null;

    const phone = () => mq.matches;
    function save() { ls.set(key, { hidden: !shown }); }
    function paint() {
      root.classList.toggle('sf-nopanel', !shown);
      root.classList.toggle('sf-nolist', !hasList);
      root.classList.toggle('sf-phone', phone());
      root.classList.toggle('sf-viewing', phone() && hasList && viewing);
      // a phone's closed sheet that shows only its footer (panel.js footer()): the rest of it is out of reach until opened
      const peek = phone() && panel.classList.contains('sf-has-foot') && !(sheet && sheet.isOpen());
      for (const c of panel.children) { if (!c.classList.contains('sf-p-foot')) c.inert = peek; }
      if (btn) { btn.setAttribute('aria-pressed', String(phone() ? !!(sheet && sheet.isOpen()) : shown)); btn.classList.toggle('sf-phone-hide', phone()); }
      if (o.onChange) o.onChange({ panel: shown, width, viewing });
    }
    function setPanel(on) { shown = !!on; save(); paint(); }
    function togglePanel() {
      if (phone()) { if (sheet) sheet.toggle(); paint(); return; }
      setPanel(!shown);
    }
    const RP = g.SlopResizePanel, phoneQ = o.phone || '(max-width: 900px)';
    if (saved.width && RP && g.SlopProfile && g.SlopProfile.panelSize && !g.SlopProfile.panelSize(app, 'frame-panel')) g.SlopProfile.setPanelSize(app, 'frame-panel', saved.width);   // kept before 2026-10
    const sizer = RP ? RP.attach(panel, { app, id: 'frame-panel', handle: grip, edge: 'start', width, min, max, phone: phoneQ, label: panelLabel,
      apply: (px) => { if (px != null) { width = px; root.style.setProperty('--sf-panel-w', px + 'px'); } if (o.onChange) o.onChange({ panel: shown, width, viewing }); } }) : null;
    if (!RP) root.style.setProperty('--sf-panel-w', width + 'px');
    const lsizer = RP && lgrip ? RP.attach(list, { app, id: 'frame-list', handle: lgrip, edge: 'end', width: o.listWidth || 320, min: o.listMin || 220, max: o.listMax || 560, phone: phoneQ, label: listLabel,
      apply: (px) => { if (px != null) root.style.setProperty('--sf-list-w', px + 'px'); } }) : null;
    function setWidth(w) { if (sizer) sizer.setWidth(w); }
    if (btn) btn.addEventListener('click', () => { if (!phone()) setPanel(!shown); });
    const onMore = () => { if (phone() && sheet) { sheet.toggle(); paint(); } else if (!shown) setPanel(true); };   // the footer's "more" button
    panel.addEventListener('sf-sheet', onMore);
    const onFoot = () => paint();   // the footer came or went
    panel.addEventListener('sf-foot', onFoot);   // on a phone SlopSheet's toggle opens it

    const onMq = () => paint();
    mq.addEventListener('change', onMq);

    const cmdId = (o.storageKey || 'app') + '.panel';
    // The words (the button's label and tip, the View command's title) again after a language change (shared/i18n).
    function words() {
      label = lab(panelLabel);
      if (ownAria) panel.setAttribute('aria-label', label);
      const low = { label: label.toLowerCase() };
      if (btn) {
        btn.querySelector('.slop-hbtn-txt').textContent = label;
        btn.title = tr('ui.frame.toggle_tip', 'Show or hide the {label} panel (Ctrl+Alt+B)', low);
        btn.setAttribute('aria-label', tr('ui.frame.panel_aria', '{label} panel', { label }));
      }
      if (o.command !== false && g.SlopCmd) {
        g.SlopCmd.register([{ id: cmdId, title: tr('ui.frame.toggle_cmd', 'Show or hide the {label} panel', low), group: 'View', keys: ['Mod+Alt+B'],
          keywords: ['panel', 'sidebar', 'details', 'actions', 'side'], checked: () => shown, run: togglePanel }]);
      }
    }
    words();
    const offLang = g.SlopI18n && g.SlopI18n.on ? g.SlopI18n.on(words) : null;
    paint();

    return {
      setPanel, togglePanel, setWidth, panelShown: () => shown, width: () => width,
      setList(on) { hasList = !!on && !!list; if (!hasList) viewing = false; paint(); },
      showView() { viewing = true; paint(); }, showList() { viewing = false; paint(); }, viewing: () => phone() && hasList && viewing,
      openSheet() { if (sheet) sheet.open(); paint(); }, closeSheet() { if (sheet) sheet.close(); paint(); },
      isPhone: phone, button: btn, grip, listGrip: lgrip, sizer, listSizer: lsizer, command: cmdId,
      destroy() {
        mq.removeEventListener('change', onMq);
        if (offLang) offLang();
        panel.removeEventListener('sf-sheet', onMore); panel.removeEventListener('sf-foot', onFoot);
        if (sheet) sheet.destroy();
        if (sizer) sizer.destroy(); if (lsizer) lsizer.destroy();
        grip.remove(); if (lgrip) lgrip.remove(); if (btn) btn.remove();
        if (g.SlopCmd && o.command !== false) g.SlopCmd.unregister(cmdId);
        root.classList.remove('sf-root', 'sf-nopanel', 'sf-nolist', 'sf-phone', 'sf-viewing');
      },
    };
  }

  g.SlopFrame = { mount, panel: (p, o) => g.SlopFramePanel.create(p, o) };
})(window);
