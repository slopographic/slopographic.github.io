/* Slop Slides: a small TrueType reader (cmap 4/12, hmtx, vertical metrics) used both for text layout and
   for PDF embedding, plus a glyf subsetter: glyph ids stay stable, unused glyphs become empty, composite
   glyph components are kept. The same metrics drive the screen and the PDF, which is what gives print parity. */
(function () {
  'use strict';
  var SS = window.SS;
  var T = SS.ttf = {};
  function tag(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }

  T.parse = function (u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var n = dv.getUint16(4), tables = {};
    for (var i = 0; i < n; i++) { var r = 12 + i * 16; tables[tag(dv, r)] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) }; }
    if (!tables.glyf || !tables.loca) throw new Error('Only TrueType (glyf) fonts are supported');
    var f = { u8: u8, dv: dv, tables: tables };
    var head = tables.head.off;
    f.upm = dv.getUint16(head + 18);
    f.bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
    f.locFormat = dv.getInt16(head + 50);
    f.numGlyphs = dv.getUint16(tables.maxp.off + 4);
    var hh = tables.hhea.off;
    f.ascent = dv.getInt16(hh + 4); f.descent = dv.getInt16(hh + 6); f.lineGap = dv.getInt16(hh + 8); f.numH = dv.getUint16(hh + 34);
    f.capHeight = f.ascent * 0.7; f.weight = 400;
    if (tables['OS/2']) {
      var os = tables['OS/2'].off, ver = dv.getUint16(os);
      f.weight = dv.getUint16(os + 4);
      if (tables['OS/2'].len >= 78) { f.ascent = dv.getInt16(os + 68); f.descent = dv.getInt16(os + 70); f.lineGap = dv.getInt16(os + 72); }
      if (ver >= 2 && tables['OS/2'].len >= 90) f.capHeight = dv.getInt16(os + 88);
    }
    f.italicAngle = tables.post ? dv.getInt32(tables.post.off + 4) / 65536 : 0;
    f.adv = new Uint16Array(f.numGlyphs);
    var hm = tables.hmtx.off, last = 0;
    for (var g = 0; g < f.numGlyphs; g++) { if (g < f.numH) last = dv.getUint16(hm + g * 4); f.adv[g] = last; }
    readCmap(f);
    return f;
  };
  function readCmap(f) {
    var dv = f.dv, base = f.tables.cmap.off, n = dv.getUint16(base + 2), best = -1, bestFmt = 0;
    f.cmap = new Map();
    for (var i = 0; i < n; i++) {
      var pid = dv.getUint16(base + 4 + i * 8), eid = dv.getUint16(base + 6 + i * 8), off = base + dv.getUint32(base + 8 + i * 8), fmt = dv.getUint16(off);
      if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) { if (fmt === 12 || (fmt === 4 && bestFmt !== 12)) { best = off; bestFmt = fmt; } }
    }
    if (best < 0) return;
    if (bestFmt === 4) {
      var seg = dv.getUint16(best + 6) / 2, ends = best + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
      for (var s = 0; s < seg; s++) {
        var end = dv.getUint16(ends + s * 2), st = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(ranges + s * 2);
        for (var c = st; c <= end && c !== 0xFFFF; c++) {
          var gid;
          if (!ro) gid = (c + delta) & 0xFFFF;
          else { var p = ranges + s * 2 + ro + (c - st) * 2; gid = dv.getUint16(p); if (gid) gid = (gid + delta) & 0xFFFF; }
          if (gid) f.cmap.set(c, gid);
        }
      }
    } else {
      var groups = dv.getUint32(best + 12);
      for (var k = 0; k < groups; k++) {
        var o = best + 16 + k * 12, a = dv.getUint32(o), b = dv.getUint32(o + 4), g0 = dv.getUint32(o + 8);
        for (var cc = a; cc <= b; cc++) f.cmap.set(cc, g0 + cc - a);
      }
    }
  }
  T.gid = function (f, cp) { return f.cmap.get(cp) || 0; };
  /** Advance width of a string in font units (no kerning: the canvas is told not to kern either). */
  T.width = function (f, s) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var cp = s.codePointAt(i); if (cp > 0xFFFF) i++;
      w += f.adv[T.gid(f, cp)] || 0;
    }
    return w;
  };
  T.has = function (f, cp) { return f.cmap.has(cp); };

  function glyphRange(f, g) {
    var dv = f.dv, lo = f.tables.loca.off;
    if (f.locFormat === 0) return [dv.getUint16(lo + g * 2) * 2, dv.getUint16(lo + g * 2 + 2) * 2];
    return [dv.getUint32(lo + g * 4), dv.getUint32(lo + g * 4 + 4)];
  }
  /** Returns a TrueType font that keeps only the glyphs in `gids` (Set), composites resolved. */
  T.subset = function (f, gids) {
    var keep = new Set([0]), stack = Array.from(gids), dv = f.dv, gl = f.tables.glyf.off;
    while (stack.length) {
      var g = stack.pop(); if (keep.has(g) || g >= f.numGlyphs) continue; keep.add(g);
      var r = glyphRange(f, g); if (r[1] <= r[0]) continue;
      var p = gl + r[0];
      if (dv.getInt16(p) >= 0) continue;
      p += 10;
      for (;;) {
        var flags = dv.getUint16(p), comp = dv.getUint16(p + 2); stack.push(comp);
        p += 4 + ((flags & 1) ? 4 : 2);
        if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
        if (!(flags & 0x20)) break;
      }
    }
    keep.forEach(function (g) { gids.add(g); });
    var parts = [], loca = new Uint32Array(f.numGlyphs + 1), size = 0;
    for (var gi = 0; gi < f.numGlyphs; gi++) {
      loca[gi] = size;
      if (keep.has(gi)) { var rr = glyphRange(f, gi), len = rr[1] - rr[0]; if (len > 0) { parts.push(f.u8.subarray(gl + rr[0], gl + rr[1])); size += len; if (size % 4) { var pad = 4 - size % 4; parts.push(new Uint8Array(pad)); size += pad; } } }
    }
    loca[f.numGlyphs] = size;
    var glyf = new Uint8Array(size), at = 0;
    parts.forEach(function (p) { glyf.set(p, at); at += p.length; });
    var locaB = new Uint8Array((f.numGlyphs + 1) * 4), ldv = new DataView(locaB.buffer);
    for (var li = 0; li <= f.numGlyphs; li++) ldv.setUint32(li * 4, loca[li]);
    var out = {};
    ['head', 'hhea', 'maxp', 'hmtx', 'cvt ', 'fpgm', 'prep', 'OS/2', 'post', 'name'].forEach(function (t) {
      if (f.tables[t]) out[t] = f.u8.slice(f.tables[t].off, f.tables[t].off + f.tables[t].len);
    });
    if (out.post) { out.post = out.post.slice(0, 32); new DataView(out.post.buffer).setUint32(0, 0x00030000); } // no glyph names
    new DataView(out.head.buffer).setInt16(50, 1); // long loca
    new DataView(out.head.buffer).setUint32(8, 0); // checkSumAdjustment recomputed below
    out.loca = locaB; out.glyf = glyf;
    return build(out);
  };
  function checksum(u8) {
    var sum = 0, n = Math.ceil(u8.length / 4) * 4, b = new Uint8Array(n); b.set(u8);
    var dv = new DataView(b.buffer);
    for (var i = 0; i < n; i += 4) sum = (sum + dv.getUint32(i)) >>> 0;
    return sum;
  }
  function build(tables) {
    var tags = Object.keys(tables).sort(), n = tags.length, off = 12 + n * 16, total = off;
    tags.forEach(function (t) { total += Math.ceil(tables[t].length / 4) * 4; });
    var out = new Uint8Array(total), dv = new DataView(out.buffer);
    var es = Math.floor(Math.log2(n)), sr = Math.pow(2, es) * 16;
    dv.setUint32(0, 0x00010000); dv.setUint16(4, n); dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, n * 16 - sr);
    var headOff = 0;
    tags.forEach(function (t, i) {
      var data = tables[t], r = 12 + i * 16;
      for (var k = 0; k < 4; k++) dv.setUint8(r + k, t.charCodeAt(k));
      dv.setUint32(r + 4, checksum(data)); dv.setUint32(r + 8, off); dv.setUint32(r + 12, data.length);
      out.set(data, off); if (t === 'head') headOff = off;
      off += Math.ceil(data.length / 4) * 4;
    });
    dv.setUint32(headOff + 8, (0xB1B0AFBA - checksum(out)) >>> 0);
    return out;
  }
})();
