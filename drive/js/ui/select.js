/* Slop Drive — ui/select: selection with click, Shift (range), Ctrl/Cmd (toggle) and a marquee drag on empty
 * space; keyboard focus movement by geometry (works for every view); touch taps and long-press (the long press is the
 * shared touch layer's contextmenu, shared/input/HANDOFF.md). */
'use strict';
(function (DR) {
  const S = DR.S, $ = DR.$;
  const domKeys = () => [...$('pane').querySelectorAll('[data-key]')].map((n) => n.dataset.key);
  /** Repaint selection classes without re-rendering the pane. */
  DR.paintSel = function () {
    for (const n of document.querySelectorAll('#pane [data-key]')) {
      const on = S.sel.has(n.dataset.key);
      n.classList.toggle('sel', on); n.classList.toggle('focus', S.focus === n.dataset.key);
      if (n.getAttribute('role') === 'option') n.setAttribute('aria-selected', String(on));
    }
    DR.renderSelbar(); DR.renderStatus(); DR.renderInfo && DR.renderInfo();
    if (DR.onSelect) DR.onSelect();
  };
  DR.select = function (keys, { add = false } = {}) {
    if (!add) S.sel.clear();
    for (const k of keys) S.sel.add(k);
    S.focus = keys.length ? keys[keys.length - 1] : add ? S.focus : null;
    if (!add || !S.anchor) S.anchor = S.focus;
    DR.paintSel();
  };
  DR.selected = () => DR.items(S.sel);
  DR.selectAll = () => DR.select(domKeys().filter((k, i, a) => a.indexOf(k) === i));
  /** Click logic shared by every view. */
  DR.clickItem = function (key, e) {
    if (e.shiftKey && S.anchor) {
      const ks = domKeys(), a = ks.indexOf(S.anchor), b = ks.indexOf(key);
      if (a >= 0 && b >= 0) {
        const range = ks.slice(Math.min(a, b), Math.max(a, b) + 1);
        if (!(e.ctrlKey || e.metaKey)) S.sel.clear();
        range.forEach((k) => S.sel.add(k)); S.focus = key; DR.paintSel(); return;
      }
    }
    if (e.ctrlKey || e.metaKey || S.touchMode) {
      if (S.sel.has(key)) S.sel.delete(key); else S.sel.add(key);
      S.anchor = S.focus = key; if (!S.sel.size) S.touchMode = false; DR.paintSel(); return;
    }
    DR.select([key]);
  };
  /** Move the focus to the nearest item in a direction ('left' | 'right' | 'up' | 'down' | 'home' | 'end'). */
  DR.moveFocus = function (dir, extend) {
    const nodes = [...$('pane').querySelectorAll('[data-key]')];
    if (!nodes.length) return;
    let cur = nodes.find((n) => n.dataset.key === S.focus);
    let next = null;
    if (!cur || dir === 'home') next = nodes[0];
    else if (dir === 'end') next = nodes[nodes.length - 1];
    else {
      const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best = Infinity;
      for (const n of nodes) {
        if (n === cur) continue;
        const q = n.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, dx = x - cx, dy = y - cy;
        const ok = dir === 'left' ? dx < -2 && Math.abs(dy) < r.height / 2 : dir === 'right' ? dx > 2 && Math.abs(dy) < r.height / 2 : dir === 'up' ? dy < -2 : dy > 2;
        if (!ok) continue;
        const d = dir === 'up' || dir === 'down' ? Math.abs(dy) * 1000 + Math.abs(dx) : Math.abs(dx);
        if (d < best) { best = d; next = n; }
      }
      if (!next && (dir === 'left' || dir === 'right')) next = nodes[nodes.indexOf(cur) + (dir === 'left' ? -1 : 1)];
    }
    if (!next) return;
    const k = next.dataset.key;
    if (extend) { const save = S.anchor; DR.clickItem(k, { shiftKey: true }); S.anchor = save; }
    else DR.select([k]);
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  DR.scrollToFocus = () => { const n = S.focus && $('pane').querySelector(`[data-key="${CSS.escape(S.focus)}"]`); if (n) n.scrollIntoView({ block: 'nearest' }); };

  /* ---------- pointer wiring for the file views ---------- */
  DR.wireSelect = function () {
    const pane = $('pane');
    let openedAt = -Infinity;
    pane.addEventListener('click', (e) => {
      if (DR.dragJustEnded && DR.dragJustEnded()) return;
      const it = e.target.closest('[data-key]');
      if (it && pane.contains(it) && !e.target.closest('.no-sel')) {
        const item = DR.item(it.dataset.key);
        if (e.pointerType === 'touch' || DR.lastPointer === 'touch') {
          if (S.touchMode) return DR.clickItem(it.dataset.key, e);
          if (item && item.isFolder && !item.trashedAt && !it.closest('.v-columns')) { openedAt = performance.now(); return DR.open(item); }
          DR.select([it.dataset.key]); if (DR.isMobile() && item && !item.isFolder) DR.sheet(true); return;
        }
        return DR.clickItem(it.dataset.key, e);
      }
      if (!e.target.closest('button, a, input, select, svg.viz, .usage, .nodes, .lhead') && !marqueeMoved && !(e.ctrlKey || e.metaKey || e.shiftKey)) DR.select([]);
    });
    // A double tap on a folder: the first tap already opened it, so the second lands in the new folder; that is no double-click.
    pane.addEventListener('dblclick', (e) => {
      if ((e.slopTouch || DR.lastPointer === 'touch') && performance.now() - openedAt < 700) return;
      const it = e.target.closest('[data-key]'); if (it && !e.target.closest('.no-open')) DR.open(DR.item(it.dataset.key));
    });
    pane.addEventListener('pointerdown', (e) => { DR.lastPointer = e.pointerType; }, true);
    // A long press (the shared touch layer's contextmenu, shared/input; Chrome on Android sends its own): touch selection
    // mode, the item added to the selection, then the menu for the selection (ui/ctxmenu.js).
    pane.addEventListener('contextmenu', (e) => {
      if (!(e.slopTouch || e.pointerType === 'touch' || DR.lastPointer === 'touch')) return;
      const it = e.target.closest('[data-key]'); if (!it) return;
      S.touchMode = true;
      if (!S.sel.has(it.dataset.key)) DR.clickItem(it.dataset.key, {});
    }, true);
    wireMarquee(pane);
  };
  let marqueeMoved = false;
  function wireMarquee(pane) {
    pane.addEventListener('pointerdown', (e) => {
      marqueeMoved = false;
      if (e.button !== 0 || e.pointerType === 'touch' || e.target.closest('[data-key], button, input, select, .lhead, .usage, .nodes, .cols')) return;
      const files = pane.querySelector('.files'); if (!files) return;
      const pr = pane.getBoundingClientRect(), x0 = e.clientX - pr.left + pane.scrollLeft, y0 = e.clientY - pr.top + pane.scrollTop;
      const before = new Set(e.ctrlKey || e.metaKey || e.shiftKey ? S.sel : []);
      const box = DR.el('div', { class: 'marquee' });
      const nodes = [...pane.querySelectorAll('[data-key]')].map((n) => { const r = n.getBoundingClientRect(); return { n, x: r.left - pr.left + pane.scrollLeft, y: r.top - pr.top + pane.scrollTop, w: r.width, h: r.height }; });
      // touch-ok: the marquee is a mouse's (or pen's); a finger scrolls the pane and selects with a long press, then taps
      try { pane.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      const move = (ev) => {
        const x1 = ev.clientX - pr.left + pane.scrollLeft, y1 = ev.clientY - pr.top + pane.scrollTop;
        const L = Math.min(x0, x1), T = Math.min(y0, y1), W = Math.abs(x1 - x0), Hh = Math.abs(y1 - y0);
        if (!marqueeMoved && W + Hh < 5) return;
        if (!marqueeMoved) { marqueeMoved = true; pane.append(box); }
        Object.assign(box.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: Hh + 'px' });
        S.sel = new Set(before);
        for (const o of nodes) if (o.x < L + W && o.x + o.w > L && o.y < T + Hh && o.y + o.h > T) S.sel.add(o.n.dataset.key);
        DR.paintSel();
        const edge = ev.clientY - pr.top; if (edge < 20) pane.scrollTop -= 12; else if (edge > pr.height - 20) pane.scrollTop += 12;
      };
      const up = () => { pane.removeEventListener('pointermove', move); box.remove(); const ks = [...S.sel]; S.focus = ks[ks.length - 1] || null; S.anchor = S.focus; setTimeout(() => { marqueeMoved = false; }, 0); };
      pane.addEventListener('pointermove', move);
      pane.addEventListener('pointerup', up, { once: true });
      pane.addEventListener('pointercancel', up, { once: true });
    });
  }
  /** Convert… in the header (shared/convert/provided.js): the selected files (folders and the Trash left out). */
  addEventListener('slop:convert-files', (e) => e.detail.provide(() => {
    const files = DR.selected().filter((it) => it && it.blob && !it.isFolder && !it.trashedAt).map((it) => ({ name: it.name, blob: it.blob }));
    return files.length ? files : null;
  }));
})(window.DR);
