// .ics export and import for the calendar. Export writes every event. Import reads the file, shows a preview of what
// will be added (and what is skipped because its UID is already in the calendar, or was simplified), and writes only
// after the person confirms, in one store transaction. Exposes window.SlopCal.ics.
(function (g) {
  'use strict';
  const S = g.SlopData, I = g.SlopIcs, T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});
  const MAX_BYTES = 5 * 1024 * 1024, SHOW = 100;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Downloads every event as slop-calendar.ics. */
  async function exportIcs() {
    const r = await g.SlopEvents.list();
    if (!r.ok) { UI.toast(r.message || t('calendar.views.ics.read_failed')); return; }
    const text = I.build(r.value);
    UI.download(new Blob([text], { type: 'text/calendar;charset=utf-8' }), 'slop-calendar.ics');
    UI.toast(t('calendar.views.ics.exported', { n: r.value.length }));
  }

  /** When an imported event happens, for the preview: the day, or the time in its zone. */
  function whenText(e, locale) {
    if (e.allDay) return e.endDay && e.endDay !== e.startDay ? t('calendar.views.ics.days', { from: T.dayText(e.startDay, locale), to: T.dayText(e.endDay, locale) }) : t('calendar.views.ics.all_day', { day: T.dayText(e.startDay, locale) });
    return `${T.dateTimeText(e.start, e.tz, locale)} (${e.tz})`;
  }

  /* The one way an .ics file comes in (shared/intake, spec 'calendar'): the Import dialog's zone (a drop on it, or its
     Choose files). The reader hands the file to the dialog that is waiting for it. */
  let waiting = null;
  function registerIntake() {
    if (!g.SlopIntake || g.SlopIntake.spec('calendar')) return;
    g.SlopIntake.register({
      id: 'calendar', limit: 1, paste: false, toast: false,
      accept: { types: ['text/calendar'], exts: ['.ics'], get noun() { return t('calendar.views.ics.noun'); }, maxBytes: MAX_BYTES },
      process: async (file) => {
        if (!waiting) throw new Error('arrived with no Import dialog open');
        const text = await file.text();
        waiting({ file, text });
        return file.name;
      },
    });
  }
  /** Reads the chosen .ics file. A dialog with a drop zone (SlopDrop on the intake): drop the file on it, or choose one.
   *  Resolves to { file, text } or null when the dialog is closed. Without SlopDrop, the intake's picker. */
  async function pick() {
    registerIntake();
    return new Promise((resolve) => {
      let done = false, drop = null, dlg = null;
      waiting = (got) => { done = true; waiting = null; resolve(got); if (dlg) dlg.close(true); };
      const cancelled = () => { if (!done) { waiting = null; resolve(null); } };
      if (!g.SlopDrop) { g.SlopIntake.pick({ to: 'calendar', multiple: false }).then(cancelled); return; }
      const zone = document.createElement('div');
      dlg = UI.dialog({ title: t('calendar.views.ics.import'), body: el('div', null, el('p', { class: 'sui-p' }, t('calendar.views.ics.drop')), zone), buttons: [{ label: t('menu.cancel') }],
        onClose: () => { if (drop && drop.destroy) drop.destroy(); cancelled(); } });
      drop = g.SlopDrop.attach(zone, { intake: 'calendar', compact: true, window: false, overlay: false, toast: false });
    });
  }

  /**
   * Import with a preview. zone is the viewer's zone (events with no zone in the file use it). The dialog lists what
   * will be added first. Resolves to the number of events added (0 when cancelled).
   */
  async function importIcs(zone, locale, onDone) {
    const picked = await pick();
    if (!picked) return 0;
    const parsed = I.parse(picked.text, { fallbackZone: zone });
    if (!parsed.total) { await UI.alert(t('calendar.views.ics.nothing'), t('calendar.views.ics.no_events')); return 0; }
    const have = await g.SlopEvents.list();
    const uids = new Set(have.ok ? have.value.map((e) => e.uid).filter(Boolean) : []);
    const fresh = parsed.events.filter((e) => !(e.uid && uids.has(e.uid)));
    const skipped = parsed.events.length - fresh.length;
    const rows = fresh.slice(0, SHOW).map((e) => el('li', { class: 'ics-row' }, el('b', null, e.title), el('span', { class: 'row-sub' },
      `${whenText(e, locale)}${e.freq && e.freq !== 'none' ? ` · ${t('calendar.views.ics.repeats', { freq: e.freq })}` : ''}`)));
      const warn = parsed.warnings.slice(0, 20).map((w) => el('li', null, `${w.title || t('calendar.views.ics.event')}: ${w.message}`));
    const body = el('div', { class: 'ics-preview' },
      el('p', { class: 'sui-p', role: 'status' }, t(skipped ? 'calendar.views.ics.summary_skip' : 'calendar.views.ics.summary', { file: picked.file.name, n: parsed.total, fresh: String(fresh.length), skipped: String(skipped) })),
      fresh.length > SHOW ? el('p', { class: 'note' }, t('calendar.views.ics.first', { n: SHOW })) : null,
      rows.length ? el('ul', { class: 'ics-list', 'aria-label': t('calendar.views.ics.to_add') }, rows) : null,
      warn.length ? el('div', null, el('h4', { class: 'sub-t' }, t('calendar.views.ics.simplified')), el('ul', { class: 'ics-warn' }, warn)) : null);
    const write = async () => {
      if (!fresh.length) return false;
      const recs = fresh.map((e) => ({ ...e }));
      const r = await S.store.transact(async (api) => {
        for (const rec of recs) {
          const w = await api.put('events', rec);
          if (!w.ok) return w;
        }
        return { ok: true, value: recs.length };
      });
      if (!r.ok) { UI.toast(r.message || t('calendar.views.ics.failed')); return false; }
      UI.toast(t('calendar.views.ics.added', { n: recs.length }));
      if (onDone) onDone(recs.length);
      return true;
    };
    let added = 0;
    await new Promise((res) => {
      UI.dialog({ title: t('calendar.views.ics.import'), body, cls: 'ics-dlg', buttons: [{ label: t('menu.cancel') }, { label: t('calendar.views.ics.add_n', { n: fresh.length }), primary: true, act: async () => {
        const ok = await write();
        if (ok) added = fresh.length;
        return ok ? undefined : false;
      } }], onClose: () => res() });
    });
    return added;
  }

  NS.ics = { exportIcs, importIcs };
})(typeof window !== 'undefined' ? window : globalThis);
