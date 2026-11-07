/* Slop PDF for the assistant and macros (WebMCP through SlopCmd): the page's own text as blocks (pdf.text.*: list, select,
   edit, move, resize, rotate: the select tool's frames, editor/select-edit.js and para-*.js, so the text keeps its font,
   size and colour), annotations moved, sized and turned (pdf.annot.transform), copy / cut / paste in place / paste on
   pages (pdf.clip.*, editor/clip.js) and moving or copying an annotation to another page (pdf.annot.to-page,
   editor/cross-page.js). One undo step each. Positions are points from the top-left of the page as shown (a block's are
   page space, the same on an unturned page). Loaded on demand after ai-objects.js. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, Ed = SP.editor, S = Ed._, P = S.para, X = SP.aiPdf, C = window.SlopCmd, Num = X.Num, Str = X.Str, list = [];
  var BLOCK = Str('block', 'a block id from list_text_blocks: block:<n> for page text, or the id of a paragraph frame', { required: true, maxLength: 60 });
  var r1 = function (v) { return Math.round(v * 10) / 10; };
  function add(tool, id, title, args, run, extra) {
    list.push(Object.assign({ id: id, tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      run: function (a) { return run(a || SlopCmdArgs.defaults(args)); } }, extra || {}));
  }
  /** Shows page t in the page view (the frames live there). */
  async function onPage(t) {
    if (SP.app.mode !== 'page' || Ed.pid !== t.p.id) SP.app.openPage(t.p.id, true);
    for (var k = 0; k < 100 && !(S.slots.get(t.p.id) && Ed.pid === t.p.id); k++) await new Promise(function (r) { setTimeout(r, 30); });
    if (Ed.tool !== 'select') Ed.setTool('select');
    if (Ed.editText) Ed.toggleEditText();
    if (Ed.objMode) Ed.toggleObjects(false);
  }
  async function blocks(p) { return (await P.blocksOf(p)).slice().sort(function (a, b) { return a.top - b.top || a.x0 - b.x0; }); }
  function textOfBlock(b) { return b.lines.map(function (l) { return l.items.map(function (i) { return i.str; }).join(''); }).join('\n'); }
  /** Selects a block (page text or a frame) of page t: resolves the frame's selection, ready. */
  async function pick(a) {
    var t = X.page(a.page); await E.libs(); await onPage(t);
    var m = /^block:(\d+)$/.exec(a.block), sel;
    if (m) {
      var bs = await blocks(t.p), b = bs[+m[1]];
      if (!b) throw new Error('There is no ' + a.block + ' on page ' + (t.i + 1) + ': list_text_blocks lists them'); // i18n-ignore: API (English for the assistant)
      sel = P.selectBlocks(t.p, [b], true);
    } else {
      var an = t.p.annots.filter(function (x) { return x.id === a.block && x.type === 'para'; })[0];
      if (!an) throw new Error('There is no paragraph frame ' + a.block + ' on page ' + (t.i + 1)); // i18n-ignore: API (English for the assistant)
      sel = P.selectAnnot(t.p, an, true);
    }
    if (!(await sel.ready) || P.sel !== sel || !P.base(sel)) throw new Error('The text could not be set up for editing');
    return { t: t, sel: sel };
  }
  function done(t) { var b = P.sel && P.base(P.sel); return b ? 'Done on page ' + (t.i + 1) + '. The block is now ' + b.id + ' at ' + JSON.stringify({ x: r1(b.cx - b.w / 2), y: r1(b.cy - b.h / 2), width: r1(b.w), height: r1(b.h), rotation: r1(-(b.rot || 0)) }) + '.' : 'Done.'; } // i18n-ignore: API (English for the assistant)
  async function change(a, fn, label) { var k = await pick(a); await P.change(fn, label); return done(k.t); }

  add('list_text_blocks', 'pdf.text.list', 'List the text blocks on a page', [X.PAGE], async function (a) { // i18n-ignore: API (English for the assistant)
    var t = X.page(a.page); await E.libs();
    var bs = await blocks(t.p), out = bs.map(function (b, i) {
      var it = b.lines[0] && b.lines[0].items[0];
      return { id: 'block:' + i, text: textOfBlock(b).slice(0, 400), x: r1(b.x0), y: r1(b.top), width: r1(b.x1 - b.x0), height: r1(b.bottom - b.top), font: it ? it.family || it.style : null, size: r1(b.fs), align: b.align };
    });
    t.p.annots.filter(function (x) { return x.type === 'para'; }).forEach(function (x) {
      out.push({ id: x.id, frame: true, text: x.paras.map(function (pr) { return pr.map(function (r) { return r.t; }).join(''); }).join('\n').slice(0, 400), x: r1(x.cx - x.w / 2), y: r1(x.cy - x.h / 2), width: r1(x.w), height: r1(x.h), size: r1(x.fs), color: x.color, align: x.align, rotation: r1(-(x.rot || 0)) });
    });
    return { page: t.i + 1, blocks: out };
  }, { description: 'The page\'s own text as paragraph blocks (ids, text, box, font, size), and the paragraph frames already edited.' }); // i18n-ignore: API (English for the assistant)
  add('select_text_block', 'pdf.text.select', 'Select a text block (shows its frame and handles)', [X.PAGE, BLOCK], async function (a) { var k = await pick(a); return done(k.t); }); // i18n-ignore: API (English for the assistant)
  add('edit_text_block', 'pdf.text.edit', 'Replace the text of a block, keeping its font, size and colour', [X.PAGE, BLOCK, Str('text', 'the new text; a line break starts a new paragraph', { required: true, maxLength: 20000 })], async function (a) { // i18n-ignore: API (English for the assistant)
    var k = await pick(a), p = k.t.p, sel = k.sel, m = P.clone(P.base(sel));
    m.paras = String(a.text).split('\n').map(function (t) { return t ? [{ t: t, s: 0 }] : []; });
    await P.reloadInfos(p, m); await P.readyText(m); P.relayout(m);
    P.commit(p, sel, m, SP.util.t('pdf.ed.undo_edit_para'));
    return done(k.t);
  });
  add('move_text_block', 'pdf.text.move', 'Move a text block', [X.PAGE, BLOCK, Num('x', 'new left edge (points)', -14400, 14400), Num('y', 'new top edge (points)', -14400, 14400), // i18n-ignore: API (English for the assistant)
    Num('dx', 'or move right by', -14400, 14400), Num('dy', 'or move down by', -14400, 14400)], function (a) { // i18n-ignore: API (English for the assistant)
    return change(a, function (m) { m.cx = a.x != null ? a.x + m.w / 2 : m.cx + (a.dx || 0); m.cy = a.y != null ? a.y + m.h / 2 : m.cy + (a.dy || 0); }, SP.util.t('pdf.ed.undo_move_para'));
  });
  add('resize_text_block', 'pdf.text.resize', 'Change a text block\'s width (the text rewraps) or scale it', [X.PAGE, BLOCK, Num('width', 'new width in points (the text rewraps)', 4, 14400), Num('scale', 'or scale the text and frame by (1 = as is)', 0.05, 20)], function (a) { // i18n-ignore: API (English for the assistant)
    return change(a, function (m) { var left = m.cx - m.w / 2; if (a.scale) P.scale(m, a.scale); if (a.width) m.w = a.width; P.relayout(m); m.cx = left + m.w / 2; }, SP.util.t('pdf.ed.undo_resize_para'));
  });
  add('rotate_text_block', 'pdf.text.rotate', 'Turn a text block', [X.PAGE, BLOCK, Num('degrees', 'clockwise, about its centre', -360, 360, { default: 90 })], function (a) { // i18n-ignore: API (English for the assistant)
    return change(a, function (m) { m.rot = window.SlopPdfXform.norm(-a.degrees); }, SP.util.t('pdf.se.undo_turn_para'));
  });

  var ANNOT = Str('annotation', 'an annotation id (get_state lists them)', { required: true, maxLength: 60 }); // i18n-ignore: API (English for the assistant)
  function annotOn(a) { var t = X.page(a.page), x = t.p.annots.filter(function (y) { return y.id === a.annotation; })[0]; if (!x) throw new Error('There is no annotation ' + a.annotation + ' on page ' + (t.i + 1)); return { t: t, a: x }; } // i18n-ignore: API (English for the assistant)
  add('transform_annotation', 'pdf.annot.transform', 'Move, size or turn an annotation', [X.PAGE, ANNOT, Num('x', 'left edge (points)', -14400, 14400), Num('y', 'top edge', -14400, 14400), // i18n-ignore: API (English for the assistant)
    Num('width', 'points', 1, 14400), Num('height', 'points', 1, 14400), Num('rotation', 'clockwise degrees', -360, 360)], async function (a) { // i18n-ignore: API (English for the assistant)
    var k = annotOn(a); await onPage(k.t); Ed.select(k.a.id);
    var g = E.geom(k.t.p), R = E.rotation(k.t.p), id = k.a.id;
    E.commit(SP.util.t('pdf.se.undo_transform_annot'), function (st) {
      st.pages.forEach(function (q) { q.annots.forEach(function (y) {
        if (q.id !== k.t.p.id || y.id !== id) return;
        if (E.isBox(y) && a.width) y.w = a.width; if (E.isBox(y) && a.height) y.h = a.height;
        if (E.isBox(y) && a.rotation != null) y.rot = window.SlopPdfXform.norm(R - a.rotation);
        var r = E.annotViewRect(y, R, g.W, g.H);
        if (a.x != null || a.y != null) E.setAnnotViewRect(y, { x: a.x != null ? a.x : r.x, y: a.y != null ? a.y : r.y, w: r.w, h: r.h }, R, g.W, g.H);
      }); });
    });
    return 'Changed ' + id + ' on page ' + (k.t.i + 1) + '.'; // i18n-ignore: API (English for the assistant)
  });
  add('move_annotation_to_page', 'pdf.annot.to-page', 'Move or copy an annotation to another page', [X.PAGE, ANNOT, Num('to_page', 'the page it goes to', 1, 100000, { integer: true, required: true }), // i18n-ignore: API (English for the assistant)
    Num('x', 'left edge there (points; empty: the same place)', -14400, 14400), Num('y', 'top edge there', -14400, 14400), { name: 'copy', type: 'boolean', default: false }], function (a) { // i18n-ignore: API (English for the assistant)
    var k = annotOn(a), to = X.page(a.to_page), R0 = E.rotation(k.t.p), g0 = E.geom(k.t.p), r = E.annotViewRect(k.a, R0, g0.W, g0.H);
    var b = JSON.parse(JSON.stringify(k.a)); if (a.copy) b.id = SP.util.uid('a');
    var tgt = { R: E.rotation(to.p), g: E.geom(to.p) }, x = a.x != null ? a.x : r.x, y = a.y != null ? a.y : r.y;
    S.cross.place(b, R0, tgt, [x + r.w / 2, y + r.h / 2]);
    S.cross.commitMove(k.t.p.id, to.p.id, k.a.id, b, !!a.copy);
    return (a.copy ? 'Copied ' : 'Moved ') + k.a.id + ' to page ' + (to.i + 1) + (a.copy ? ' as ' + b.id : '') + '.'; // i18n-ignore: API (English for the assistant)
  });

  add('copy_selection', 'pdf.clip.copy', 'Copy annotations or a text block (for paste)', [X.PAGE, { name: 'annotations', type: 'array', maxItems: 500, items: { type: 'string' }, description: 'annotation ids' }, // i18n-ignore: API (English for the assistant)
    Str('block', 'or a block id from list_text_blocks', { maxLength: 60 }), { name: 'cut', type: 'boolean', default: false }], async function (a) {
    var t = X.page(a.page); await E.libs(); await onPage(t);
    if (a.block) await pick(a);
    else { var ids = (a.annotations || []).filter(function (id) { return t.p.annots.some(function (y) { return y.id === id; }); }); if (!ids.length) throw new Error('Give annotation ids or a block'); if (P.sel) P.clear(); S.groupSet(ids); }
    var n = a.cut ? await Ed.cut() : await Ed.copy();
    return (a.cut ? 'Cut ' : 'Copied ') + n + ' item' + (n === 1 ? '' : 's') + '.'; // i18n-ignore: API (English for the assistant)
  });
  add('paste_in_place', 'pdf.clip.paste', 'Paste what was copied, in the same place', [X.PAGE], async function (a) { // i18n-ignore: API (English for the assistant)
    if (!Ed.canPaste()) throw new Error('Nothing is copied: use copy_selection first');
    var t = X.page(a.page); await onPage(t); var made = Ed.paste([t.p.id]);
    return 'Pasted ' + made.length + ' on page ' + (t.i + 1) + ': ' + made.join(', ') + '.'; // i18n-ignore: API (English for the assistant)
  });
  add('paste_on_pages', 'pdf.clip.paste-pages', 'Paste what was copied on every page or on a page range', [Str('pages', 'a range like 1-3, 5; every page when empty', { maxLength: 200 })], function (a) { // i18n-ignore: API (English for the assistant)
    if (!Ed.canPaste()) throw new Error('Nothing is copied: use copy_selection first');
    var made = Ed.pasteOnPages(a.pages || null);
    return 'Pasted ' + made.length + ' item' + (made.length === 1 ? '' : 's') + '.'; // i18n-ignore: API (English for the assistant)
  });
  C.register(list);
})();
