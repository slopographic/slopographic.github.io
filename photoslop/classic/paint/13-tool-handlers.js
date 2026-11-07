/* Slop Paint, part 13: per-tool pointer handlers (H) and selection drag.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { EMOJIS, S, SLOP_DARK, SLOP_PAL, beginStroke, bg, boxOf, bres, brushSpans, cancelCurve, cancelPoly, clamp, clearOverlay, commitCurve, commitPoly, commitSel, commitText, createTextBox, ctx2d, drawShape, erase, eraserCursor, fg, floodFill, ghost, inCanvas, insideSel, lift, line, lineH, magRect, mctx, mkCanvas, octx, previewCurve, previewPoly, pushUndo, renderFloating, rgbHex, selImage, setColor, setSizeStatus, setZoom, slopCommit, slopComposite, slopStamp, snap45, spray, stamp, stampEmoji, status, stopDrips, undoStack, updateSelBox, updateSize, ws } = P;

const H = {};
H.pencil = {
  down(p) { beginStroke(); mctx.fillStyle = fg(); mctx.fillRect(p.x, p.y, 1, 1); },
  move(p) { mctx.fillStyle = fg(); line(mctx, P.st.op.last.x, P.st.op.last.y, p.x, p.y, 1); },
};
H.brush = {
  down(p) { beginStroke(); mctx.fillStyle = fg(); stamp(mctx, p.x, p.y, brushSpans()); },
  move(p) { mctx.fillStyle = fg(); const sp = brushSpans(); bres(P.st.op.last.x, P.st.op.last.y, p.x, p.y, (x, y) => stamp(mctx, x, y, sp)); },
};
H.eraser = {
  down(p) { beginStroke(); erase(p, p); eraserCursor(p); },
  move(p) { erase(P.st.op.last, p); eraserCursor(p); },
  hover(p) { eraserCursor(p); },
};
H.airbrush = {
  down(p) { beginStroke(); spray(p); const o = P.st.op; o.timer = setInterval(() => { if (P.st.op === o) spray(o.last); }, 28); },
  move(p) { spray(p); },
  up() { clearInterval(P.st.op.timer); },
};
H.fill = {
  down(p) { if (inCanvas(p)) floodFill(p.x, p.y, fg()); },
};
H.picker = {
  move(p) { if (inCanvas(p)) { const d = mctx.getImageData(p.x, p.y, 1, 1).data; status(P.t('paint-classic.status.color_under', { color: rgbHex(d[0], d[1], d[2]) })); } },
  up(p) {
    if (!inCanvas(p)) return;
    const d = mctx.getImageData(p.x, p.y, 1, 1).data;
    setColor(P.st.op.btn, rgbHex(d[0], d[1], d[2]));
    P.setTool(S.prevTool);
  },
};
H.zoom = {
  hover(p) {
    clearOverlay();
    if (S.zoom !== 1) return;
    const r = magRect(p, S.magZoom === 1 ? 4 : S.magZoom);
    octx.fillStyle = '#000';
    octx.fillRect(r.x, r.y, r.w, 1); octx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    octx.fillRect(r.x, r.y, 1, r.h); octx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  },
  up(p, e) {
    clearOverlay();
    if (S.zoom === 1 && P.st.op.btn !== 2) {
      const z = S.magZoom === 1 ? 4 : S.magZoom, r = magRect(p, z);
      setZoom(z);
      ws.scrollLeft = r.x * z; ws.scrollTop = r.y * z;
    } else {
      const wr = ws.getBoundingClientRect();
      setZoom(1, { ix: p.x, iy: p.y, cx: e.clientX - wr.left, cy: e.clientY - wr.top });
    }
    P.setTool(S.prevTool);
  },
};
H.line = {
  down(p) { this.move(p); },
  move(p) {
    const q = P.st.op.shift ? snap45(P.st.op.start, p) : p;
    clearOverlay(); octx.fillStyle = fg(); line(octx, P.st.op.start.x, P.st.op.start.y, q.x, q.y, S.lineWidth);
    setSizeStatus(Math.abs(q.x - P.st.op.start.x), Math.abs(q.y - P.st.op.start.y));
  },
  up(p) {
    const q = P.st.op.shift ? snap45(P.st.op.start, p) : p;
    clearOverlay(); pushUndo(); mctx.fillStyle = fg(); line(mctx, P.st.op.start.x, P.st.op.start.y, q.x, q.y, S.lineWidth);
  },
};
for (const type of ['rect', 'ellipse', 'rrect']) {
  H[type] = {
    down(p) { this.move(p); },
    move(p) {
      const b = boxOf(P.st.op.start, p, P.st.op.shift);
      clearOverlay(); drawShape(octx, type, b.x0, b.y0, b.x1, b.y1, S.lineWidth, S.fillMode, fg(), bg());
      setSizeStatus(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    },
    up(p) {
      const b = boxOf(P.st.op.start, p, P.st.op.shift);
      clearOverlay(); pushUndo(); drawShape(mctx, type, b.x0, b.y0, b.x1, b.y1, S.lineWidth, S.fillMode, fg(), bg());
    },
  };
}
H.curve = {
  down(p) {
    if (!P.st.curve) P.st.curve = { stage: 0, btn: P.st.op.btn, p0: p, p3: p, c1: p, c2: p };
    else if (P.st.curve.stage === 1) P.st.curve.c1 = P.st.curve.c2 = p;
    else P.st.curve.c2 = p;
    previewCurve();
  },
  move(p) {
    if (!P.st.curve) return;
    if (P.st.curve.stage === 0) P.st.curve.p3 = P.st.op.shift ? snap45(P.st.curve.p0, p) : p;
    else if (P.st.curve.stage === 1) P.st.curve.c1 = P.st.curve.c2 = p;
    else P.st.curve.c2 = p;
    previewCurve();
  },
  up() {
    if (!P.st.curve) return;
    if (P.st.curve.stage < 2) { P.st.curve.stage++; status(P.t(P.st.curve.stage === 1 ? 'paint-classic.status.curve_1' : 'paint-classic.status.curve_2')); }
    else { commitCurve(); status(); }
  },
};
H.poly = {
  down(p) {
    if (!P.st.poly) P.st.poly = { btn: P.st.op.btn, pts: [p, { ...p }], lastUp: 0 };
    else P.st.poly.pts.push(P.st.op.shift ? snap45(P.st.poly.pts[P.st.poly.pts.length - 1], p) : p);
    previewPoly();
  },
  move(p) {
    if (!P.st.poly) return;
    const n = P.st.poly.pts.length;
    P.st.poly.pts[n - 1] = P.st.op.shift ? snap45(P.st.poly.pts[n - 2], p) : p;
    previewPoly();
  },
  up() {
    if (!P.st.poly) return;
    const pts = P.st.poly.pts, n = pts.length, last = pts[n - 1], now = performance.now();
    const tol = Math.max(2, Math.ceil(5 / S.zoom));
    const near = (a, b) => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
    if (n >= 3 && (near(last, pts[0]) || (now - P.st.poly.lastUp < 450 && near(last, pts[n - 2])))) {
      pts.pop();
      commitPoly();
      return;
    }
    P.st.poly.lastUp = now;
  },
};
function selDown(p, e) {
  if (P.st.sel && insideSel(p)) {
    if (!P.st.sel.canvas) lift();
    else if (P.st.op.ctrl) { pushUndo(); mctx.drawImage(selImage(), P.st.sel.x, P.st.sel.y, P.st.sel.w, P.st.sel.h); }
    P.st.op.mode = 'move'; P.st.op.dx = p.x - P.st.sel.x; P.st.op.dy = p.y - P.st.sel.y; P.st.op.ox = P.st.sel.x; P.st.op.oy = P.st.sel.y;
    return;
  }
  commitSel();
  if (S.tool === 'freesel') { P.st.op.mode = 'lasso'; P.st.op.pts = [clampPt(p)]; clearOverlay(); }
  else { P.st.op.mode = 'marquee'; updateSelBox({ x: p.x, y: p.y, w: 0, h: 0 }, true); }
}
const clampPt = p => ({ x: clamp(p.x, 0, S.w - 1), y: clamp(p.y, 0, S.h - 1) });
function marqueeRect(a, b) {
  a = clampPt(a); const q = { x: clamp(b.x, 0, S.w), y: clamp(b.y, 0, S.h) };
  return { x: Math.min(a.x, q.x), y: Math.min(a.y, q.y), w: Math.abs(q.x - a.x), h: Math.abs(q.y - a.y) };
}
function selMove(p) {
  if (P.st.op.mode === 'move') {
    P.st.sel.x = p.x - P.st.op.dx; P.st.sel.y = p.y - P.st.op.dy;
    renderFloating(); updateSelBox();
  } else if (P.st.op.mode === 'marquee') {
    const r = marqueeRect(P.st.op.start, p);
    updateSelBox(r, true); setSizeStatus(r.w, r.h);
  } else if (P.st.op.mode === 'lasso') {
    const q = clampPt(p), l = P.st.op.pts[P.st.op.pts.length - 1];
    if (q.x === l.x && q.y === l.y) return;
    P.st.op.pts.push(q);
    octx.fillStyle = '#000'; line(octx, l.x, l.y, q.x, q.y, 1);
  }
}
function selUp(p) {
  if (P.st.op.mode === 'marquee') {
    const r = marqueeRect(P.st.op.start, p);
    if (r.w > 0 && r.h > 0) { P.st.sel = { ...r, ver: 0 }; updateSelBox(); }
    else updateSelBox(null);
  } else if (P.st.op.mode === 'lasso') {
    clearOverlay();
    const pts = P.st.op.pts;
    if (pts.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    const w = x1 - x0 + 1, hh = y1 - y0 + 1;
    if (w < 2 || hh < 2) return;
    const mask = mkCanvas(w, hh), mx = ctx2d(mask, { willReadFrequently: true });
    mx.fillStyle = '#000';
    mx.beginPath(); pts.forEach((q, i) => (i ? mx.lineTo : mx.moveTo).call(mx, q.x - x0 + 0.5, q.y - y0 + 0.5)); mx.closePath(); mx.fill();
    for (let i = 1; i < pts.length; i++) line(mx, pts[i - 1].x - x0, pts[i - 1].y - y0, pts[i].x - x0, pts[i].y - y0, 1);
    const img = mx.getImageData(0, 0, w, hh), d = img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
    mx.putImageData(img, 0, 0);
    P.st.sel = { x: x0, y: y0, w, h: hh, mask, ver: 0 };
    updateSelBox();
  }
}
H.select = { down: selDown, move: selMove, up: selUp };
H.freesel = { down: selDown, move: selMove, up: selUp };
H.text = {
  down(p) {
    if (P.st.text) { commitText(); P.st.op.mode = 'done'; return; }
    P.st.op.mode = 'rect';
    updateSelBox({ x: p.x, y: p.y, w: 0, h: 0 }, true);
  },
  move(p) { if (P.st.op.mode === 'rect') { const r = marqueeRect(P.st.op.start, p); updateSelBox(r, true); setSizeStatus(r.w, r.h); } },
  up(p) {
    if (P.st.op.mode !== 'rect') return;
    updateSelBox(null);
    const r = marqueeRect(P.st.op.start, p);
    if (!inCanvas(P.st.op.start)) return;
    if (r.w < 8 || r.h < 8) { r.x = P.st.op.start.x; r.y = P.st.op.start.y; r.w = Math.max(r.w, Math.min(S.w - r.x, Math.max(160, S.font.size * 9))); r.h = Math.max(r.h, lineH() + 2); }
    r.w = Math.min(r.w, S.w - r.x); r.h = Math.min(r.h, S.h - r.y);
    if (r.w < 4 || r.h < 4) return;
    createTextBox(r.x, r.y, r.w, r.h);
  },
};
H.slop = {
  down(p) {
    beginStroke();
    const L = [0, 1, 2].map(() => mkCanvas(S.w, S.h));
    P.st.slopStroke = { L, X: L.map(c => ctx2d(c)), pal: P.st.op.btn === 2 ? SLOP_DARK : SLOP_PAL, dist: 0, nextDrip: 3 };
    slopStamp(p.x, p.y); slopComposite();
  },
  move(p) { if (!P.st.slopStroke) return; bres(P.st.op.last.x, P.st.op.last.y, p.x, p.y, (x, y) => slopStamp(x, y)); slopComposite(); },
  up() { slopCommit(); },
};
H.stamp = {
  down(p) { beginStroke(); clearOverlay(); P.st.op.ls = p; stampEmoji(p, P.st.op.btn === 2 ? EMOJIS[Math.random() * EMOJIS.length | 0] : S.emoji); },
  move(p) {
    if (Math.hypot(p.x - P.st.op.ls.x, p.y - P.st.op.ls.y) >= S.emojiSize * 0.85) {
      P.st.op.ls = p; stampEmoji(p, P.st.op.btn === 2 ? EMOJIS[Math.random() * EMOJIS.length | 0] : S.emoji);
    }
  },
  hover(p) { clearOverlay(); octx.globalAlpha = 0.45; stampEmoji(p, S.emoji, octx); octx.globalAlpha = 1; },
};

function cancelOp() {
  const o = P.st.op;
  if (!o) return;
  P.st.op = null;
  if (o.timer) clearInterval(o.timer);
  if (o.kind === 'canvasResize') { ghost.hidden = true; return; }
  if (o.kind === 'selResize') { if (P.st.sel) { Object.assign(P.st.sel, o.r0); renderFloating(); updateSelBox(); } return; }
  const t = S.tool;
  if (o.mutated) {
    if (t === 'slop') { P.st.slopStroke = null; stopDrips(); }
    if (undoStack.length) { mctx.putImageData(undoStack.pop().data, 0, 0); }
    clearOverlay();
    return;
  }
  if (t === 'curve') cancelCurve();
  else if (t === 'poly') cancelPoly();
  else if (t === 'select' || t === 'freesel') {
    if (o.mode === 'move' && P.st.sel) { P.st.sel.x = o.ox; P.st.sel.y = o.oy; renderFloating(); updateSelBox(); }
    else { if (o.mode === 'lasso') clearOverlay(); updateSelBox(P.st.sel); }
  } else if (t === 'text') updateSelBox(null);
  else clearOverlay();
  updateSize();
}

Object.assign(P, { H, cancelOp });
})();
