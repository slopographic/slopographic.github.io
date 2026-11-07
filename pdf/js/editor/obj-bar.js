/* Slop PDF — the actions of a selected page object, in the shared selection bar (sel-bar.js, SlopSelBar.provide): Arrange
   (bring to front, forward, backward, to back), Turn 90°, Duplicate, Replace image… (keeps its place, fitted to the new
   picture's shape), Save image, Open in… (SlopOuttake: PhotoSlop for pictures, SlopVector for SVG …) and Delete. Each
   change is one content rewrite through S.objCommit (obj-derive.js), one undo step. The arrow keys nudge (1 pt, Shift
   10 pt; a run of presses is one step), Delete deletes, Escape lets go (commands in ui/commands.js). Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, S = Ed._, O = S.obj, Ob = window.SlopPdfObjs, Mv = window.SlopPdfMove;
  var N = O.act = {}, pop = null, arrangeBtn = null;
  var ORDER = { front: 'pdf.ed.obj_front', forward: 'pdf.ed.obj_forward', backward: 'pdf.ed.obj_backward', back: 'pdf.ed.obj_back' };

  function run(fn) { return Promise.resolve().then(fn).catch(function (err) { console.error(err); SlopUI.toast(U.t('pdf.ed.op_failed', { err: String((err && err.message) || '') })); }); }
  function cur() { var p = Ed.page(), o = O.selected(); return p && o ? { p: p, o: o } : null; }
  /** An edit of the selected object (or of t: { p, o }), one undo step, then the same object is selected again on the new
   * content. Resolves that object (or true), false when nothing changed. */
  async function change(edit, label, want, t) {
    var c = t || cur(); if (!c) return false;
    SP.app.status(label + '…');
    var to = await S.objCommit(c.p, Object.assign({ id: c.o.id }, edit), label);
    SP.app.status('');
    if (!to) { SlopUI.toast(U.t(edit.op === 'order' ? 'pdf.ed.obj_already_there' : 'pdf.ed.obj_not_changed')); return false; }
    if (want === null) { O.select(null); return true; }
    return (await O.follow(c.p.id, c.o, want || c.o.box)) || true;
  }
  N.order = function (dir, t) { var c = t || cur(); return c && change({ op: 'order', dir: dir }, U.t(ORDER[dir]), undefined, c); };
  N.remove = function (t) { var c = t || cur(); return c && change({ op: 'delete' }, U.t('pdf.ed.undo_delete_obj', { what: O.label(c.o) }), null, c); };
  N.duplicate = function (t) {
    var c = t || cur(); if (!c) return;
    var T = Mv.move(12, -12), b = c.o.box;
    return change({ op: 'duplicate', T: T }, U.t('pdf.ed.undo_duplicate_obj', { what: O.label(c.o) }), [b[0] + 12, b[1] - 12, b[2] + 12, b[3] - 12], c);
  };
  /** Turns the object by deg (clockwise on the page as shown) about its centre. */
  N.turn = function (deg) {
    var c = cur(); if (!c) return;
    var r = O.rect(c.p, c.o);
    return O.apply(c.p, c.o, Mv.rotateAbout(deg, r.x + r.w / 2, r.y + r.h / 2), 'pdf.ed.undo_turn_obj');
  };
  /** Moves the object by dx, dy points on the page as shown; presses within 0.5 s become one step. */
  var nudge = null;
  N.nudge = function (dx, dy) {
    var c = cur(); if (!c) return;
    var R = E.rotation(c.p), g = E.geom(c.p), a = E.toPage(R, g.W, g.H, 0, 0), b = E.toPage(R, g.W, g.H, dx, dy);
    if (!nudge || nudge.id !== c.o.id) nudge = { id: c.o.id, p: c.p, o: c.o, d: [0, 0], ghost: null };
    nudge.d[0] += b[0] - a[0]; nudge.d[1] += b[1] - a[1];
    var lay = document.querySelector('.obj-layer'), r = O.rect(c.p, c.o), z = Ed.zoom;
    if (lay && !nudge.ghost) { nudge.ghost = U.h('div', { class: 'obj-nudge', 'aria-hidden': 'true' }); lay.appendChild(nudge.ghost); }
    if (nudge.ghost) { nudge.ghost.style.left = (r.x + nudge.d[0]) * z + 'px'; nudge.ghost.style.top = (r.y + nudge.d[1]) * z + 'px'; nudge.ghost.style.width = r.w * z + 'px'; nudge.ghost.style.height = r.h * z + 'px'; }
    clearTimeout(nudge.t);
    nudge.t = setTimeout(function () { var n = nudge; nudge = null; if (n.ghost) n.ghost.remove(); O.apply(n.p, n.o, Mv.move(n.d[0], n.d[1]), 'pdf.ed.undo_move_obj'); }, 500);
  };
  /** Replace image…: a picture through the shared intake (spec 'pdf.objimage'), painted in the old one's place. */
  N.replace = function () { var c = cur(); if (c) SlopIntake.pick({ to: 'pdf.objimage', multiple: false, mode: 'add' }); };
  N.replaceWith = async function (file, t) {
    var c = t || cur(); if (!c) return false;
    if (c.o.kind !== 'image' && c.o.kind !== 'inline') { SlopUI.toast(U.t('pdf.ed.obj_only_image')); return false; }
    var im = await E.prepareImage(await U.readFile(file));
    return change({ op: 'replace', image: { mime: im.mime, url: U.bytesToDataURL(im.bytes, im.mime), w: im.w, h: im.h } }, U.t('pdf.ed.undo_replace_image'), undefined, c);
  };
  N.save = async function () {
    var c = cur(); if (!c) return;
    var f = await O.file(c.p, c.o);
    U.download(f.blob, f.name, f.type);
    SlopUI.toast(U.t('pdf.ed.obj_saved', { name: f.name }));
  };
  /** Open in…: the object as a file for the apps that take it (a picture for PhotoSlop, SVG for SlopVector). */
  N.openIn = function (at) {
    var c = cur(); if (!c || !window.SlopOuttake) return;
    var vec = c.o.kind === 'form' || c.o.kind === 'vector', made = null;
    var get = function () { return (made = made || O.file(c.p, c.o)).then(function (f) { return f.blob; }); };
    SlopOuttake.menu(at, { get: get, type: vec ? 'image/svg+xml' : 'image/png', from: 'pdf',
      name: function () { return (vec ? 'artwork' : 'image') + '-p' + (E.indexOf(c.p.id) + 1) + (vec ? '.svg' : '.png'); } });
  };

  SlopIntake.register({
    id: 'pdf.objimage', main: false, toast: false,
    accept: { types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], get noun() { return U.t('pdf.ed.noun_picture'); } },
    hasOpen: function () { return !!cur(); }, openName: function () { return U.t('pdf.ed.open_name_image'); },
    onAdd: function (files) { return files[0] ? run(function () { return N.replaceWith(files[0]); }) : null; },
  });

  /* ------------------------------------------------------------ the bar's row */
  /** A bar button labelled by key (text, aria-label and title follow a language switch); extra.tip: a key for the title. */
  function btn(h, id, key, fn, extra) {
    extra = Object.assign({}, extra || {}); var tip = extra.tip || key; delete extra.tip;
    var b = h('button', Object.assign({ type: 'button', class: 'selbar-btn', 'data-act': 'obj-' + id, 'aria-label': U.t(key), title: U.t(tip),
      'data-i18n': key, 'data-i18n-attr': 'aria-label:' + key + ';title:' + tip }, extra), U.t(key));
    if (fn) b.addEventListener('click', function () { run(function () { return fn.length ? fn(b) : fn(); }); });
    return b;
  }
  function closePop() { if (pop) { pop.hidden = true; arrangeBtn.setAttribute('aria-expanded', 'false'); } }
  function build(h) {
    var sep = function () { return h('span', { class: 'selbar-sep', 'aria-hidden': 'true' }); };
    arrangeBtn = btn(h, 'arrange', 'pdf.ed.obj_arrange', null, { 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    arrangeBtn.addEventListener('click', function () { var open = pop.hidden; closePop(); if (open) { pop.hidden = false; arrangeBtn.setAttribute('aria-expanded', 'true'); pop.querySelector('button').focus(); } });
    pop = h('div', { class: 'selbar-pop obj-pop', role: 'menu', 'aria-label': U.t('pdf.ed.obj_arrange'), 'data-i18n-attr': 'aria-label:pdf.ed.obj_arrange', hidden: true },
      ['front', 'forward', 'backward', 'back'].map(function (k) { return [k, ORDER[k]]; }).map(function (d) {
        var b = h('button', { type: 'button', class: 'selbar-btn', role: 'menuitem', 'data-act': 'obj-' + d[0], 'data-i18n': d[1] }, U.t(d[1]));
        b.addEventListener('click', function () { closePop(); run(function () { return N.order(d[0]); }); });
        return b;
      }));
    document.addEventListener('pointerdown', function (e) { if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== arrangeBtn) closePop(); }, true);
    var row = h('div', { class: 'selbar-row obj-row' },
      arrangeBtn, btn(h, 'turn', 'pdf.ed.obj_turn90', function () { return N.turn(90); }), btn(h, 'duplicate', 'ui.duplicate', function () { return N.duplicate(); }), sep(),
      btn(h, 'replace', 'pdf.ed.obj_replace_image', function () { return N.replace(); }), btn(h, 'save', 'pdf.ed.obj_save_image', function () { return N.save(); }), btn(h, 'open', 'pdf.ed.obj_open_in', function (b) { return N.openIn(b); }), sep(),
      btn(h, 'delete', 'ui.delete', function () { return N.remove(); }, { tip: 'pdf.ed.delete_tip', 'aria-keyshortcuts': 'Delete', class: 'selbar-btn is-danger' }), pop);
    return row;
  }
  function refresh(row) {
    var o = O.selected(), pic = o && (o.kind === 'image' || o.kind === 'inline');
    row.querySelector('[data-act="obj-replace"]').hidden = !pic;
    var sv = row.querySelector('[data-act="obj-save"]');
    var k = pic ? 'pdf.ed.obj_save_image' : 'pdf.ed.obj_save_svg';
    sv.textContent = U.t(k); sv.setAttribute('data-i18n', k); sv.setAttribute('data-i18n-attr', 'aria-label:' + k + ';title:' + k);
    sv.setAttribute('aria-label', sv.textContent); sv.title = sv.textContent;
  }
  /** The selection box on screen (client px), from the selected object's outline. */
  function box() { // the turn handle above the box is part of it, so the bar does not cover it
    var el = document.querySelector('.obj-layer .obj-box'), rot = document.querySelector('.obj-layer .obj-rot');
    if (!el) return null;
    var r = el.getBoundingClientRect(), t = rot ? Math.min(r.top, rot.getBoundingClientRect().top - 4) : r.top;
    return { left: r.left, top: t, right: r.right, bottom: r.bottom };
  }
  function provide() {
    if (!window.SlopSelBar || !SlopSelBar.provide) return;
    SlopSelBar.provide({ id: 'obj', label: function () { var o = O.selected(); return U.t('pdf.ed.obj_selected', { what: o ? O.label(o) : U.t('pdf.ed.obj_kind_object') }); },
      active: function () { return O.live() && !!O.selected() && SP.app.mode === 'page'; }, box: box, build: build, refresh: refresh,
      dismiss: function () { closePop(); O.select(null); } });
  }
  provide();
  var draw = O.paint;
  O.paint = function () { var r = draw.apply(this, arguments); if (window.SlopSelBar && SlopSelBar.place) SlopSelBar.place(); return r; };
})();
