/* Slop Slides: table and chart scenes (object-local display nodes). */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, TH = SS.themes, SH = SS.shapes, X = SS.textLayout;

  SS.tableScene = {
    /** Cell rectangles in object-local points: [{r, c, x, y, w, h}] */
    cells: function (t) {
      var out = [], y = 0, sx = t.w / t.colW.reduce(function (a, b) { return a + b; }, 0), sy = t.h / t.rowH.reduce(function (a, b) { return a + b; }, 0);
      t.cells.forEach(function (row, r) {
        var x = 0, h = t.rowH[r] * sy;
        row.forEach(function (cell, c) { var w = t.colW[c] * sx; out.push({ r: r, c: c, x: x, y: y, w: w, h: h, cell: cell }); x += w; });
        y += h;
      });
      return out;
    },
    nodes: function (theme, t) {
      var nodes = [], acc = TH.color(theme, t.accent || 'accent1'), headText = U.luma(acc) > 0.55 ? '#111111' : '#ffffff';
      var band = U.mix(theme.colors.bg, theme.colors.text, theme.dark ? 0.07 : 0.045), line = U.mix(theme.colors.bg, theme.colors.text, 0.18);
      SS.tableScene.cells(t).forEach(function (q) {
        var head = t.header && q.r === 0, fill = q.cell.fill ? TH.color(theme, q.cell.fill) : head ? acc : (t.banded && q.r % 2 === (t.header ? 0 : 1) ? band : null);
        if (fill) nodes.push({ k: 'path', path: SH.rect(q.w, q.h).map(function (c) { return c.map(function (v, i) { return i ? v + (i % 2 ? q.x : q.y) : v; }); }), fill: { type: 'solid', color: fill, alpha: 1 } });
        var st = Object.assign({}, t.style, { color: head ? headText : (t.style.color || 'text'), bold: head || !!t.style.bold });
        var lay = X.layout({ w: q.w, h: q.h, style: st, text: Object.assign({}, q.cell.text, { valign: q.cell.valign || 'middle', inset: [8, 4, 8, 4] }) }, theme);
        nodes.push({ k: 'group', m: U.mat.translate(q.x, q.y), children: SS.scene.textNodes(lay) });
      });
      // grid lines
      var cells = SS.tableScene.cells(t), path = [];
      cells.forEach(function (q) { if (q.c === 0 && q.r > 0) path.push(['M', 0, q.y], ['L', t.w, q.y]); });
      path.push(['M', 0, t.h], ['L', t.w, t.h]);
      if (!t.header) path.push(['M', 0, 0], ['L', t.w, 0]);
      nodes.push({ k: 'path', path: path, stroke: { color: line, width: 1, alpha: 1 } });
      return nodes;
    }
  };

  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function fmt(v) { return Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : String(Math.round(v * 100) / 100); }
  function label(theme, text, x, y, size, color, align, bold) {
    var face = SS.fonts.face(theme.fonts.body, !!bold, false), w = SS.fonts.measure(face, text, size);
    return { k: 'text', x: align === 'c' ? x - w / 2 : align === 'r' ? x - w : x, y: y, text: text, face: face, size: size, color: color };
  }
  SS.chartScene = {
    colors: function (theme, ch) { return ch.data.series.map(function (s, i) { return TH.color(theme, s.color || 'accent' + (i % 6 + 1)); }); },
    nodes: function (theme, ch) {
      var nodes = [], d = ch.data, W = ch.w, H = ch.h, fs = (ch.style && ch.style.size) || 14, tc = TH.color(theme, (ch.style && ch.style.color) || 'text2');
      var cols = SS.chartScene.colors(theme, ch), top = 6, legendH = ch.legend ? fs * 2 : 0;
      if (ch.title) { nodes.push(label(theme, ch.title, W / 2, fs * 1.3, fs * 1.25, TH.color(theme, 'text'), 'c', true)); top = fs * 2.2; }
      if (ch.legend) {
        var items = ch.chart === 'pie' ? d.cats : d.series.map(function (s) { return s.name; });
        var face = SS.fonts.face(theme.fonts.body), tot = 0, widths = items.map(function (n) { var w = SS.fonts.measure(face, String(n), fs) + fs * 1.9; tot += w; return w; });
        var lx = Math.max(0, (W - tot) / 2), ly = H - fs * 0.7;
        items.forEach(function (n, i) {
          var c = ch.chart === 'pie' ? TH.color(theme, 'accent' + (i % 6 + 1)) : cols[i];
          nodes.push({ k: 'path', path: SH.roundRect(fs * 0.8, fs * 0.8, fs * 0.2).map(function (q) { return q.map(function (v, j) { return j ? v + (j % 2 ? lx : ly - fs * 0.75) : v; }); }), fill: { type: 'solid', color: c, alpha: 1 } });
          nodes.push(label(theme, String(n), lx + fs * 1.15, ly, fs, tc, 'l'));
          lx += widths[i];
        });
      }
      var plotB = H - legendH - fs * 1.8;
      if (ch.chart === 'pie') return nodes.concat(pie(theme, ch, W, top, plotB + fs * 1.8 - top, fs));
      var maxV = 0, minV = 0;
      d.series.forEach(function (s) { s.values.forEach(function (v) { maxV = Math.max(maxV, +v || 0); minV = Math.min(minV, +v || 0); }); });
      var hi = niceMax(maxV), lo = minV < 0 ? -niceMax(-minV) : 0, ticks = 4;
      var face2 = SS.fonts.face(theme.fonts.body), axisW = Math.max.apply(null, [hi, lo].map(function (v) { return SS.fonts.measure(face2, fmt(v), fs); })) + fs * 0.8;
      var x0 = axisW, x1 = W - 6, y0 = top + fs * 0.5, y1 = plotB, Y = function (v) { return y1 - (v - lo) / (hi - lo) * (y1 - y0); };
      var grid = [], gc = U.mix(theme.colors.bg, theme.colors.text, 0.16);
      for (var i = 0; i <= ticks; i++) { var v = lo + (hi - lo) * i / ticks, y = Y(v); grid.push(['M', x0, y], ['L', x1, y]); nodes.push(label(theme, fmt(v), x0 - fs * 0.5, y + fs * 0.35, fs, tc, 'r')); }
      nodes.unshift({ k: 'path', path: grid, stroke: { color: gc, width: 0.75, alpha: 1 } });
      var n = d.cats.length || 1, slot = (x1 - x0) / n;
      d.cats.forEach(function (c, ci) { nodes.push(label(theme, String(c), x0 + slot * (ci + 0.5), y1 + fs * 1.35, fs, tc, 'c')); });
      if (ch.chart === 'line') {
        d.series.forEach(function (s, si) {
          var pts = s.values.map(function (v, vi) { return [x0 + slot * (vi + 0.5), Y(+v || 0)]; });
          nodes.push({ k: 'path', path: pts.map(function (p, pi) { return [pi ? 'L' : 'M', p[0], p[1]]; }), stroke: { color: cols[si], width: Math.max(2, fs * 0.2), alpha: 1, join: 'round' } });
          pts.forEach(function (p) { nodes.push({ k: 'path', path: SH.ellipse(fs * 0.55, fs * 0.55, p[0] - fs * 0.275, p[1] - fs * 0.275), fill: { type: 'solid', color: cols[si], alpha: 1 }, stroke: { color: theme.colors.bg, width: 1.5, alpha: 1 } }); });
          if (ch.labels) pts.forEach(function (p, vi) { nodes.push(label(theme, fmt(+s.values[vi] || 0), p[0], p[1] - fs * 0.6, fs * 0.85, tc, 'c')); });
        });
      } else {
        var ns = d.series.length || 1, group = slot * 0.72, bw = group / ns;
        d.series.forEach(function (s, si) {
          s.values.forEach(function (v, vi) {
            v = +v || 0;
            var bx = x0 + slot * vi + (slot - group) / 2 + bw * si, ya = Y(Math.max(v, 0)), yb = Y(Math.min(v, 0)), r = Math.min(bw * 0.18, 5);
            nodes.push({ k: 'path', path: SH.roundRect(bw * 0.86, Math.max(0.5, yb - ya), r).map(function (q) { return q.map(function (val, j) { return j ? val + (j % 2 ? bx + bw * 0.07 : ya) : val; }); }), fill: { type: 'solid', color: cols[si], alpha: 1 } });
            if (ch.labels) nodes.push(label(theme, fmt(v), bx + bw / 2, ya - fs * 0.35, fs * 0.85, tc, 'c'));
          });
        });
      }
      return nodes;
    }
  };
  function pie(theme, ch, W, top, H, fs) {
    var vals = (ch.data.series[0] ? ch.data.series[0].values : []).map(function (v) { return Math.max(0, +v || 0); });
    var sum = vals.reduce(function (a, b) { return a + b; }, 0) || 1, r = Math.min(W, H) / 2 * 0.9, cx = W / 2, cy = top + H / 2 - fs * 0.6, a0 = -Math.PI / 2, out = [];
    vals.forEach(function (v, i) {
      var a1 = a0 + v / sum * Math.PI * 2, path = [['M', cx, cy]], steps = Math.max(1, Math.ceil((a1 - a0) / (Math.PI / 2)));
      path.push(['L', cx + Math.cos(a0) * r, cy + Math.sin(a0) * r]);
      for (var s = 0; s < steps; s++) {
        var b0 = a0 + (a1 - a0) * s / steps, b1 = a0 + (a1 - a0) * (s + 1) / steps, k = 4 / 3 * Math.tan((b1 - b0) / 4);
        path.push(['C', cx + r * (Math.cos(b0) - k * Math.sin(b0)), cy + r * (Math.sin(b0) + k * Math.cos(b0)), cx + r * (Math.cos(b1) + k * Math.sin(b1)), cy + r * (Math.sin(b1) - k * Math.cos(b1)), cx + r * Math.cos(b1), cy + r * Math.sin(b1)]);
      }
      path.push(['Z']);
      out.push({ k: 'path', path: path, fill: { type: 'solid', color: TH.color(theme, 'accent' + (i % 6 + 1)), alpha: 1 }, stroke: { color: theme.colors.bg, width: 2, alpha: 1 } });
      if (ch.labels && v > 0) { var am = (a0 + a1) / 2; out.push(label(theme, Math.round(v / sum * 100) + '%', cx + Math.cos(am) * r * 0.65, cy + Math.sin(am) * r * 0.65 + fs * 0.35, fs, '#ffffff', 'c', true)); }
      a0 = a1;
    });
    return out;
  }
})();
