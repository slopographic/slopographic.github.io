/* Slop Docs — ui/objects: the actions on tables (rows, columns, the table), images (wrap, delete) and page
 * breaks. Each one is a pure op from the model (model/table-ops.js, model/ops.js) followed by SlopDocs.edit(),
 * like the text actions in ui/actions.js. The context menus (ui/ctxmenu.js) and the commands call these. */
(function () {
  'use strict';
  const S = window.SlopDocs, A = S.A;
  const E = () => window.SlopDocEngine;
  const O = () => E().O, TB = () => E().TB;
  const cur = () => S.doc.blocks;

  /** Puts the caret on the first paragraph at or after block bi (a table cannot hold the caret). */
  function caretNear(blocks, bi) {
    let i = Math.min(Math.max(0, bi), blocks.length - 1);
    while (i > 0 && blocks[i] && blocks[i].type !== 'p') i--;
    if (!blocks[i] || blocks[i].type !== 'p') i = blocks.findIndex((b) => b.type === 'p');
    const pos = { b: Math.max(0, i), o: 0 };
    return { a: pos, f: pos };
  }
  const tableEdit = (fn, kind = 'table') => {
    const blocks = fn();
    if (blocks) S.edit(blocks, S.sel, kind);
    return !!blocks;
  };

  A.tableRow = (bi, r, after) => tableEdit(() => TB().insertRow(cur(), bi, r, after));
  A.tableRowDelete = (bi, r) => tableEdit(() => TB().deleteRow(cur(), bi, r));
  A.tableCol = (bi, c, after) => tableEdit(() => TB().insertCol(cur(), bi, c, after));
  A.tableColDelete = (bi, c) => tableEdit(() => TB().deleteCol(cur(), bi, c));
  A.tableDelete = (bi) => {
    const blocks = TB().deleteTable(cur(), bi);
    if (blocks) S.edit(blocks, caretNear(blocks, bi), 'table');
    return !!blocks;
  };

  /** Finds the image run that starts at offset off in paragraph bi. */
  function imageRun(bi, off) {
    const p = cur()[bi];
    if (!p || p.type !== 'p') return null;
    let o = 0;
    for (let i = 0; i < (p.runs || []).length; i++) {
      const r = p.runs[i];
      if (o === off && r.obj === 'img') return { p, i };
      o += r.text.length;
    }
    return null;
  }
  /** The image run at (bi, off), or null: its wrap tells the image menu which option to tick. */
  A.imageAt = (bi, off) => { const h = imageRun(bi, off); return h ? h.p.runs[h.i] : null; };
  /** Sets how the inline or floating image at (bi, off) wraps ('inline', 'left' or 'right'), or deletes it (wrap null). */
  A.imageEdit = function (bi, off, wrap) {
    const hit = imageRun(bi, off);
    if (!hit) return false;
    const { p, i } = hit;
    const runs = wrap === null ? p.runs.filter((_, j) => j !== i) : p.runs.map((r, j) => (j === i ? { ...r, wrap } : r));
    const blocks = cur().map((b, j) => (j === bi ? { ...p, runs: O().normRuns(runs) } : b));
    const len = O().normRuns(runs).reduce((n, r) => n + r.text.length, 0), at = Math.min(S.sel.f.b === bi ? S.sel.f.o : 0, len);
    const pos = { b: bi, o: at };
    S.edit(blocks, wrap === null ? { a: pos, f: pos } : S.sel, 'object');
    return true;
  };

  /** Inserts a page break at the caret. */
  A.pageBreak = function () {
    const r = O().replaceText(cur(), S.sel, '￼', { obj: 'pb' });
    S.edit(r.blocks, { a: r.pos, f: r.pos }, 'type');
  };
})();
