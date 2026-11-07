/* SlopTour panel: the static step panel (docked at the bottom, a bottom sheet on phones). It shows the step
 * counter, the step text, Back, Skip, Next and Restart, plus a queue of every step to jump to any step.
 * Keys: Left and Right move, Enter goes Next, Escape closes. Keys are ignored while the viewer types in a
 * field, while an app dialog or the command palette is open, or while focus sits on another app control.
 * Classic script. Sets window.SlopTour.panel. */
(function () {
  'use strict';
  const T = (window.SlopTour = window.SlopTour || {});
  /** A word from the shared tables (ui.tour.* in shared/i18n/ui/<code>.js); the key itself without SlopI18n. */
  const tr = (key, vars) => { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; };
  let root = null, list = null, handlers = null, listening = false;
  const parts = {};

  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(cls, fn) {
    const b = mk('button', cls);
    b.type = 'button';
    b.addEventListener('click', () => handlers && fn());
    return b;
  }
  /** The panel's own words, set on every render so they follow a language change (shared/i18n). */
  function words() {
    const set = (b, text, label) => { if (text != null) b.textContent = text; b.setAttribute('aria-label', label); };
    root.setAttribute('aria-label', tr('ui.tour.panel'));
    set(parts.x, null, tr('ui.tour.close'));
    parts.steps.textContent = tr('ui.tour.all_steps');
    set(parts.restart, tr('ui.tour.restart'), tr('ui.tour.restart_aria'));
    set(parts.back, tr('ui.back'), tr('ui.tour.prev_aria'));
    set(parts.skip, tr('ui.tour.skip'), tr('ui.tour.skip_aria'));
    parts.next.setAttribute('aria-label', tr('ui.tour.next_aria'));
  }
  function build() {
    root = mk('section', 'stour-panel');
    root.hidden = true;
    const head = mk('header', 'stour-head');
    parts.name = mk('span', 'stour-name');
    parts.count = mk('span', 'stour-count');
    parts.x = btn('stour-x', () => handlers.close()); parts.x.textContent = '×';
    head.append(parts.name, parts.count, parts.x);
    const bar = mk('div', 'stour-bar'); bar.setAttribute('aria-hidden', 'true');
    parts.fill = mk('i'); bar.append(parts.fill);
    const body = mk('div', 'stour-body');
    parts.title = mk('h2', 'stour-title');
    parts.text = mk('p', 'stour-text');
    parts.hint = mk('p', 'stour-hint'); parts.hint.hidden = true;
    body.append(parts.title, parts.text, parts.hint);
    const queue = mk('details', 'stour-queue'); queue.open = innerWidth > 640;
    parts.steps = mk('summary', ''); queue.append(parts.steps);
    list = mk('ol', 'stour-list');
    queue.append(list);
    const foot = mk('footer', 'stour-foot');
    parts.restart = btn('stour-restart', () => handlers.restart());
    parts.back = btn('stour-back', () => handlers.back());
    parts.skip = btn('stour-skip', () => handlers.skip());
    parts.next = btn('stour-next', () => handlers.next());
    parts.next.textContent = tr('ui.next');
    words();
    foot.append(parts.restart, mk('span', 'stour-spacer'), parts.back, parts.skip, parts.next);
    root.append(head, bar, body, queue, foot);
    document.body.append(root);
  }
  /** Show the panel. handlers: { next, back, skip, jump(i), close, restart }. */
  function open(h) {
    handlers = h;
    if (!root) build();
    root.hidden = false;
    if (!listening) { listening = true; addEventListener('keydown', onKey); }
  }
  function close() {
    handlers = null;
    if (root) root.hidden = true;
    if (listening) { listening = false; removeEventListener('keydown', onKey); }
  }
  /** Paint a view: { name, counter, index, n, title, text, hint, last, steps: [{ title, done }] }. */
  function render(v) {
    if (!root) return;
    const focus = root.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focus && focus.dataset && focus.dataset.i;
    parts.name.textContent = v.name;
    parts.count.textContent = v.counter;
    parts.fill.style.width = ((v.index + 1) / v.n * 100) + '%';
    parts.title.textContent = v.title;
    parts.text.textContent = v.text;
    parts.hint.textContent = v.hint || '';
    parts.hint.hidden = !v.hint;
    parts.back.disabled = v.index === 0;
    words();
    parts.next.textContent = v.last ? tr('ui.tour.finish') : tr('ui.next');
    list.replaceChildren(...v.steps.map((s, i) => {
      const li = mk('li');
      const b = mk('button', 'stour-q' + (i === v.index ? ' is-current' : '') + (s.done ? ' is-done' : ''));
      b.type = 'button'; b.dataset.i = String(i);
      if (i === v.index) b.setAttribute('aria-current', 'step');
      b.append(mk('span', 'stour-mark', s.done ? '✓' : String(i + 1)), mk('span', 'stour-qt', s.title));
      b.addEventListener('click', () => handlers && handlers.jump(i));
      li.append(b);
      return li;
    }));
    if (focusKey != null) {
      const again = list.querySelector('[data-i="' + focusKey + '"]');
      if (again) again.focus({ preventScroll: true });
    }
  }
  function rect() {
    return root && !root.hidden ? root.getBoundingClientRect() : null;
  }
  function otherDialogOpen() {
    const d = document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], .sui-dlg-back:not([hidden])');
    return !!d && !(root && root.contains(d));
  }
  function onKey(e) {
    if (!handlers || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (window.SlopCmd && SlopCmd.isOpen) return;
    const a = document.activeElement;
    if (a && (!!window.SlopTyping && window.SlopTyping.isTyping(a, { controls: true }))) return;   // shared/input/typing.js
    if (otherDialogOpen()) return;
    const bare = !a || a === document.body || a === document.documentElement;
    const inPanel = !!a && root.contains(a);
    const onControl = inPanel && /^(BUTTON|SUMMARY|A)$/.test(a.tagName);
    if (!bare && !inPanel) return;
    if (e.key === 'Escape') { e.preventDefault(); handlers.close(); }
    else if (e.key === 'ArrowRight' && !onControl) { e.preventDefault(); handlers.next(); }
    else if (e.key === 'ArrowLeft' && !onControl) { e.preventDefault(); handlers.back(); }
    else if (e.key === 'Enter' && !onControl) { e.preventDefault(); handlers.next(); }
  }
  T.panel = { open, close, render, rect, get isOpen() { return !!(root && !root.hidden); } };
})();
