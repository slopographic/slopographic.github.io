// Reminder engine: while a page is open, it checks the reminders every 15 seconds and whenever the store changes. A due
// reminder shows as an in-app notification (SlopNotify.show({ title, body }) when that is loaded, otherwise a toast), and as a
// browser notification when the person has allowed it. Nothing here touches the network. Snoozes, dismissals and fired
// marks are written to the 'reminders' collection; the reminders themselves are read from events and tasks.
// Exposes window.SlopReminderEngine. Load after SlopData, SlopUI, tz.js, rrule.js, tasks/logic.js and reminders/core.js.
(function (g) {
  'use strict';
  const S = g.SlopData, T = g.SlopTime, NS = g.SlopReminders;
  const E = (g.SlopReminderEngine = g.SlopReminderEngine || {});
  const DAY = 86400000;
  const WINDOW_BACK = 7 * DAY, WINDOW_AHEAD = 400 * DAY;
  let timer = 0, busy = false, again = false, unsub = null, notifier = null;
  const fireListeners = new Set();

  /** Every reminder for the timeline window, plus the events, tasks and rows it was built from. */
  async function snapshot(now = NS.now(), zone = T.deviceZone()) {
    const [ev, tk, rc] = await Promise.all([S.store.list('events'), S.store.list('tasks'), S.store.list('reminders')]);
    const bad = [ev, tk, rc].find((r) => !r.ok);
    if (bad) return bad;
    const list = NS.items({ events: ev.value, tasks: tk.value, records: rc.value, from: now - WINDOW_BACK, to: now + WINDOW_AHEAD, zone });
    return { ok: true, value: { items: list, zone, now } };
  }

  /** A word from the shared tables (shared/i18n/ui/<code>/calendar.js), the key without SlopI18n. */
  const tr = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);
  /** Title and body for the popup, in the chosen language. */
  function wording(it) {
    const kind = tr({ event: 'ui.reminders.event', task: 'ui.reminders.task' }[it.source] || 'ui.reminders.reminder');
    return { title: it.title || kind, body: `${kind} · ${T.dateTimeText(it.at, T.deviceZone(), g.SlopI18n ? g.SlopI18n.get() : undefined)}` };
  }

  /** Shows one due reminder: the page's notifier if set, else SlopNotify, else a toast and a browser notification. */
  function deliver(it) {
    const w = wording(it);
    for (const fn of fireListeners) { try { fn(it); } catch (e) { /* a listener must not stop the others */ } }
    if (notifier) return notifier(it, w);
    if (g.SlopNotify && typeof g.SlopNotify.show === 'function') { try { g.SlopNotify.show({ title: w.title, body: w.body }); return; } catch (e) { /* fall through */ } }
    if (g.SlopUI && SlopUI.toast) SlopUI.toast(`${w.title} — ${w.body}`);
    if (E.permission() === 'granted') { try { new Notification(w.title, { body: w.body, tag: it.key }); } catch (e) { /* not available here */ } }
  }

  /** Checks for due reminders now: fires them and records that they fired. */
  async function scan() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const snap = await snapshot();
      if (!snap.ok) return;
      const { notify, silent } = NS.due(snap.value.items, snap.value.now);
      const marks = [...notify, ...silent];
      if (marks.length) {
        const w = await S.store.transact(async (api) => {
          for (const it of marks) {
            const r = await api.put('reminders', NS.stateRow(it, { firedAt: it.fireAt, snoozedUntil: it.snoozedUntil || undefined }));
            if (!r.ok) return r;
          }
          return { ok: true, value: marks.length };
        });
        if (!w.ok) return;
      }
      for (const it of notify) deliver(it);
    } finally {
      busy = false;
      if (again) { again = false; scan(); }
    }
  }

  /** Writes the state row for one reminder with a patch. Custom rows keep their fields, and the id is the reminder's own. */
  function patch(it, change) {
    return S.store.put('reminders', NS.stateRow(it, change));
  }

  /** Snoozes a reminder by a choice from NS.SNOOZES. It comes back when the snooze time passes. */
  async function snooze(it, choice) {
    const until = NS.snoozeUntil(choice, NS.now(), T.deviceZone());
    if (!until) return { ok: false, code: 'invalid', message: tr('ui.reminders.pick_snooze') };
    const r = await patch(it, { snoozedUntil: until });
    if (r.ok) scan();
    return r;
  }

  /** Dismisses a reminder: it leaves the timeline and does not fire again. */
  function dismiss(it) {
    return patch(it, { dismissedAt: NS.now(), firedAt: it.firedAt || undefined, snoozedUntil: undefined });
  }

  /** Adds a custom reminder, not tied to an event or task. at is an instant. */
  async function addCustom(title, at) {
    const r = await S.store.put('reminders', { source: 'custom', title: String(title || '').trim(), at });
    if (r.ok) scan();
    return r;
  }

  /** Replaces how a reminder is shown (tests and pages without a toast). fn(item, { title, body }). */
  function setNotifier(fn) { notifier = typeof fn === 'function' ? fn : null; }
  /** Calls fn(item) for every reminder as it fires. Returns an off function. */
  function onFire(fn) { fireListeners.add(fn); return () => fireListeners.delete(fn); }

  /** The browser notification permission: default, granted or denied (or 'unsupported'). */
  E.permission = () => (g.Notification ? g.Notification.permission : 'unsupported');
  /** Asks the browser for notification permission. Call from a button click. */
  E.requestPermission = async () => (g.Notification ? g.Notification.requestPermission() : 'unsupported');

  /** Starts checking. Safe to call twice. */
  E.start = function start({ interval = 15000 } = {}) {
    if (timer) return;
    timer = setInterval(scan, interval);
    if (S.store.subscribe && !unsub) unsub = S.store.subscribe(() => scan());
    scan();
  };
  E.stop = function stop() {
    clearInterval(timer); timer = 0;
    if (unsub) { unsub(); unsub = null; }
  };
  E.scan = scan;
  E.snapshot = snapshot;
  E.snooze = snooze;
  E.dismiss = dismiss;
  E.addCustom = addCustom;
  E.setNotifier = setNotifier;
  E.onFire = onFire;
})(typeof window !== 'undefined' ? window : globalThis);
