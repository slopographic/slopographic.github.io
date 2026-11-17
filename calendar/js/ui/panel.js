// Slop Calendar: the panel on the right (the suite rule, shared/frame/HANDOFF.md: SlopFrame, shared/frame/frame.js and
// panel.js). The calendar is the view; the panel shows the chosen day (its events and to-dos, each opens in the editor),
// the display choices (To-dos, the time zone, the split's panes: the toolbar's old controls, moved in with their ids) and
// the calendar file (Import .ics, Export .ics, Config), with New event, the main button, at its foot. Prev, Today, Next
// and the views stay in the toolbar. On a phone the panel is a bottom sheet whose closed state still shows New event.
// The event editor (ui/editor.js) opens in the same panel: edit({ title, body, buttons }) puts the form in it and its
// buttons (Cancel, Delete, Save) at its foot; done() puts the day back. On a phone the sheet opens with it, and closing the
// sheet cancels the edit. Exposes window.SlopCal.panel: mount() at boot, paint(ctx, day) after each render (ui/app.js).
(function (g) {
  'use strict';
  const NS = (g.SlopCal = g.SlopCal || {}), T = g.SlopTime;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let p = null, editing = null, last = null, box = null;
  const phoneOpen = () => $('cSide').classList.contains('ssh-on');

  function mount() {
    if (!g.SlopFrame || p) return null;
    const side = $('cSide');
    const frame = g.SlopFrame.mount($('cBody'), { view: $('main'), panel: side, panelLabel: 'calendar.panel.day', storageKey: 'calendar',
      button: '.toolbar', phoneButton: false, phone: '(max-width: 640px)', width: 290, min: 240, max: 440,
      onChange: () => { if (editing && NS.panel.frame && NS.panel.frame.isPhone() && !phoneOpen()) done(); } });   // the sheet closed: cancel
    p = g.SlopFrame.panel(side, { title: t('calendar.panel.day') });
    for (const id of ['cTasks', 'cZone']) $(id).closest('label').classList.add('sf-field');
    p.footer([{ el: $('cNew'), primary: true }], { more: t('calendar.panel.day') });
    NS.panel.frame = frame;
    // the panel reaches the window's bottom from where the calendar starts (under the menu bar and the toolbar)
    const top = () => document.documentElement.style.setProperty('--cal-top', Math.max(0, Math.round($('cBody').getBoundingClientRect().top + g.scrollY)) + 'px');
    top();
    if (g.ResizeObserver) new g.ResizeObserver(top).observe(document.querySelector('.toolbar'));
    return frame;
  }

  /** The panel for the day the view is on: its items (from the view's ctx), the display choices and the file actions. */
  function paint(ctx, day) {
    last = [ctx, day];
    if (!p) return;
    const list = NS.model.forDay(ctx.items || [], day, ctx.zone).map((it) => ({
      name: it.title || t('calendar.panel.untitled'),
      meta: [it.allDay ? t('calendar.views.all_day') : T.timeText(it.start, ctx.zone, ctx.locale), NS.model.kindText(it), it.location].filter(Boolean).join(' · '),
      open: () => ctx.open(it),
    }));
    if (!editing) p.setTitle(T.dayText(day, ctx.locale, { weekday: 'long', day: 'numeric', month: 'long' }));
    p.render([
      { key: 'day', title: day === ctx.today ? t('calendar.panel.today') : t('calendar.panel.on_day'), list, empty: t('calendar.panel.empty') },
      { key: 'show', title: t('calendar.panel.show'), settings: [$('cTasks').closest('label'), $('cZone').closest('label'), $('cSplit')] },
      { key: 'file', title: t('calendar.panel.file'), actions: [{ el: $('cImport') }, { el: $('cExport') }, { el: $('cConfig') }] },
    ]);
  }

  /** The editor in the panel: o = { title, body (the form), buttons: [{ label, run, primary?, danger? }] }. */
  function edit(o) {
    if (!p) return null;
    const fr = NS.panel.frame;
    editing = o;
    p.setTitle(o.title);
    // the day's sections stay in the page, hidden (their controls keep their ids); the form shows in their place
    if (!box) { box = document.createElement('div'); box.className = 'sf-p-body cal-edit'; }
    box.replaceChildren(o.body);
    p.element.hidden = true;
    p.element.after(box);
    p.footer([...o.buttons.map((b, i) => ({ id: 'ev-' + i, label: b.label, primary: !!b.primary, run: b.run })), { el: $('cNew'), hidden: true }], { more: t('calendar.panel.day') });
    if (fr) { if (fr.isPhone()) fr.openSheet(); else if (!fr.panelShown()) fr.setPanel(true); }
    return { close: done };
  }

  /** Leaves the editor: the day, the choices and New event come back. */
  function done() {
    if (!editing) return;
    editing = null;
    if (box) box.remove();
    p.element.hidden = false;
    p.footer([{ el: $('cNew'), primary: true, hidden: false }], { more: t('calendar.panel.day') });
    const fr = NS.panel.frame;
    if (fr && fr.isPhone() && phoneOpen()) fr.closeSheet();
    if (last) paint(last[0], last[1]);
  }

  NS.panel = { mount, paint, edit, done, editing: () => !!editing };
})(typeof window !== 'undefined' ? window : globalThis);
