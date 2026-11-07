/* SlopNotify: the shared notifier. Apps call it instead of alert().
 *   SlopNotify.show({ title, body, action: { label, run }, ms = 6000, desktop = true }) -> id
 *   SlopNotify.dismiss(id) · SlopNotify.history() -> newest first · SlopNotify.clear()
 *   SlopNotify.unread() · SlopNotify.markRead() · SlopNotify.onChange(fn) -> unsubscribe
 *   SlopNotify.desktopState() -> 'unsupported' | 'granted' | 'denied' | 'default'
 *   SlopNotify.askDesktop() must be called from a button click; it asks the browser for permission.
 * Toasts stack in the bottom-right corner (full width on phones), at most 4 at once.
 * History is kept (100 entries) in localStorage under 'slop.notify.v1' as { v: 1, data }. If storage is
 * blocked it still works for the session. Native Notification API: used when permission is granted and this page is in the background. */
(function () {
  'use strict';
  if (window.SlopNotify) return;
  const KEY = 'slop.notify.v1', MAX_HISTORY = 100, MAX_VISIBLE = 4;
  let seq = 0, history = [], unread = 0;
  const listeners = new Set();
  const actions = new Map(); // id -> action, kept for this session only (functions cannot be stored)
  let stack = null, bell = null, panel = null;

  function load() {
    try {
      const env = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (env && env.v === 1 && Array.isArray(env.data)) return env.data.filter((r) => r && typeof r.id === 'string').slice(0, MAX_HISTORY);
    } catch (e) { /* unreadable: start empty */ }
    return [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, data: history })); } catch (e) { /* storage blocked: session only */ }
  }
  const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) { /* a listener must not break the others */ } }); renderBell(); };
  const esc = (s) => window.SlopShell.esc(s);   // the shell's one HTML escape (shell.js)
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  /** A word from the shared tables (shared/i18n: the chrome and ui/<code>/shell.js), the key without SlopI18n. */
  const tx = (key, vars) => (window.SlopI18n ? window.SlopI18n.t(key, vars) : key);
  const hasNative = () => typeof window.Notification === 'function';
  const desktopState = () => (!hasNative() ? 'unsupported' : Notification.permission);

  function show(o = {}) {
    const rec = { id: 'n' + Date.now().toString(36) + (seq++).toString(36), title: String(o.title || tx('ui.shell.notice')), body: o.body == null ? '' : String(o.body), time: Date.now(), read: false, action: o.action && o.action.label ? String(o.action.label) : '' };
    if (o.action && typeof o.action.run === 'function') actions.set(rec.id, o.action.run);
    history.unshift(rec);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    unread++;
    save();
    toast(rec, o.ms == null ? 6000 : o.ms);
    if (o.desktop !== false && desktopState() === 'granted' && document.hidden) {
      try { new Notification(rec.title, { body: rec.body, tag: rec.id }); } catch (e) { /* some browsers only allow it from a service worker */ }
    }
    emit();
    return rec.id;
  }

  function toast(rec, ms) {
    ensureStack();
    while (stack.children.length >= MAX_VISIBLE) stack.firstElementChild.remove();
    const t = el('div', 'sn-toast');
    t.setAttribute('role', 'status');
    t.dataset.id = rec.id;
    const text = el('div', 'sn-text');
    text.append(el('strong', 'sn-title', rec.title));
    if (rec.body) text.append(el('span', 'sn-body', rec.body));
    const x = el('button', 'sn-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', tx('ui.shell.dismiss'));
    x.addEventListener('click', () => dismiss(rec.id));
    t.append(text);
    const act = actions.get(rec.id);
    if (act) {
      const b = el('button', 'sn-act', rec.action || tx('menu.open'));
      b.type = 'button';
      b.addEventListener('click', () => { dismiss(rec.id); try { act(); } catch (e) { console.error(e); } });
      t.append(b);
    }
    t.append(x);
    stack.append(t);
    requestAnimationFrame(() => t.classList.add('sn-in'));
    if (ms > 0) setTimeout(() => dismiss(rec.id), ms);
  }

  function dismiss(id) {
    const t = stack && stack.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!t) return;
    t.classList.remove('sn-in');
    t.classList.add('sn-out');
    setTimeout(() => t.remove(), 180);
  }

  function ensureStack() {
    if (stack && stack.isConnected) return;
    stack = el('div', 'sn-stack');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }

  /* ---------- bell and history panel ---------- */
  function renderBell() {
    if (!bell) return;
    const n = bell.querySelector('.sn-count');
    n.textContent = unread > 9 ? '9+' : String(unread);
    n.hidden = !unread;
    bell.title = tx('shell.notifications');
    bell.setAttribute('aria-label', unread ? tx('shell.notifications_new', { n: unread }) : bell.title);
    if (panel && !panel.hidden) renderPanel();
  }
  function renderPanel() {
    const list = panel.querySelector('.sn-list');
    list.textContent = '';
    if (!history.length) list.append(el('p', 'sn-empty', tx('ui.shell.no_notifications')));
    for (const r of history) {
      const row = el('div', 'sn-row' + (r.read ? '' : ' sn-new'));
      const body = el('div', 'sn-row-text');
      body.append(el('strong', null, r.title), el('span', 'sn-body', r.body), el('time', 'sn-time', when(r.time)));
      row.append(body);
      list.append(row);
    }
    const perm = panel.querySelector('.sn-perm');
    const st = desktopState();
    perm.hidden = st !== 'default';
    panel.querySelector('.sn-clear').disabled = !history.length;
  }
  /** A moment in the chosen language ("26 okt. 2026 14:05"); the browser's own format without SlopI18n. */
  const when = (ms) => (window.SlopI18n ? window.SlopI18n.date(ms, { dateStyle: 'medium', timeStyle: 'short' }) : new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
  function openPanel(open) {
    if (!panel) return;
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) { renderPanel(); unread = 0; history.forEach((r) => { r.read = true; }); save(); renderBell(); }
  }
  /** Adds the bell button to a container element and builds the history panel (once). */
  function mountBell(container) {
    if (bell) return bell;
    bell = el('button', 'sh-hbtn slop-hbtn sn-bell');
    bell.type = 'button';
    bell.setAttribute('aria-expanded', 'false');
    bell.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg><span class="sn-count" hidden></span>';
    bell.addEventListener('click', (e) => { e.stopPropagation(); openPanel(panel.hidden); });
    container.append(bell);
    panel = el('div', 'sn-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', tx('shell.notifications'));
    panel.setAttribute('data-i18n-attr', 'aria-label:shell.notifications');
    panel.innerHTML = '<div class="sn-phead"><span data-i18n="shell.notifications">Notifications</span><button type="button" class="sn-clear" data-i18n="shell.clear_all">Clear all</button></div><div class="sn-list"></div><div class="sn-perm" hidden><p data-i18n="ui.shell.alerts_why">Get alerts when this page is in the background.</p><button type="button" class="sn-ask" data-i18n="ui.shell.alerts_on">Turn on desktop alerts</button></div>';
    panel.querySelector('.sn-clear').addEventListener('click', clearAll);
    panel.querySelector('.sn-ask').addEventListener('click', () => { askDesktop(); });
    document.body.append(panel);
    if (window.SlopI18n) window.SlopI18n.apply(panel);
    document.addEventListener('pointerdown', (e) => { if (!panel.hidden && !panel.contains(e.target) && !bell.contains(e.target)) openPanel(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) openPanel(false); });
    renderBell();
    window.addEventListener('slop-lang', renderBell);
    window.addEventListener('slopi18n', renderBell);   // and again once the language's tables are in (lazy)
    return bell;
  }
  function clearAll() {
    history = [];
    actions.clear();
    unread = 0;
    save();
    if (stack) stack.textContent = '';
    emit();
  }
  function askDesktop() {
    if (!hasNative() || Notification.permission !== 'default') return Promise.resolve(desktopState());
    return Notification.requestPermission().then((p) => { emit(); return p; }, () => desktopState());
  }

  history = load();
  unread = 0;
  window.SlopNotify = {
    show, dismiss, mountBell, askDesktop, desktopState,
    history: () => history.slice(),
    clear() { clearAll(); },
    unread: () => unread,
    markRead() { unread = 0; history.forEach((r) => { r.read = true; }); save(); emit(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
