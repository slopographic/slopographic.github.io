/* Slop Hex: the byte grid. Renders only the visible rows: offset, 16 hex bytes (selectable) and the ASCII column.
 * Browsers cap element heights, so for a huge file the scrollbar is scaled: the spacer is at most CAP px tall and
 * scroll position maps linearly onto the row position. Classic script; exposes window.HexGrid.create(opts).
 *   opts: { scroll, spacer, rows, onSelect(sel), onChange(), onCopy() }   the scroll box holds spacer and rows.
 *   setDoc(doc), refresh(), select(anchor, cursor), sel(), ensureVisible(offset), focus(), pageRows()
 * Keys: arrows, Shift+arrows extend, Home/End, PageUp/PageDown, Ctrl+Home/End, hex digits overwrite the cursor byte
 * (two digits make one byte; the second digit moves on), Ctrl+C copies. Ctrl+Z and Ctrl+Y are handled by the app. */
(function () {
  'use strict';
  if (window.HexGrid) return;
  const ROW = 22, COLS = 16, CAP = 8000000;
  const hx = (n) => window.HexBytes.hexOf(n), asc = (n) => window.HexBytes.asciiOf(n);

  function create(opts) {
    const { scroll, spacer, rows } = opts;
    let doc = null, anchor = null, cursor = null, pend = null, dragging = false, frame = 0, seq = 0;

    const total = () => (doc ? Math.ceil(doc.size / COLS) : 0);
    const metrics = () => {
      const H = scroll.clientHeight, C = total() * ROW, spacerH = Math.min(C, CAP);
      return { H, C, spacerH, maxSt: Math.max(0, spacerH - H), maxC: Math.max(0, C - H) };
    };
    /** Scroll position <-> content position (content = the full row list in px). */
    const contentOf = (m, st) => (m.maxSt > 0 ? (st * m.maxC) / m.maxSt : 0);
    const scrollOf = (m, c) => (m.maxC > 0 ? (c * m.maxSt) / m.maxC : 0);

    function render() {
      frame = 0;
      if (!doc) { spacer.style.height = '0px'; rows.innerHTML = ''; return; }
      const m = metrics(), st = scroll.scrollTop;
      spacer.style.height = m.spacerH + 'px';
      const contentY = Math.min(m.maxC, Math.max(0, contentOf(m, st)));
      const first = Math.floor(contentY / ROW), dy = contentY - first * ROW;
      const last = Math.min(total(), first + Math.ceil((m.H + dy) / ROW) + 1);
      rows.style.top = st + 'px';
      rows.style.height = m.H + 'px';
      const from = first * COLS, count = Math.max(0, last - first) * COLS;
      const loaded = doc.has(from, count);
      if (!loaded) requestLoad(from, count);
      rows.innerHTML = rowsHtml(first, last, dy);
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }

    function requestLoad(from, count) {
      const d = doc, token = ++seq;
      d.load(from, count).then(() => { if (doc === d && token === seq) render(); }, () => {});
    }

    function rowsHtml(first, last, dy) {
      const lo = anchor === null || cursor === null ? -1 : Math.min(anchor, cursor);
      const hi = anchor === null || cursor === null ? -2 : Math.max(anchor, cursor);
      const out = [];
      for (let r = first; r < last; r++) {
        const base = r * COLS, top = (r - first) * ROW - dy;
        const off = window.HexBytes.formatOffset(base, doc.size);
        let hex = '', ac = '';
        for (let c = 0; c < COLS; c++) {
          const i = base + c;
          if (i >= doc.size) { hex += '<span class="hx-b hx-pad"></span>'; ac += '<span class="hx-a hx-pad"></span>'; continue; }
          const v = doc.byte(i);
          const cls = (i >= lo && i <= hi ? ' hx-sel' : '') + (i === cursor ? ' hx-cur' : '') + (c === 7 ? ' hx-g' : '');
          if (v === undefined) { hex += `<span class="hx-b${cls}" data-i="${i}">..</span>`; ac += `<span class="hx-a${cls}" data-i="${i}"> </span>`; }
          else {
            hex += `<span class="hx-b${cls}" data-i="${i}">${hx(v)}</span>`;
            const a = asc(v);
            ac += `<span class="hx-a${cls}" data-i="${i}">${a === '<' ? '&lt;' : a === '&' ? '&amp;' : a}</span>`;
          }
        }
        out.push(`<div class="hx-row" style="top:${top}px"><span class="hx-off" data-row="${r}">${off}</span><span class="hx-hex">${hex}</span><span class="hx-asc">${ac}</span></div>`);
      }
      return out.join('');
    }

    function ensureVisible(offset) {
      if (!doc || offset == null) return;
      const m = metrics(), st = scroll.scrollTop, contentY = contentOf(m, st);
      const row = Math.floor(offset / COLS) * ROW;
      if (row < contentY) scroll.scrollTop = scrollOf(m, row);
      else if (row + ROW > contentY + m.H) scroll.scrollTop = scrollOf(m, row + ROW - m.H);
    }

    function notify() { if (opts.onSelect) opts.onSelect({ anchor, cursor }); }
    function select(a, c, { keepPend = false } = {}) {
      anchor = a; cursor = c;
      if (!keepPend) pend = null;
      ensureVisible(cursor);
      schedule();
      notify();
    }
    const clampI = (i) => Math.max(0, Math.min(doc.size - 1, i));
    function move(to, extend) {
      if (!doc || !doc.size) return;
      to = clampI(to);
      select(extend && anchor !== null ? anchor : to, to);
    }

    /** Type one hex digit at the cursor: the first makes the high nibble, the second the low nibble and moves on. */
    async function typeDigit(d) {
      if (!doc || cursor === null || !doc.size) return;
      const at = cursor, cur = doc.byte(at);
      if (cur === undefined) await doc.load(at, 1);
      const cur2 = doc.byte(at);
      if (pend && pend.at === at && pend.high) {
        doc.write([{ at, value: (cur2 & 0xf0) | d }], { coalesce: 'nib' + at });
        pend = null;
        const next = at + 1 < doc.size ? at + 1 : at;
        select(next, next);
      } else {
        doc.write([{ at, value: (d << 4) | (cur2 & 0x0f) }], { coalesce: 'nib' + at });
        pend = { at, high: true };
        select(at, at, { keepPend: true });
      }
      if (opts.onChange) opts.onChange();
      schedule();
    }

    function cellIndex(el) {
      const c = el && el.closest ? el.closest('[data-i]') : null;
      return c ? Number(c.dataset.i) : null;
    }

    // Touch: the rows keep touch-action: pan-x pan-y (hex/css/hex.css), so a finger scrolls; a tap puts the cursor on a
    // byte, and a long press on a byte (the shared touch layer's contextmenu) makes the next tap select from it to there.
    // (The menu bar has what the right-click menu has: a long press here does not open that menu.)
    let extendNext = false;
    rows.addEventListener('contextmenu', (e) => {
      if (!(e.slopTouch || e.pointerType === 'touch') || cellIndex(e.target) === null) return;
      e.preventDefault();
      e.stopPropagation(); // no menu: the next tap ends the range
      extendNext = true;
    });
    rows.addEventListener('pointerdown', (e) => {
      if (!doc || e.button !== 0) return;
      const row = e.target.closest && e.target.closest('[data-row]');
      if (row) {
        const r = Number(row.dataset.row) * COLS;
        select(r, clampI(r + COLS - 1));
        return;
      }
      const i = cellIndex(e.target);
      if (i === null) return;
      if ((e.shiftKey || extendNext) && anchor !== null) select(anchor, i);
      else select(i, i);
      extendNext = false;
      dragging = true;
      try { rows.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      scroll.focus({ preventScroll: true });
    });
    rows.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const i = cellIndex(document.elementFromPoint(e.clientX, e.clientY));
      if (i !== null && i !== cursor) select(anchor, i, { keepPend: false });
    });
    const endDrag = () => { dragging = false; };
    rows.addEventListener('pointerup', endDrag);
    rows.addEventListener('pointercancel', endDrag);

    scroll.addEventListener('scroll', schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(scroll);

    scroll.addEventListener('keydown', (e) => {
      if (!doc) return;
      const page = pageRows() * COLS;
      const mod = e.ctrlKey || e.metaKey;
      const cur = cursor === null ? 0 : cursor;
      const key = e.key;
      if (mod && (key === 'c' || key === 'C')) { e.preventDefault(); if (opts.onCopy) opts.onCopy(); return; }
      if (mod && key === 'Home') { e.preventDefault(); move(0, e.shiftKey); return; }
      if (mod && key === 'End') { e.preventDefault(); move(doc.size - 1, e.shiftKey); return; }
      if (mod || e.altKey) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS, PageUp: -page, PageDown: page };
      if (key in moves) { e.preventDefault(); move(cur + moves[key], e.shiftKey); return; }
      if (key === 'Home') { e.preventDefault(); move(cur - (cur % COLS), e.shiftKey); return; }
      if (key === 'End') { e.preventDefault(); move(Math.min(doc.size - 1, cur - (cur % COLS) + COLS - 1), e.shiftKey); return; }
      if (/^[0-9a-fA-F]$/.test(key)) { e.preventDefault(); typeDigit(parseInt(key, 16)); return; }
      if (key === 'Escape') pend = null;
    });

    function pageRows() { return Math.max(1, Math.floor(metrics().H / ROW) - 1); }

    return {
      setDoc(d) { doc = d; anchor = null; cursor = null; pend = null; scroll.scrollTop = 0; render(); notify(); },
      refresh: render,
      select,
      sel: () => ({ anchor, cursor }),
      ensureVisible,
      focus: () => { try { scroll.focus({ preventScroll: true }); } catch (e) { scroll.focus(); } },
      pageRows,
    };
  }

  window.HexGrid = { create, ROW, COLS, CAP };
})();
