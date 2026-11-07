/* SlopCut: timeline drawing (canvas). Ruler, markers lane, lanes, clips with filmstrips and
   waveforms, fades, transitions, volume rubber bands, in/out range, playhead, snap line and ghosts. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, TL = SE.timeline;
  const KIND = { video: '--clip-video', audio: '--clip-audio', image: '--clip-image', title: '--clip-title', color: '--clip-color' };
  function colors() {
    if (TL.colors) return TL.colors;
    const v = (n) => SE.app.cssVar(n);
    const c = { bg: v('--tl-bg'), lane: v('--tl-lane'), lane2: v('--tl-lane2'), ruler: v('--tl-ruler'), line: v('--line'), line2: v('--line-2'), fg: v('--fg'), dim: v('--dim'), faint: v('--faint'), accent: v('--accent'), accentLine: v('--accent-line'), playhead: v('--playhead'), warn: v('--warn'), kinds: {} };
    for (const k in KIND) c.kinds[k] = v(KIND[k]);
    c.mono = v('--mono') || 'monospace'; c.ui = v('--font-ui') || 'sans-serif';
    return (TL.colors = c);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); }
  function tickStep(fps) {
    const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
    for (const s of steps) if (s * TL.pps >= 70) return s;
    return 3600;
  }
  function label(t, step, fps) {
    if (step < 1) { const f = Math.round(t * fps); return Math.floor(f / fps) + 's' + (f % fps ? ':' + String(f % fps).padStart(2, '0') : ''); }
    const s = Math.round(t), m = Math.floor(s / 60);
    return m ? m + ':' + String(s % 60).padStart(2, '0') : s + 's';
  }
  function drawRuler(g, C) {
    const p = SE.doc;
    g.fillStyle = C.ruler; g.fillRect(0, 0, TL.w, TL.top());
    g.fillStyle = C.lane2; g.fillRect(0, TL.RULER, TL.w, TL.MARKERS);
    g.strokeStyle = C.line; g.beginPath(); g.moveTo(0, TL.RULER + 0.5); g.lineTo(TL.w, TL.RULER + 0.5); g.moveTo(0, TL.top() - 0.5); g.lineTo(TL.w, TL.top() - 0.5); g.stroke();
    const step = tickStep(p.fps), minor = step / (step >= 1 && step % 5 === 0 ? 5 : 2);
    const t0 = Math.floor(TL.scrollX / minor) * minor, t1 = TL.t(TL.w);
    g.strokeStyle = C.faint; g.fillStyle = C.dim; g.font = '500 10px ' + C.mono; g.textBaseline = 'top';
    g.beginPath();
    for (let t = t0; t <= t1; t += minor) {
      const x = Math.round(TL.x(t)) + 0.5, major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
      g.moveTo(x, TL.RULER); g.lineTo(x, TL.RULER - (major ? 10 : 5));
      if (major) g.fillText(label(t, step, p.fps), x + 3, 3);
    }
    g.stroke();
    // in/out range in the ruler
    if (p.io && (p.io.in != null || p.io.out != null)) {
      const a = TL.x(p.io.in || 0), b = TL.x(p.io.out != null ? p.io.out : M.duration(p));
      g.fillStyle = 'rgba(255,201,74,.35)'; g.fillRect(a, TL.RULER - 6, b - a, 6);
    }
    for (const k of p.markers) {
      const x = TL.x(k.t); if (x < -80 || x > TL.w + 10) continue;
      g.fillStyle = k.color || C.warn;
      g.beginPath(); g.moveTo(x - 5, TL.RULER + 2); g.lineTo(x + 5, TL.RULER + 2); g.lineTo(x + 5, TL.RULER + 9); g.lineTo(x, TL.RULER + 14); g.lineTo(x - 5, TL.RULER + 9); g.fill();
      if (k.name && TL.pps > 8) { g.fillStyle = C.dim; g.font = '500 10px ' + C.ui; g.fillText(k.name, x + 8, TL.RULER + 3); }
    }
  }
  function filmstrip(g, c, r, it) {
    const th = it.thumbs && it.thumbs[0] && it.thumbs[0].c; if (!th) return;
    const h = r.h - 16, tw = Math.max(8, h * th.width / th.height);
    const x0 = Math.max(r.x, 0), x1 = Math.min(r.x + r.w, TL.w);
    const start = r.x + Math.floor((x0 - r.x) / tw) * tw;
    for (let x = start; x < x1; x += tw) {
      const t = c.kind === 'image' ? 0 : M.srcAt(c, TL.t(x + tw / 2));
      const img = SE.media.thumbAt(it, t);
      if (img) g.drawImage(img, x, r.y + 15, tw, h);
    }
  }
  function waveform(g, c, r, it, col) {
    const pk = it.peaks; if (!pk) return;
    const pps = SE.analyze.PEAKS_PER_SEC, mid = r.y + 14 + (r.h - 14) / 2, amp = (r.h - 16) / 2;
    g.fillStyle = col;
    const x0 = Math.max(Math.floor(r.x), 0), x1 = Math.min(Math.ceil(r.x + r.w), TL.w);
    for (let x = x0; x < x1; x++) {
      const a = M.srcAt(c, TL.t(x)), b = M.srcAt(c, TL.t(x + 1));
      let i = Math.floor(a * pps), j = Math.max(i + 1, Math.floor(b * pps)), m = 0;
      for (; i < j && i < pk.length; i++) if (pk[i] > m) m = pk[i];
      const gain = Math.min(1.6, M.gainAt(c, TL.t(x) - c.start));
      const hh = Math.max(0.5, Math.min(1, m * gain) * amp);
      g.fillRect(x, mid - hh, 1, hh * 2);
    }
  }
  function drawClip(g, C, c, sel) {
    const r = TL.clipRect(c); if (!r || r.x > TL.w || r.x + r.w < 0 || r.y > TL.h || r.y + r.h < TL.top() - 4) return;
    const p = SE.doc, it = c.media && SE.media.get(c.media), base = C.kinds[c.kind] || C.kinds.video;
    const tk = r.row.track;
    g.save();
    rr(g, r.x, r.y, Math.max(2, r.w), r.h, 5); g.clip();
    g.fillStyle = base; g.globalAlpha = 0.55; g.fillRect(r.x, r.y, r.w, r.h); g.globalAlpha = 1;
    if (c.kind === 'color') { g.fillStyle = c.color; g.fillRect(r.x, r.y + 14, r.w, r.h - 14); }
    if (it && it.status === 'ready') {
      if (c.kind === 'audio') waveform(g, c, r, it, 'rgba(255,255,255,.75)');
      else filmstrip(g, c, r, it);
    }
    if (c.kind === 'title') { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 ' + Math.min(18, r.h - 20) + 'px ' + C.ui; g.textBaseline = 'middle'; g.fillText('T  ' + ((c.text && c.text.str) || '').split('\n')[0], r.x + 8, r.y + 14 + (r.h - 14) / 2); }
    // header strip
    g.fillStyle = base; g.fillRect(r.x, r.y, r.w, 14);
    g.fillStyle = '#fff'; g.font = '600 10px ' + C.ui; g.textBaseline = 'middle';
    let name = M.label(p, c);
    if (c.speed !== 1) name = Math.round(c.speed * 100) + '% · ' + name;
    if (c.link) name = '🔗 ' + name;
    g.fillText(name, Math.max(r.x, 0) + 5, r.y + 7.5);
    // fades
    const fk = c.kind === 'audio' ? ['afIn', 'afOut'] : ['fadeIn', 'fadeOut'];
    g.fillStyle = 'rgba(0,0,0,.35)';
    if (c[fk[0]] > 0) { g.beginPath(); g.moveTo(r.x, r.y + 14); g.lineTo(r.x + c[fk[0]] * TL.pps, r.y + 14); g.lineTo(r.x, r.y + r.h); g.fill(); }
    if (c[fk[1]] > 0) { g.beginPath(); g.moveTo(r.x + r.w, r.y + 14); g.lineTo(r.x + r.w - c[fk[1]] * TL.pps, r.y + 14); g.lineTo(r.x + r.w, r.y + r.h); g.fill(); }
    // volume rubber band and keyframes
    if (c.kind === 'audio' && r.h > 20) {
      g.strokeStyle = C.warn; g.lineWidth = 1.2; g.beginPath();
      const x0 = Math.max(r.x, 0), x1 = Math.min(r.x + r.w, TL.w);
      for (let x = x0; x <= x1; x += 2) { const y = TL.volY(c, r, (x - r.x) / TL.pps); if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = C.warn;
      for (const k of c.keys || []) { const kx = r.x + k.t * TL.pps, ky = TL.volY(c, r, k.t); g.beginPath(); g.moveTo(kx, ky - 4); g.lineTo(kx + 4, ky); g.lineTo(kx, ky + 4); g.lineTo(kx - 4, ky); g.fill(); }
    }
    if (r.w > 40 && (sel || TL.hover === c.id)) {
      g.fillStyle = '#fff';
      g.fillRect(r.x + c[fk[0]] * TL.pps - 3, r.y + 1, 6, 6);
      g.fillRect(r.x + r.w - c[fk[1]] * TL.pps - 3, r.y + 1, 6, 6);
    }
    g.restore();
    if (tk.lock) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(r.x, r.y, r.w, r.h); }
    g.lineWidth = sel ? 2 : 1;
    g.strokeStyle = sel ? C.accent : 'rgba(0,0,0,.45)';
    rr(g, r.x + 0.5, r.y + 0.5, Math.max(1, r.w - 1), r.h - 1, 5); g.stroke();
    if (it && (it.status === 'missing' || it.status === 'error')) { g.fillStyle = 'rgba(255,60,80,.5)'; g.fillRect(r.x, r.y + 14, r.w, r.h - 14); }
    if (c.trIn) {
      const w = c.trIn.dur * TL.pps, x = r.x - w / 2;
      g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, x, r.y + r.h - 15, w, 14, 3); g.fill();
      g.strokeStyle = C.accentLine; g.lineWidth = 1; g.stroke();
      if (w > 30) { g.fillStyle = '#fff'; g.font = '600 9px ' + C.ui; g.textBaseline = 'middle'; g.fillText(U.w('tr', c.trIn.type, (M.TRANSITIONS.find((x) => x[0] === c.trIn.type) || ['', ''])[1]), x + 4, r.y + r.h - 8, w - 8); }
    }
  }
  TL.draw = function () {
    const g = TL.ctx; if (!g) return;
    const C = colors(), p = SE.doc;
    g.setTransform(TL.dpr, 0, 0, TL.dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, TL.w, TL.h);
    const rows = TL.rows();
    g.save(); g.beginPath(); g.rect(0, TL.top(), TL.w, TL.h - TL.top()); g.clip();
    rows.forEach((r, i) => {
      const y = r.y - TL.scrollY;
      g.fillStyle = r.track.kind === 'audio' ? C.lane2 : C.lane; g.fillRect(0, y, TL.w, r.h - 1);
      if (i && rows[i - 1].track.kind !== r.track.kind) { g.fillStyle = C.line2; g.fillRect(0, y - 1, TL.w, 2); }
      if (r.track.lock) { g.fillStyle = 'rgba(128,128,128,.08)'; for (let x = -r.h; x < TL.w; x += 12) { g.beginPath(); g.moveTo(x, y + r.h); g.lineTo(x + r.h, y); g.lineTo(x + r.h + 4, y); g.lineTo(x + 4, y + r.h); g.fill(); } }
    });
    if (p.io && (p.io.in != null || p.io.out != null)) {
      const a = TL.x(p.io.in || 0), b = TL.x(p.io.out != null ? p.io.out : M.duration(p));
      g.fillStyle = 'rgba(255,201,74,.06)'; g.fillRect(a, TL.top(), b - a, TL.h);
    }
    const sel = SE.app.sel;
    for (const c of p.clips) drawClip(g, C, c, sel.has(c.id));
    if (SE.cells) SE.cells.drawTimeline(g, C); // empty layout slots (render/cells.js)
    if (TL.ghost) for (const gh of TL.ghost) {
      const r = TL.rowOf(gh.track); if (!r) continue;
      g.fillStyle = 'rgba(212,255,58,.25)'; g.strokeStyle = C.accent; g.lineWidth = 1.5;
      rr(g, TL.x(gh.start), r.y - TL.scrollY + 1, gh.dur * TL.pps, r.h - 2, 5); g.fill(); g.stroke();
    }
    if (TL.marquee) { const m = TL.marquee; g.fillStyle = 'rgba(212,255,58,.08)'; g.strokeStyle = C.accentLine; g.lineWidth = 1; g.fillRect(m.x, m.y, m.w, m.h); g.strokeRect(m.x + 0.5, m.y + 0.5, m.w, m.h); }
    g.restore();
    drawRuler(g, C);
    if (TL.snapLine != null) {
      const x = Math.round(TL.x(TL.snapLine)) + 0.5;
      g.strokeStyle = C.accent; g.setLineDash([4, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TL.h); g.stroke(); g.setLineDash([]);
    }
    if (TL.razorX != null && TL.tool === 'razor') { g.strokeStyle = C.playhead; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(TL.razorX + 0.5, TL.top()); g.lineTo(TL.razorX + 0.5, TL.h); g.stroke(); g.setLineDash([]); }
    const ph = Math.round(TL.x(SE.player ? SE.player.time : 0)) + 0.5;
    if (ph > -10 && ph < TL.w + 10) {
      g.strokeStyle = C.playhead; g.lineWidth = 1; g.beginPath(); g.moveTo(ph, 4); g.lineTo(ph, TL.h); g.stroke();
      g.fillStyle = C.playhead; g.beginPath(); g.moveTo(ph - 6, 2); g.lineTo(ph + 6, 2); g.lineTo(ph + 6, 12); g.lineTo(ph, 18); g.lineTo(ph - 6, 12); g.fill();
    }
  };
})();
