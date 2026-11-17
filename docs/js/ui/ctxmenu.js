/* Slop Docs — ui/ctxmenu: context menus for what is under the pointer on the page: a selection, a paragraph, a table
 * cell, an image, or the blank page. The typing area opens the selection or paragraph menu from the keyboard (the Menu
 * key or Shift+F10). Every item calls the shared action: ui/actions.js, ui/objects.js, and the format menu's rows. */
(function () {
  'use strict';
  const S = window.SlopDocs, A = () => S.A;
  const E = () => window.SlopDocEngine;
  const key = (id, fb) => (window.SlopCtx ? SlopCtx.keyFor(id, fb) : fb || '');
  /** Run fn, then give focus back to the typing area. */
  const act = (fn) => () => { try { fn(); } catch (e) { console.error(e); } if (S.focusIme) S.focusIme(); };
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const t = S.t;

  /* ---------- hit testing: what sits under a client point on a page ---------- */
  /** { kind: 'cell'|'image'|'text'|'page', pi, bi?, r?, c?, off?, pos? } for the page element under (cx, cy). */
  function hitAt(pageEl, cx, cy) {
    const pi = +pageEl.dataset.pi, box = pageEl.getBoundingClientRect(), k = S.R.k();
    const x = (cx - box.left) / k, y = (cy - box.top) / k;
    const inside = (it) => x >= it.x && x <= it.x + it.w && y >= it.y && y <= it.y + it.h;
    const items = S.layout.pages[pi].items;
    // table cells: top-level tables only (path [block, row, column]); the innermost box wins
    const cell = items.filter((it) => it.kind === 'cell' && it.story === 'body' && it.path.length === 3 && inside(it)).pop();
    if (cell) return { kind: 'cell', pi, bi: cell.path[0], r: cell.path[1], c: cell.path[2] };
    const img = items.find((it) => it.kind === 'img' && it.story === 'body' && it.path.length === 1 && inside(it));
    if (img) return { kind: 'image', pi, bi: img.path[0], off: img.off };
    const onLine = S.lineList.some((L) => L.pi === pi && y >= L.y && y <= L.y + L.line.h);
    if (onLine) return { kind: 'text', pi, pos: S.R.hit(cx, cy) };
    return { kind: 'page', pi };
  }
  const selected = (pos) => {
    if (E().O.collapsed(S.sel)) return false;
    const [a, f] = E().O.ordered(S.sel);
    return E().O.cmpPos(a, pos) <= 0 && E().O.cmpPos(pos, f) <= 0;
  };

  /* ---------- item lists ---------- */
  /** Clipboard and format rows for a selection (the format menu's own rows, so nothing is duplicated). */
  function formatRows(ids) {
    const all = S.menus.format();
    return ids.map((id) => all.find((i) => i && i.fid === id)).filter(Boolean);
  }
  function selectionItems() {
    return [
      { label: t('ui.cut'), key: key('edit.cut', 'Ctrl+X'), act: act(() => { const cut = A().cut(); if (cut && navigator.clipboard) navigator.clipboard.writeText(cut).catch(() => {}); }) },
      { label: t('ui.copy'), key: key('edit.copy', 'Ctrl+C'), act: act(() => { const txt = A().copyText(); if (txt && navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => toast(t('docs.ctx.copy_blocked'))); }) },
      pasteItem(),
      '-',
      ...formatRows(['bold', 'italic', 'underline', 'clear']),
      '-',
      { label: t('docs.menu.select_all'), key: key('edit.selectAll', 'Ctrl+A'), act: act(() => A().selectAll()) },
    ];
  }
  function paragraphItems() {
    return [
      pasteItem(),
      '-',
      ...formatRows(['style', 'align', 'list']),
      '-',
      { label: t('docs.menu.select_all'), key: key('edit.selectAll', 'Ctrl+A'), act: act(() => A().selectAll()) },
    ];
  }
  function pasteItem() {
    return { label: t('ui.paste'), key: key('edit.paste', 'Ctrl+V'), act: act(() => {
      if (!navigator.clipboard || !navigator.clipboard.readText) return toast(t('docs.ctx.paste_keys'));
      navigator.clipboard.readText().then((text) => A().paste(text), () => toast(t('docs.ctx.paste_keys')));
    }) };
  }
  function cellItems(bi, r, c) {
    const TB = E().TB, blocks = S.doc.blocks, tbl = blocks[bi], plain = TB.isPlain(blocks, bi);
    const out = [];
    if (plain) {
      out.push(
        { label: t('docs.ctx.row_above'), act: act(() => A().tableRow(bi, r, false)) },
        { label: t('docs.ctx.row_below'), act: act(() => A().tableRow(bi, r, true)) },
      );
      if (tbl.rows.length > 1) out.push({ label: t('docs.ctx.row_delete'), act: act(() => A().tableRowDelete(bi, r)) });
      out.push('-',
        { label: t('docs.ctx.col_left'), act: act(() => A().tableCol(bi, c, false)) },
        { label: t('docs.ctx.col_right'), act: act(() => A().tableCol(bi, c, true)) },
      );
      if (tbl.cols.length > 1) out.push({ label: t('docs.ctx.col_delete'), act: act(() => A().tableColDelete(bi, c)) });
      out.push('-');
    }
    out.push({ label: t('docs.ctx.table_delete'), act: act(() => A().tableDelete(bi)) });
    return out;
  }
  function imageItems(bi, off) {
    const run = A().imageAt(bi, off), wrap = (run && run.wrap) || 'inline';
    const opt = (w, l) => ({ label: l, check: wrap === w, act: act(() => A().imageEdit(bi, off, w)) });
    return [
      { label: t('docs.ctx.wrap'), sub: [opt('inline', t('docs.ctx.inline')), opt('left', t('docs.menu.left')), opt('right', t('docs.menu.right'))] },
      '-',
      { label: t('docs.ctx.image_delete'), act: act(() => A().imageEdit(bi, off, null)) },
    ];
  }
  function pageItems(pi) {
    const first = S.lineList.find((L) => L.pi === pi);
    const out = [];
    if (first) {
      const pos = { b: first.b, o: first.line.start };
      out.push(
        { label: t('docs.ctx.page_start'), act: act(() => S.select(pos, pos)) },
        { label: t('docs.ctx.page_break'), act: act(() => { S.select(pos, pos); A().pageBreak(); }) },
        '-',
      );
    }
    out.push({ label: t('docs.menu.select_all'), key: key('edit.selectAll', 'Ctrl+A'), act: act(() => A().selectAll()) });
    return out;
  }

  /** The menu for a pointer (ev) or for the typing area (ev null, from the Menu key). */
  function resolve(target, ev) {
    if (!ev) {
      if (!target || target.id !== 'ime' || !S.layout) return null;
      return E().O.collapsed(S.sel) ? paragraphItems() : selectionItems();
    }
    const pageEl = target && target.closest && target.closest('.page');
    if (!pageEl || !S.layout) return null;
    const hit = hitAt(pageEl, ev.clientX, ev.clientY);
    if (hit.kind === 'cell') return cellItems(hit.bi, hit.r, hit.c);
    if (hit.kind === 'image') return imageItems(hit.bi, hit.off);
    if (hit.kind === 'text' && hit.pos) {
      if (!selected(hit.pos)) S.select(hit.pos, hit.pos); // a right-click outside the selection moves the caret there
      return E().O.collapsed(S.sel) ? paragraphItems() : selectionItems();
    }
    return pageItems(hit.pi);
  }

  function init() {
    const app = document.getElementById('app');
    if (app && window.SlopCtx) SlopCtx.bind(app, resolve);
  }
  S.ctxmenu = { init, resolve };
})();
