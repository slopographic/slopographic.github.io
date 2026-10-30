/* Slop Docs — ui/actions: everything the user does to the text (typing, deleting, moving the caret, marks,
 * paragraph styles, lists, clipboard). Each one is a pure op from the engine followed by SlopDocs.edit(). Classic script;
 * window.SlopDocs.A. Keyboard, toolbar, menus and the command palette all call these. */
(function () {
  'use strict';
  const S = window.SlopDocs, A = (S.A = {});
  const E = () => window.SlopDocEngine;
  const O = () => E().O, M = () => E().M, R = () => S.R;
  const cur = () => S.doc.blocks;
  const isHigh = (t, i) => { const c = t.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff; };
  const isLow = (t, i) => { const c = t.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
  const SIZES = [6, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

  /** Marks for text typed at the caret (or replacing the selection). */
  function baseMarks() {
    if (S.pending) return S.pending;
    const pos = O().collapsed(S.sel) ? S.sel.f : O().ordered(S.sel)[0];
    const p = cur()[pos.b];
    return p && p.type === 'p' ? O().marksAt(p, pos.o) : {};
  }
  A.baseMarks = baseMarks;

  /* ---------- text ---------- */
  /** Insert text at the caret, replacing the selection. kind 'type' coalesces for undo; 'paste' does not. */
  A.type = function (text, kind = 'type') {
    if (!text) return;
    const res = O().replaceText(cur(), S.sel, text, baseMarks());
    S.edit(res.blocks, { a: res.pos, f: res.pos }, kind, { keepPending: true });
    S.emit('typed', text);
  };
  A.paste = (text) => A.type(String(text || '').replace(/\r\n?/g, '\n'), 'paste');
  A.enter = function () {
    const res = O().replaceText(cur(), S.sel, '\n', {});
    S.edit(res.blocks, { a: res.pos, f: res.pos }, 'enter', { keepPending: true });
  };
  A.backspace = function () {
    const res = O().deleteBackward(cur(), S.sel);
    S.edit(res.blocks, { a: res.pos, f: res.pos }, 'del', { keepPending: true });
  };
  A.del = function () {
    const res = O().deleteForward(cur(), S.sel);
    S.edit(res.blocks, { a: res.pos, f: res.pos }, 'del', { keepPending: true });
  };
  A.copyText = () => O().textBetween(cur(), S.sel);
  A.cut = function () {
    if (O().collapsed(S.sel)) return '';
    const t = A.copyText();
    const res = O().replaceText(cur(), S.sel, '');
    S.edit(res.blocks, { a: res.pos, f: res.pos }, 'cut');
    return t;
  };
  A.selectAll = function () {
    const b = cur();
    let last = b.length - 1;
    while (last > 0 && b[last].type !== 'p') last--;
    const p = b[last];
    S.select({ b: 0, o: 0 }, { b: last, o: p && p.type === 'p' ? M().paraLen(p) : 0 });
  };

  /* ---------- caret movement ---------- */
  function prevPara(b) { const p = cur()[b - 1]; return p && p.type === 'p' ? b - 1 : -1; }
  function nextPara(b) { const p = cur()[b + 1]; return p && p.type === 'p' ? b + 1 : -1; }
  function endOfDoc() {
    const b = cur();
    let i = b.length - 1;
    while (i > 0 && b[i].type !== 'p') i--;
    return { b: i, o: M().paraLen(b[i]) };
  }
  /** Move the caret. key: left right up down home end. Options: extend (shift), word (ctrl), doc (ctrl+home/end). */
  A.move = function (key, { extend = false, word = false, doc = false } = {}) {
    const pos = S.sel.f, [a, f] = O().ordered(S.sel), collapsed = O().collapsed(S.sel);
    const t = M().paraText(cur()[pos.b] || { runs: [] });
    let to = pos, goal = null;
    if ((key === 'left' || key === 'right') && !extend && !collapsed) to = key === 'left' ? a : f;
    else if (key === 'left') {
      if (doc) to = { b: 0, o: 0 };
      else if (word) to = pos.o > 0 ? { b: pos.b, o: O().wordLeft(t, pos.o) } : prevPara(pos.b) >= 0 ? { b: pos.b - 1, o: M().paraLen(cur()[pos.b - 1]) } : pos;
      else if (pos.o > 0) to = { b: pos.b, o: pos.o - (pos.o > 1 && isLow(t, pos.o - 1) && isHigh(t, pos.o - 2) ? 2 : 1) };
      else if (prevPara(pos.b) >= 0) to = { b: pos.b - 1, o: M().paraLen(cur()[pos.b - 1]) };
    } else if (key === 'right') {
      if (doc) to = endOfDoc();
      else if (word) to = pos.o < t.length ? { b: pos.b, o: O().wordRight(t, pos.o) } : nextPara(pos.b) >= 0 ? { b: pos.b + 1, o: 0 } : pos;
      else if (pos.o < t.length) to = { b: pos.b, o: pos.o + (isHigh(t, pos.o) && isLow(t, pos.o + 1) ? 2 : 1) };
      else if (nextPara(pos.b) >= 0) to = { b: pos.b + 1, o: 0 };
    } else if (key === 'up' || key === 'down') {
      const dir = key === 'up' ? -1 : 1;
      goal = S.goalX;
      if (goal == null) { const c = R().caretBox(pos); goal = c ? c.x : 0; }
      if (doc) to = dir < 0 ? { b: 0, o: 0 } : endOfDoc();
      else {
        const v = R().vertical(pos, dir, goal);
        to = v || (dir < 0 ? { b: pos.b, o: 0 } : { b: pos.b, o: t.length });
      }
    } else if (key === 'home' || key === 'end') {
      if (doc) to = key === 'home' ? { b: 0, o: 0 } : endOfDoc();
      else {
        const i = R().lineIndex(pos), L = i >= 0 ? R().lineAt(i) : null;
        if (L) {
          let e = L.line.end;
          if (!L.last) while (e > L.line.start && /\s/.test(t[e - 1])) e--;
          to = { b: pos.b, o: key === 'home' ? L.line.start : e };
        }
      }
    }
    const anchor = extend ? S.sel.a : to;
    S.select(anchor, to, { goal, keepPending: false });
  };

  /* ---------- marks ---------- */
  /** Every text run in the selection (empty paragraphs excluded). */
  function selRuns() {
    const [a, f] = O().ordered(S.sel), out = [];
    for (let i = a.b; i <= f.b; i++) {
      const p = cur()[i];
      if (!p || p.type !== 'p') continue;
      const len = M().paraLen(p), s = i === a.b ? a.o : 0, e = i === f.b ? f.o : len;
      const [, rest] = O().splitRuns(p.runs || [], s);
      const [mid] = O().splitRuns(rest, e - s);
      for (const r of mid) if (!r.obj) out.push(r);
    }
    return out;
  }
  /** Apply a mark change: at the caret it sets the typing marks, over a selection it edits the text. */
  function applyMarks(change, kind = 'format') {
    if (O().collapsed(S.sel)) { S.pending = Object.assign({}, baseMarks(), change); for (const k in change) if (change[k] == null) delete S.pending[k]; S.emit('view'); return; }
    const blocks = O().setMarks(cur(), S.sel, change);
    S.edit(blocks, S.sel, kind);
  }
  A.toggle = function (key) {
    const on = O().collapsed(S.sel) ? !!baseMarks()[key] : selRuns().length > 0 && selRuns().every((r) => !!r[key]);
    applyMarks({ [key]: !on });
  };
  A.setSize = (size) => { const n = Math.max(1, Math.min(400, Number(size) || 11)); applyMarks({ size: n }); };
  A.stepSize = function (dir) {
    const now = Number(baseMarks().size) || A.state().size || 11;
    const next = dir > 0 ? SIZES.find((s) => s > now + 0.01) || now + 2 : [...SIZES].reverse().find((s) => s < now - 0.01) || Math.max(1, now - 2);
    A.setSize(next);
  };
  A.setFont = (font) => applyMarks({ font: font || null });
  A.clearFormat = function () {
    if (O().collapsed(S.sel)) { S.pending = {}; S.emit('view'); return; }
    S.edit(O().setMarks(cur(), S.sel, O().CLEAR_MARKS), S.sel, 'format');
  };
  /** Paragraph-level change to every paragraph in the selection. */
  function paras(fn, kind = 'format') {
    const blocks = O().setParas(cur(), S.sel, fn);
    S.edit(blocks, S.sel, kind);
  }
  A.setAlign = (align) => paras((p) => ({ ...p, props: { ...(p.props || {}), align } }));
  A.setStyle = (style) => paras((p) => ({ ...p, style }));
  /** Toggle a bulleted or numbered list. The list definition lives in the document, so it is added the first time. */
  A.toggleList = function (id) {
    const lists = Object.assign({}, S.doc.lists);
    if (!lists[id]) lists[id] = id === 'num' ? E().S.numberList() : E().S.bulletList();
    S.doc = Object.assign({}, S.doc, { lists });
    S.edit(O().toggleList(cur(), S.sel, id), S.sel, 'format');
  };

  /** Toolbar state: what the caret or selection has. */
  A.state = function () {
    const pos = O().collapsed(S.sel) ? S.sel.f : O().ordered(S.sel)[0];
    const p = cur()[pos.b] || { type: 'p', runs: [], style: 'Normal' };
    const m = baseMarks(), rm = p.type === 'p' ? E().S.runMarks(S.doc, p, m) : {};
    const all = (k) => { if (O().collapsed(S.sel)) return !!m[k]; const rs = selRuns(); return rs.length > 0 && rs.every((r) => !!r[k]); };
    const P = p.type === 'p' ? E().resolvedProps(S.doc, p) : {};
    return {
      b: all('b'), i: all('i'), u: all('u'), s: all('s'),
      font: rm.font || 'Carlito', size: rm.size || 11,
      style: p.style || 'Normal', align: P.align || 'left',
      list: p.props && p.props.list ? p.props.list.id : null,
      canUndo: S.canUndo(), canRedo: S.canRedo(),
    };
  };
  A.undo = () => S.undo();
  A.redo = () => S.redo();
})();
