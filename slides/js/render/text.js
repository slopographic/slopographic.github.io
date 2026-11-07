/* Slop Slides: rich-text layout. Paragraphs of styled runs → positioned glyph runs, with bullets and levels,
   alignment, vertical alignment and autofit (shrink text on overflow). Measurement uses the TTF metrics from
   SS.fonts, so the editor, the slideshow and the PDF get identical line breaks. */
(function () {
  'use strict';
  var SS = window.SS, F = SS.fonts, TH = SS.themes;
  var X = SS.textLayout = {};
  X.INSET = [7.2, 3.6, 7.2, 3.6];
  var BULLETS = { disc: ['•', '–', '•', '–', '•'], dash: ['–', '–', '–', '–', '–'], arrow: ['→', '→', '→', '→', '→'], check: ['✓', '✓', '✓', '✓', '✓'] };

  /** Resolved style of one run (font, size, colour, decorations) given the object's style and theme. */
  function runStyle(theme, st, p, r, k) {
    var fam = TH.font(theme, r.font || p.font || st.font);
    var bold = r.b != null ? r.b : !!st.bold, italic = r.i != null ? r.i : !!st.italic;
    var face = F.face(fam, bold, italic);
    return { face: face, family: fam, bold: bold, italic: italic, size: (r.size || st.size || 18) * k, color: TH.color(theme, r.color || p.color || st.color, 'text'), u: !!r.u, s: !!r.s, link: r.link || null, ls: (st.letterSpacing || 0) * k };
  }

  /** Splits runs into words: each piece keeps its trailing spaces so widths add up exactly. */
  function pieces(runs) {
    var out = [];
    runs.forEach(function (r, ri) {
      var re = /[^\s]+\s*|\s+/g, m;
      while ((m = re.exec(r.t))) out.push({ ri: ri, t: m[0] });
      if (!r.t.length) out.push({ ri: ri, t: '' });
    });
    return out;
  }
  function bulletText(p, num) {
    var lvl = Math.min(p.level || 0, 4);
    if (p.bullet === 'num') return num + '.';
    if (p.bullet === 'alpha') return String.fromCharCode(96 + ((num - 1) % 26) + 1) + '.';
    return (BULLETS[p.bullet] || BULLETS.disc)[lvl];
  }

  function layoutAt(o, theme, k, W) {
    var st = o.style || {}, tx = o.text, lines = [], bullets = [], y = 0, nums = {}, broke = false;
    var lh = st.lineHeight || 1.2, align0 = st.align || 'l';
    tx.paras.forEach(function (p, pi) {
      var styled = p.runs.map(function (r) { return runStyle(theme, st, p, r, k); });
      var baseSz = styled.length ? Math.max.apply(null, styled.map(function (s) { return s.size; })) : (st.size || 18) * k;
      var lvl = p.level || 0, hasB = p.bullet && p.bullet !== 'none';
      var indent = lvl * (st.size || 18) * 1.25 * k, hang = hasB ? baseSz * (p.bullet === 'num' || p.bullet === 'alpha' ? 1.5 : 1.05) : 0;
      if (pi > 0) y += p.spaceBefore != null ? p.spaceBefore * k : (st.paraSpace != null ? st.paraSpace * k : (hasB ? baseSz * 0.45 : baseSz * 0.15));
      if (p.bullet === 'num' || p.bullet === 'alpha') nums[lvl] = (nums[lvl] || 0) + 1; else if (!hasB) nums = {};
      Object.keys(nums).forEach(function (L) { if (+L > lvl) delete nums[L]; });
      var left = indent + hang, avail = Math.max(10, W - left), align = p.align || align0;
      // greedy line fill
      var ps = pieces(p.runs), cur = [], curW = 0, plines = [];
      function flush() { plines.push(cur); cur = []; curW = 0; }
      ps.forEach(function (pc) {
        var sty = styled[pc.ri], w = F.measure(sty.face, pc.t, sty.size, sty.ls), trimmed = pc.t.replace(/\s+$/, ''), tw = F.measure(sty.face, trimmed, sty.size, sty.ls);
        if (cur.length && curW + tw > avail + 0.01) flush();
        if (!cur.length && tw > avail && trimmed.length > 1) {
          broke = true;
          // a word wider than the box: break it by characters
          var chunk = '';
          for (var i = 0; i < pc.t.length; i++) {
            var c = pc.t[i], cw = F.measure(sty.face, chunk + c, sty.size, sty.ls);
            if (chunk && cw > avail) { cur.push({ ri: pc.ri, t: chunk, w: F.measure(sty.face, chunk, sty.size, sty.ls) }); flush(); chunk = c; } else chunk += c;
          }
          pc = { ri: pc.ri, t: chunk }; w = F.measure(sty.face, chunk, sty.size, sty.ls);
        }
        cur.push({ ri: pc.ri, t: pc.t, w: w }); curW += w;
      });
      if (cur.length || !plines.length) flush();
      plines.forEach(function (pl, li) {
        if (!pl.length) pl = [{ ri: 0, t: '', w: 0 }];
        var sz = 0, asc = 0, desc = 0;
        pl.forEach(function (it) {
          var s = styled[it.ri] || runStyle(theme, st, p, { t: '' }, k), vm = F.vmetrics(s.face, s.size);
          sz = Math.max(sz, s.size); asc = Math.max(asc, vm.ascent); desc = Math.max(desc, vm.descent);
        });
        var lineH = Math.max(sz * lh, sz * 0.8), base = y + (lineH - (asc + desc)) / 2 + asc;
        var last = pl[pl.length - 1], trailing = last.t.length - last.t.replace(/\s+$/, '').length;
        var lastS = styled[last.ri] || styled[0];
        var width = pl.reduce(function (s2, it) { return s2 + it.w; }, 0) - (trailing && lastS ? F.measure(lastS.face, last.t.slice(-trailing), lastS.size, lastS.ls) : 0);
        var x0 = left, gap = 0, isLast = li === plines.length - 1;
        if (align === 'c') x0 = left + (avail - width) / 2;
        else if (align === 'r') x0 = left + avail - width;
        else if (align === 'j' && !isLast) { var spaces = pl.reduce(function (n, it) { return n + (it.t.match(/ /g) || []).length; }, 0) - trailing; if (spaces > 0) gap = (avail - width) / spaces; }
        var runs = [], x = x0;
        pl.forEach(function (it) {
          var s = styled[it.ri]; if (!s) return;
          var w = it.w + (gap ? (it.t.match(/ /g) || []).length * gap : 0);
          var prev = runs[runs.length - 1];
          if (prev && !gap && prev.face.key === s.face.key && prev.face.synthItalic === s.face.synthItalic && prev.size === s.size && prev.color === s.color && prev.u === s.u && prev.s === s.s && prev.link === s.link) { prev.text += it.t; prev.w += w; }
          else if (it.t) runs.push({ x: x, text: it.t, w: w, face: s.face, size: s.size, color: s.color, u: s.u, s: s.s, link: s.link, ls: s.ls });
          x += w;
        });
        lines.push({ y: y, h: lineH, base: base, x: x0, w: width, runs: runs, para: pi });
        if (li === 0 && hasB) {
          var bs = styled[0] || runStyle(theme, st, p, { t: '' }, k), bface = bs.face, btxt = bulletText(p, nums[lvl] || 1);
          if (!/num|alpha/.test(p.bullet)) bface = F.face(TH.font(theme, st.font), false, false);
          var bsize = /num|alpha/.test(p.bullet) ? bs.size : bs.size * 0.95;
          var bx = align === 'c' ? x0 - hang : (align === 'r' ? x0 - hang : indent);
          bullets.push({ x: bx, base: base, text: btxt, face: bface, size: bsize, color: TH.color(theme, p.bulletColor || st.bulletColor || (theme.bulletAccent === false ? 'text' : 'accent1'), 'text') });
        }
        y += lineH;
      });
    });
    return { lines: lines, bullets: bullets, height: y, broke: broke };
  }

  /** Lays out a text-bearing object. Returns { lines, bullets, height, scale, inset, box } in object-local points. */
  X.layout = function (o, theme, opts) {
    opts = opts || {};
    var tx = o.text, ins = (tx && tx.inset) || X.INSET;
    var W = Math.max(1, o.w - ins[0] - ins[2]), H = Math.max(1, o.h - ins[1] - ins[3]);
    if (!tx || !tx.paras) return { lines: [], bullets: [], height: 0, scale: 1, inset: ins };
    var k = 1, res = layoutAt(o, theme, 1, W);
    if (tx.autofit === 'shrink' && (res.height > H + 0.5 || res.broke)) {
      var lo = 0.25, hi = 1;
      for (var i = 0; i < 12; i++) { var mid = (lo + hi) / 2, r = layoutAt(o, theme, mid, W); if (r.height > H || r.broke) hi = mid; else lo = mid; }
      k = lo; res = layoutAt(o, theme, k, W);
    }
    var va = tx.valign || 'top', off = ins[1];
    if (va === 'middle') off = ins[1] + (H - res.height) / 2;
    else if (va === 'bottom') off = ins[1] + H - res.height;
    res.lines.forEach(function (l) { l.y += off; l.base += off; l.x += ins[0]; l.runs.forEach(function (r) { r.x += ins[0]; }); });
    res.bullets.forEach(function (b) { b.base += off; b.x += ins[0]; });
    res.scale = k; res.inset = ins; res.top = off;
    return res;
  };
  /** Height the text needs at width w (for "grow" autofit and for new text boxes). */
  X.measureHeight = function (o, theme) {
    var ins = (o.text && o.text.inset) || X.INSET;
    return layoutAt(o, theme, 1, Math.max(1, o.w - ins[0] - ins[2])).height + ins[1] + ins[3];
  };
})();
