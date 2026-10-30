// The event editor: a new or existing event, in the calendar's right panel (ui/panel.js: edit(); a bottom sheet on a
// phone), Cancel, Delete and Save at its foot. It shows the time in the viewer's zone and in the event's own zone as you
// type, links a CRM customer and a call, meeting or event kind, and sets the repeat and the reminder. Saving validates
// first, and a bad form stays open. Escape cancels. Exposes window.SlopCal.editor.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopCal = g.SlopCal || {});
  const FALLBACK_ZONES = ['UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'];
  const pad = (n) => String(n).padStart(2, '0');
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const plusHour = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); const hr = (h + 1) % 24; return `${pad(hr)}:${pad(m)}`; };

  /** The zones offered: every zone Intl knows, or a short list where it cannot say. Always includes the given ones. */
  function zoneChoices(...extra) {
    let all = FALLBACK_ZONES;
    try { if (Intl.supportedValuesOf) all = Intl.supportedValuesOf('timeZone'); } catch (e) { /* use the short list */ }
    return [...new Set([...extra.filter(Boolean), ...all])];
  }

  /** A select with options [{ v, label }]. */
  const select = (id, opts, value, label) => el('label', { class: 'field' }, el('span', null, label),
    el('select', { id, 'aria-label': label }, opts.map((o) => el('option', { value: o.v, selected: String(o.v) === String(value) }, o.label))));
  const input = (id, type, value, label, extra = {}) => el('label', { class: 'field' }, el('span', null, label),
    el('input', { id, type, value: value ?? '', 'aria-label': label, ...extra }));

  /**
   * Opens the editor. opts: { event (a stored record, to edit), day (YYYY-MM-DD for a new one), minutes (start time of a
   * new one, from midnight), customerId, kind, title, zone (viewer's zone), onSaved(record), onRemoved(id) }.
   */
  async function open(opts = {}) {
    const zone = opts.zone || T.deviceZone();
    const base = opts.event ? g.SlopEvents.toForm(opts.event) : defaults(opts, zone);
    const cust = await S.store.list('customers');
    const customers = cust.ok ? cust.value.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))) : [];
    const f = { ...base };
    const note = el('p', { class: 'note ev-zones', id: 'evZones', role: 'status' });
    const refresh = () => { read(); note.textContent = zoneLine(f, zone); };
    const body = el('form', { class: 'ev-form', id: 'evForm', onsubmit: (e) => e.preventDefault(), onchange: refresh, oninput: refresh },
      input('evTitle', 'text', f.title, t('calendar.views.ed.title'), { maxlength: 200, required: true, autofocus: true }),
      el('label', { class: 'field check' }, el('input', { id: 'evAllDay', type: 'checkbox', checked: !!f.allDay, 'aria-label': t('calendar.views.all_day') }), el('span', null, t('calendar.views.all_day'))),   // i18n-ignore: a class name
      el('div', { class: 'ev-row' }, input('evDate', 'date', f.date, t('calendar.views.ed.start_date')), input('evStart', 'time', f.startTime, t('calendar.views.ed.start_time')),
        input('evEndDate', 'date', f.endDate, t('calendar.views.ed.end_date')), input('evEnd', 'time', f.endTime, t('calendar.views.ed.end_time'))),
      select('evTz', zoneChoices(f.tz, zone).map((z) => ({ v: z, label: z })), f.tz, t('calendar.views.ed.zone')),
      note,
      el('div', { class: 'ev-row' }, select('evKind', [{ v: 'event', label: t('calendar.views.kind.event') }, { v: 'call', label: t('calendar.views.kind.call') }, { v: 'meeting', label: t('calendar.views.kind.meeting') }], f.kind, t('calendar.views.ed.kind')),
        select('evColor', g.SlopEvents.COLORS.map((c) => ({ v: c, label: c })), f.color, t('calendar.views.ed.colour'))),
      select('evCustomer', [{ v: '', label: t('calendar.views.ed.no_customer') }, ...customers.map((c) => ({ v: c.id, label: c.name }))], f.customerId, t('calendar.views.ed.customer')),
      el('div', { class: 'ev-row' }, select('evRepeat', [{ v: 'none', label: t('calendar.views.ed.r_none') }, { v: 'daily', label: t('calendar.views.ed.r_daily') }, { v: 'weekly', label: t('calendar.views.ed.r_weekly') }, { v: 'monthly', label: t('calendar.views.ed.r_monthly') }, { v: 'yearly', label: t('calendar.views.ed.r_yearly') }], f.freq, t('calendar.views.ed.repeat')),
        input('evUntil', 'date', f.until, t('calendar.views.ed.until'))),
      el('div', { class: 'ev-row' }, select('evRemind', g.SlopEvents.REMINDERS.map((r) => ({ v: r.v, label: r.label })), f.remind, t('calendar.views.ed.reminder'))),
      input('evLoc', 'text', f.location, t('calendar.views.ed.location'), { maxlength: 200 }),
      el('label', { class: 'field' }, el('span', null, t('calendar.views.ed.notes')), el('textarea', { id: 'evNotes', rows: 3, maxlength: 5000, 'aria-label': t('calendar.views.ed.notes') }, f.notes)));
    /** Copies the form's current values into f (and the title suggestion for a call to a customer). */
    function read() {
      const v = (id) => body.querySelector(`#${id}`);
      f.title = v('evTitle').value;
      f.allDay = v('evAllDay').checked;
      f.date = v('evDate').value; f.endDate = v('evEndDate').value || f.date;
      f.startTime = v('evStart').value; f.endTime = v('evEnd').value;
      f.tz = v('evTz').value; f.kind = v('evKind').value; f.color = v('evColor').value;
      f.customerId = v('evCustomer').value; f.freq = v('evRepeat').value; f.until = v('evUntil').value;
      f.remind = v('evRemind').value; f.location = v('evLoc').value; f.notes = v('evNotes').value;
    }
    const titleInput = body.querySelector('#evTitle');
    body.querySelector('#evCustomer').addEventListener('change', () => {
      const c = customers.find((x) => x.id === body.querySelector('#evCustomer').value);
      if (c && !titleInput.value.trim()) titleInput.value = `${f.kind === 'meeting' ? 'Meeting' : 'Call'} ${c.name}`;
      refresh();
    });
    body.querySelector('#evNotes').value = f.notes || '';
    refresh();
    let h = null;
    const close = () => { if (h) h.close(); };
    const save = async () => {
      read();
      const res = g.SlopEvents.fromForm(f, opts.event || null);
      if (!res.ok) { UI.toast(res.error); return false; }
      const r = await g.SlopEvents.save(res.value);
      if (!r.ok) { UI.toast(r.message || t('calendar.views.ed.save_failed')); return false; }
      if (opts.onSaved) opts.onSaved(r.value);
      close();
      return true;
    };
    const remove = async () => {
      if (!opts.event) return true;
      const yes = await UI.confirm(t('calendar.views.ed.del_q'), t(opts.event.freq && opts.event.freq !== 'none' ? 'calendar.views.ed.del_series' : 'calendar.views.ed.del_final'), t('ui.delete'), { danger: true });
      if (!yes) return false;
      const r = await g.SlopEvents.remove(opts.event.id);
      if (!r.ok) { UI.toast(r.message); return false; }
      if (opts.onRemoved) opts.onRemoved(opts.event.id);
      close();
      return true;
    };
    const buttons = [{ label: t('menu.cancel'), run: close }];
    if (opts.event) buttons.push({ label: t('ui.delete'), run: remove });
    buttons.push({ label: t('menu.save'), primary: true, run: save });
    body.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
    body.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    h = NS.panel.edit({ title: opts.event ? t('calendar.views.ed.edit') : t('calendar.views.ed.new'), body, buttons });
    setTimeout(() => { if (titleInput.isConnected) titleInput.focus({ preventScroll: true }); }, 40);
    return h;
  }

  /** A new event's defaults: the day and time asked for, an hour long, in the viewer's zone. */
  function defaults(opts, zone) {
    const day = opts.day || T.todayIn(zone);
    const mins = opts.minutes === undefined ? 9 * 60 : opts.minutes;
    const startTime = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
    return {
      title: opts.title || '', allDay: false, date: day, endDate: day, startTime, endTime: plusHour(startTime), tz: zone,
      location: '', notes: '', color: 'blue', kind: opts.kind || 'event', freq: 'none', until: '', remind: '', customerId: opts.customerId || '',
    };
  }

  /** Both readings of the start in one line: the viewer's zone and the event's zone. */
  function zoneLine(f, viewer) {
    if (f.allDay || !T.parseDay(f.date) || !/^\d{2}:\d{2}$/.test(f.startTime || '') || !T.isZone(f.tz)) return f.allDay ? t('calendar.views.ed.all_day_note') : '';
    const at = T.dayTimeToUtc(f.date, f.startTime, f.tz);
    const mine = t('calendar.views.ed.mine', { time: T.timeText(at, viewer), zone: viewer });
    if (f.tz === viewer) return `${mine}.`;
    return t('calendar.views.ed.starts', { time: T.timeText(at, f.tz), zone: f.tz, label: T.zoneLabel(at, f.tz), mine });
  }

  NS.editor = { open, defaults, zoneLine, zoneChoices };
})(typeof window !== 'undefined' ? window : globalThis);
