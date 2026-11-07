/* Slop PDF — undo and redo. Every change goes through E.commit, which records the difference between the
   document before and after the change as one command (page objects by id, the page order, and the
   document-level keys such as meta, stamps and forms). A command has do() and undo(). Stacks are per open
   document, capped at 300 steps. Commands are plain data, so ui/… and io/edit-log.js can save them. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var H = SP.history = {};
  var MAX = 300;
  var undoS = [], redoS = [], lastKey = null, lastT = 0;
  /** The chosen language's text for a key, else the English given (tests load this file without the tables). */
  function tr(k, en, v) { var I = window.SlopI18n; if (I && I.has && I.has(k)) return I.t(k, v); return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; }); }

  function clone(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
  /** File id a page id belongs to. Base pages are "<fileId>.<index>", duplicates "<id>#<uid>", blank pages have no dot. */
  H.owner = function (id) { var m = /^[^.#]+/.exec(id); return m && E.files.has(m[0]) ? m[0] : null; };

  /** Difference between two document states (plain objects), or null when nothing changed. */
  H.diff = function (pre, post) {
    var a = new Map(), b = new Map(), ch = {}, top = {}, ord = null;
    pre.pages.forEach(function (p) { a.set(p.id, p); });
    post.pages.forEach(function (p) { b.set(p.id, p); });
    new Set([].concat(Array.from(a.keys()), Array.from(b.keys()))).forEach(function (id) {
      var x = a.get(id) || null, y = b.get(id) || null;
      if (JSON.stringify(x) !== JSON.stringify(y)) ch[id] = [x, clone(y)];
    });
    var pi = pre.pages.map(function (p) { return p.id; }), qi = post.pages.map(function (p) { return p.id; });
    if (pi.join('\n') !== qi.join('\n')) ord = [pi, qi];
    new Set(Object.keys(pre).concat(Object.keys(post))).forEach(function (k) {
      if (k === 'pages') return;
      var x = pre[k] === undefined ? null : pre[k], y = post[k] === undefined ? null : post[k];
      if (JSON.stringify(x) !== JSON.stringify(y)) top[k] = [x, clone(y)];
    });
    if (!Object.keys(ch).length && !ord && !Object.keys(top).length) return null;
    return { ch: ch, ord: ord, top: top, scope: null };
  };
  /** Wraps plain command data with do() and undo(). */
  H.make = function (label, d) {
    var c = { label: label, ch: d.ch || {}, ord: d.ord || null, top: d.top || {}, scope: d.scope || null };
    c.do = function () { H.apply(E.state, c, 1); };
    c.undo = function () { H.apply(E.state, c, 0); };
    return c;
  };
  /** Applies one side (0 = before, 1 = after) of a command to a state in place. Scoped commands (replayed
      from the saved log) only replace the pages of their file, so other files keep their places. */
  H.apply = function (st, cmd, side) {
    var byId = new Map(st.pages.map(function (p) { return [p.id, p]; }));
    Object.keys(cmd.ch).forEach(function (id) { var v = cmd.ch[id][side]; if (v === null) byId.delete(id); else byId.set(id, clone(v)); });
    Object.keys(cmd.top).forEach(function (k) { st[k] = clone(cmd.top[k][side]); });
    var sc = cmd.scope;
    var inScope = function (id) { var o = H.owner(id); return sc ? o === sc.file || (sc.blank && o === null) : true; };
    var list = cmd.ord ? cmd.ord[side] : st.pages.filter(function (p) { return inScope(p.id); }).map(function (p) { return p.id; });
    if (!sc) { st.pages = list.filter(function (id) { return byId.has(id); }).map(function (id) { return byId.get(id); }); return; }
    var keep = st.pages.filter(function (p) { return !inScope(p.id); }), kept = new Set(keep.map(function (p) { return p.id; }));
    var first = st.pages.findIndex(function (p) { return inScope(p.id); });
    var at = first < 0 ? keep.length : st.pages.slice(0, first).filter(function (p) { return !inScope(p.id); }).length;
    var ins = list.filter(function (id) { return byId.has(id) && !kept.has(id); }).map(function (id) { return byId.get(id); });
    st.pages = keep.slice(0, at).concat(ins, keep.slice(at));
  };
  function push(c) { undoS.push(c); if (undoS.length > MAX) undoS.shift(); redoS.length = 0; }
  function mergeInto(c, d) {
    Object.keys(d.ch).forEach(function (id) { var old = c.ch[id]; c.ch[id] = [old ? old[0] : d.ch[id][0], d.ch[id][1]]; });
    if (d.ord) c.ord = [c.ord ? c.ord[0] : d.ord[0], d.ord[1]];
    Object.keys(d.top).forEach(function (k) { var old = c.top[k]; c.top[k] = [old ? old[0] : d.top[k][0], d.top[k][1]]; });
  }

  /** The one way to change the document. fn(state) edits E.state; coalesce merges repeated edits within 1.5 s. */
  E.commit = function (label, fn, coalesce) {
    var now = Date.now(), pre = JSON.parse(JSON.stringify(E.state));
    var r = fn(E.state);
    var d = H.diff(pre, E.state);
    var merge = !!(coalesce && coalesce === lastKey && now - lastT < 1500 && undoS.length);
    if (d) { if (merge) mergeInto(undoS[undoS.length - 1], d); else push(H.make(label, d)); }
    lastKey = coalesce || null; lastT = now;
    E.emit('change', { label: label });
    return r;
  };
  /** Pushes a command that was already applied (used when a saved log is replayed). */
  H.push = push;
  E.undo = function () {
    var c = undoS.pop(); if (!c) return null;
    c.undo(); redoS.push(c); lastKey = null;
    E.emit('change', { label: tr('ui.undo_what', 'Undo {what}', { what: c.label }), history: true });
    return c.label;
  };
  E.redo = function () {
    var c = redoS.pop(); if (!c) return null;
    c.do(); undoS.push(c); lastKey = null;
    E.emit('change', { label: tr('ui.redo_what', 'Redo {what}', { what: c.label }), history: true });
    return c.label;
  };
  E.canUndo = function () { return undoS.length > 0; };
  E.canRedo = function () { return redoS.length > 0; };
  E.undoLabel = function () { return undoS.length ? undoS[undoS.length - 1].label : ''; };
  E.redoLabel = function () { return redoS.length ? redoS[redoS.length - 1].label : ''; };
  E.resetHistory = function () { undoS = []; redoS = []; lastKey = null; };
  E.endCoalesce = function () { lastKey = null; };
  /** One history per open tab: switches the active stacks to those of `key` (a tab adapter calls this on switch). */
  var stacks = {}, curKey = 'doc';
  H.useStack = function (key) {
    if (key === curKey) return;
    if (undoS.length || redoS.length) stacks[curKey] = { u: undoS, r: redoS }; else delete stacks[curKey];
    var s = stacks[key] || { u: [], r: [] };
    undoS = s.u; redoS = s.r; lastKey = null; curKey = key;
  };
  H.stackKey = function () { return curKey; };
  /** Undo steps under a key: the open tab's own stack, or a stored one. */
  H.depth = function (key) { return key === curKey ? undoS.length : (stacks[key] ? stacks[key].u.length : 0); };
  /** Forgets the stored stack of a closed tab. */
  H.dropStack = function (key) {
    if (key === curKey) { undoS = []; redoS = []; lastKey = null; } else delete stacks[key];
  };
  /** The applied commands, oldest first (read-only use). */
  H.entries = function () { return undoS.slice(); };
  /** The steps for the History panel: the labels of the applied steps (oldest first) and of the undone ones (the next
      redo first). */
  H.steps = function () {
    return { past: undoS.map(function (c) { return c.label; }), future: redoS.slice().reverse().map(function (c) { return c.label; }) };
  };
  /** Moves the document to the state after n applied steps (0 is the state before the first one) by undoing or redoing. */
  H.goTo = function (n) {
    while (undoS.length > n && E.undo()) { /* each undo emits a change */ }
    while (undoS.length < n && redoS.length && E.redo()) { /* each redo emits a change */ }
  };
})();
