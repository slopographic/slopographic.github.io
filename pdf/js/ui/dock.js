/* Slop PDF — the sidebar dock: collapsible panels under the tool's properties (Layers, History). Each section has a
   header button (aria-expanded) that opens or closes its body. A section renders its body only while it is open, and
   re-renders on every panel refresh (SP.panels.refresh). Open state is kept for the session only. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, h = U.h;
  var D = SP.dock = {};
  var sections = [], host = null;

  /** Adds a section: { id, title (text, or a function giving it in the current language), open (default false), render(body),
   * meta() -> text for the header }. */
  D.add = function (o) {
    var s = { id: o.id, title: o.title, open: !!o.open, render: o.render, meta: o.meta || null, el: null };
    sections.push(s);
    if (host) build(s);
    return s;
  };
  /** Puts the dock at the bottom of the properties sidebar root (ui/panel-kit.js calls this once). */
  D.mount = function (root) {
    if (host || !root) return;
    host = h('div', { class: 'pp-dock' });
    root.appendChild(host);
    sections.forEach(build);
  };
  function titleOf(s) { return typeof s.title === 'function' ? s.title() : s.title; }
  function build(s) {
    var body = h('div', { class: 'pp-dock-body', id: 'dock-' + s.id, role: 'region', 'aria-label': titleOf(s), hidden: !s.open });
    var meta = h('span', { class: 'pp-dock-meta' });
    var head = h('button', { type: 'button', class: 'pp-dock-h', 'aria-expanded': s.open ? 'true' : 'false', 'aria-controls': 'dock-' + s.id },
      h('span', { class: 'pp-dock-chev', 'aria-hidden': 'true' }), h('span', { class: 'pp-dock-t' }, titleOf(s)), meta);
    head.addEventListener('click', function () {
      D.setOpen(s.id, !s.open);
      if (D.onToggle) D.onToggle(s.id, s.open);
    });
    var wrap = h('section', { class: 'pp-dock-sec', 'data-dock': s.id }, head, body);
    host.appendChild(wrap);
    s.el = { head: head, body: body, meta: meta };
    renderOne(s);
  }
  function renderOne(s) {
    if (!s.el) return;
    if (s.meta) s.el.meta.textContent = s.meta();
    if (s.open && s.render) {
      var keep = focusKey(s.el.body);
      s.el.body.innerHTML = '';
      s.render(s.el.body);
      restoreFocus(s.el.body, keep);
    }
  }
  /** Keeps keyboard focus on the same control when a body re-renders (a control has data-key). */
  function focusKey(body) { var a = document.activeElement; return a && body.contains(a) && a.getAttribute('data-key') ? a.getAttribute('data-key') : null; }
  function restoreFocus(body, key) {
    if (!key) return;
    var el = Array.prototype.find.call(body.querySelectorAll('[data-key]'), function (x) { return x.getAttribute('data-key') === key; });
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  /** Opens or closes a section by id (a link's ?panel=). Returns false when there is no such section. */
  D.setOpen = function (id, on) {
    var s = sections.filter(function (x) { return x.id === id; })[0];
    if (!s) return false;
    s.open = !!on;
    if (s.el) { s.el.head.setAttribute('aria-expanded', s.open ? 'true' : 'false'); s.el.body.hidden = !s.open; }
    renderOne(s);
    return true;
  };
  /** Re-renders the open sections (called on every change through SP.panels.refresh). */
  D.refresh = function () { sections.forEach(renderOne); };
  /** A language switch (ui/panel-kit.js): the headers take their titles again and the open bodies re-render. */
  D.relabel = function () {
    sections.forEach(function (s) {
      if (!s.el) return;
      var tt = s.el.head.querySelector('.pp-dock-t'); if (tt) tt.textContent = titleOf(s);
      s.el.body.setAttribute('aria-label', titleOf(s));
      renderOne(s);
    });
  };
})();
