// SlopBiz.panel: the record panel of every business app, on the suite's one layout (shared/frame/HANDOFF.md, "settings and
// the main button live in the right panel"): an open record's form or details sit in a panel on the RIGHT of the record
// (SlopFrame: resized on its edge and kept, shown and hidden from its header button, Ctrl+Alt+B), and its main button
// (Save, Issue…, Confirm order, Run…) is in the panel's footer, stuck to the panel's foot. On a phone the panel is a bottom
// sheet (SlopSheet) whose closed state still shows that footer, so the main button is always in reach; "Details" opens it.
// Classic script, after shared/frame/frame.js and panel.js (and shared/ui/sheet.js, menubutton.js, resize-panel.js).
//   const rp = SlopBiz.panel.mount({
//     app: 'invoices',            // the key of the panel's size and shown/hidden state
//     root, view, panel,          // the record view, its main part and the panel (elements or selectors)
//     label: 'app.key',           // the panel's name, an i18n key (header button, the footer's button that opens the sheet)
//     button: '.biz-doc-actions', // where the header's show/hide button goes (optional)
//     phone: '(max-width: 720px)' // when the panel is a sheet (the app's own phone width; default 900 px)
//   });
//   rp.actions(nodes, host)   the record's action buttons and notes: the primary one(s) and Save go in the footer, the
//                             others (and the notes) into host, a section of the panel; call it on every state change
//   rp.footer(list, opts)     the footer straight (shared/frame/panel.js footer())     rp.frame   the SlopFrame
// An app whose record is a view of its own (Expenses, Timesheets: list, edit) shows it beside the list instead:
//   SlopBiz.panel.records({ app, ns, list: '#view-list', record: '#view-edit', view: 'edit', foot: ['#eSave', …] })
//   The two views move into one row (.biz-lr): on the list view the list alone; with a record open the list stays on the
//   left (redrawn with the record) and the record is the panel on the right, its buttons (foot) in the footer. On a phone
//   the record opens as the bottom sheet over the list. Styles: shared/biz/app.css (.biz-lr).
// A view whose form adds a record (Ledger: a journal entry, an account, a rate) puts that form in the panel instead:
//   SlopBiz.panel.form({ app, key: 'journal', view: '#view-journal', form: '#jForm', foot: ['#jPost'], label: 'New entry' })
//   The rest of the view stays on the left; the form is the panel on the right, its button in the footer; on a phone the
//   footer stays at the bottom of the screen and the form opens as a bottom sheet (a tap on its button opens it too).
(function (g) {
  'use strict';
  const B = (g.SlopBiz = g.SlopBiz || {});
  const pick = (x) => (typeof x === 'string' ? document.querySelector(x) : x || null);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** A Save button, in English or in the chosen language ("Save", "Save changes"; "Spara"). */
  const isSave = (n) => { const s = n.textContent.trim().toLowerCase(); return /^save\b/.test(s) || s.startsWith(t('menu.save').toLowerCase()); };

  function mount(o) {
    const root = pick(o.root), panel = pick(o.panel), label = o.label || 'biz.panel.details';
    /** The name in the current language: a key, a function or text (SlopI18n.label; the frame reads it the same way). */
    const name = () => (g.SlopI18n && g.SlopI18n.label ? g.SlopI18n.label(label) : typeof label === 'function' ? label() : label);
    if (!g.SlopFrame || !root || !panel) return { actions: (nodes, host) => { if (host) host.replaceChildren(...nodes); }, footer() {}, frame: null };
    // the header button's place: a bar the app draws later (the record bar) gets it once it is on the page
    const slot = o.button ? document.createElement('span') : null;
    if (slot) {
      slot.className = 'biz-rp-slot';
      const put = () => { const h = pick(o.button); if (h && !h.contains(slot)) h.append(slot); return !!h; };
      if (!put() && g.MutationObserver) { const mo = new g.MutationObserver(() => { if (put()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); }
    }
    const frame = g.SlopFrame.mount(root, { list: null, view: pick(o.view), panel, panelLabel: label, storageKey: o.app + '-' + (o.key || 'record'), app: o.app,
      phone: o.phone || '(max-width: 900px)', button: slot, phoneButton: false, width: o.width || 340, min: 280, max: 620, command: o.command });
    const p = g.SlopFrame.panel(panel, { bare: true });
    root.classList.add('biz-rp');
    // With no main button (a paid invoice, a cancelled order) the phone's footer is only "Details", which opens the sheet
    const peek = document.createElement('button');
    peek.type = 'button';
    peek.className = 'btn biz-rp-peek';
    peek.textContent = name();
    peek.setAttribute('aria-haspopup', 'dialog');
    peek.addEventListener('click', () => frame.openSheet());

    /** The footer: the given buttons (the page's own, moved in) and "Details" that opens the phone's sheet. */
    let shown = null;   // the last footer, drawn again on a language change ("Details" is a word)
    function footer(list, opts) {
      shown = [list, opts];
      const foot = (list || []).filter(Boolean);
      if (!foot.length) { p.footer([{ el: peek }]); return; }
      p.footer(foot.map((b) => (b.nodeType ? { el: b } : b)), Object.assign({ more: name() }, opts || {}));
    }
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => { peek.textContent = name(); if (shown) footer(shown[0], shown[1]); });

    /** Splits the record's actions: Save and the primary button(s) into the footer, the rest into host, in their order. */
    function actions(nodes, host) {
      const list = (nodes || []).filter(Boolean);
      const isBtn = (n) => n.tagName === 'BUTTON' || (n.tagName === 'A' && n.classList.contains('btn'));
      const main = list.filter((n) => isBtn(n) && !n.hidden && (n.classList.contains('primary') || isSave(n)));
      const save = main.filter((n) => !n.classList.contains('primary')), prim = main.filter((n) => n.classList.contains('primary'));
      if (host) host.replaceChildren(...list.filter((n) => !main.includes(n)));
      if (host) host.hidden = !host.childElementCount;
      footer(save.concat(prim));
    }

    return { actions, footer, frame, panel: p };
  }

  function records(o) {
    const NS = o.ns, list = pick(o.list), rec = pick(o.record), app = document.querySelector('.app');
    if (!g.SlopFrame || !list || !rec || !app) return null;
    const wrap = document.createElement('div');
    wrap.className = 'biz-lr';
    rec.classList.add('biz-rp-panel');
    list.before(wrap);
    wrap.append(list, rec);
    // the record is the panel: no show/hide button or command (a hidden panel would hide the record)
    const rp = mount({ app: o.app, root: wrap, view: list, panel: rec, label: o.label, phone: o.phone, width: o.width || 380, command: false });
    const foot = (o.foot || []).map(pick).filter(Boolean);
    const homes = new Set(foot.map((b) => b.parentElement));
    rp.footer(foot);
    for (const h of homes) if (h && !h.childElementCount) h.hidden = true;   // the bar the buttons came from, now empty
    const redraw = () => { const v = NS.views && NS.views[o.listView || 'list'], fn = v && (v.refresh || v.render); if (fn) fn.call(v); };
    let was = null, timer = 0;
    function sync() {
      const v = app.dataset.view, on = v === o.view;
      wrap.classList.toggle('biz-lr-on', on || v === (o.listView || 'list'));
      wrap.classList.toggle('biz-lr-rec', on);
      document.body.classList.toggle('biz-lr-open', on);
      if (on && was !== v) { redraw(); if (rp.frame.isPhone()) rp.frame.openSheet(); }
      if (!on && was === o.view) rp.frame.closeSheet();
      was = v;
    }
    new g.MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['data-view'] });
    sync();
    // the list beside an open record follows every change (a record saved, voided or paid)
    if (g.SlopData && g.SlopData.store) g.SlopData.store.subscribe(() => { clearTimeout(timer); timer = setTimeout(() => { if (wrap.classList.contains('biz-lr-rec')) redraw(); }, 60); });
    return rp;
  }

  /** Footer buttons that open the phone's sheet when it is closed (so the form's answer is seen), then run. */
  function opensSheet(rp, foot) {
    for (const b of foot) b.addEventListener('click', () => { const f = rp.frame; if (f.isPhone() && !b.closest('.ssh-on')) f.openSheet(); }, true);
  }

  function form(o) {
    const sec = pick(o.view), panel = pick(o.form);
    if (!g.SlopFrame || !sec || !panel) return null;
    const main = document.createElement('div');
    main.className = 'biz-fv-main';
    for (const n of [...sec.children]) if (n !== panel) main.append(n);
    sec.prepend(main);
    sec.classList.add('biz-fv');
    panel.classList.add('biz-rp-panel');
    const rp = mount({ app: o.app, key: o.key, root: sec, view: main, panel, label: o.label, phone: o.phone, width: o.width || 360, command: false });
    const foot = (o.foot || []).map(pick).filter(Boolean);
    rp.footer(foot);
    opensSheet(rp, foot);
    return rp;
  }

  B.panel = { mount, records, form };
})(typeof window !== 'undefined' ? window : globalThis);
