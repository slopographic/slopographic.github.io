/* Slop Press — TrueType/OpenType reader and TrueType subsetter (for embedding fonts in PDF).
   parse(u8) → font info with cmap lookup and advances. subset(font, gids) keeps glyph ids stable and
   empties every glyph that is not used (plus composite components), then rebuilds loca/glyf. */
(function () {
  'use strict';
  var PR = window.PR;
  var T = PR.ttf = {};

  function tag(dv, o) { return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3)); }
  T.parse = function (u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), sig = tag(dv, 0);
    if (sig === 'wOFF' || sig === 'wOF2') throw new Error('WOFF fonts cannot be embedded; use .ttf or .otf');
    var n = dv.getUint16(4), tables = {};
    for (var i = 0; i < n; i++) { var r = 12 + i * 16; tables[tag(dv, r)] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) }; }
    var f = { u8: u8, dv: dv, tables: tables, cff: !!tables['CFF '] || sig === 'OTTO' };
    var head = tables.head.off;
    f.upm = dv.getUint16(head + 18);
    f.bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
    f.locFormat = dv.getInt16(head + 50);
    f.numGlyphs = dv.getUint16(tables.maxp.off + 4);
    var hh = tables.hhea.off;
    f.ascent = dv.getInt16(hh + 4); f.descent = dv.getInt16(hh + 6); f.numH = dv.getUint16(hh + 34);
    f.capHeight = f.ascent * 0.7;
    if (tables['OS/2']) { var os = tables['OS/2'].off, ver = dv.getUint16(os); f.weight = dv.getUint16(os + 4); if (ver >= 2 && tables['OS/2'].len >= 90) f.capHeight = dv.getInt16(os + 88); f.fsType = dv.getUint16(os + 8); }
    f.italicAngle = tables.post ? dv.getInt32(tables.post.off + 4) / 65536 : 0;
    readNames(f); readCmap(f);
    return f;
  };
  function readNames(f) {
    var t = f.tables.name; f.names = {}; if (!t) return;
    var dv = f.dv, o = t.off, count = dv.getUint16(o + 2), so = o + dv.getUint16(o + 4);
    for (var i = 0; i < count; i++) {
      var r = o + 6 + i * 12, pid = dv.getUint16(r), id = dv.getUint16(r + 6), len = dv.getUint16(r + 8), off = dv.getUint16(r + 10), s = '';
      if (pid === 3 || pid === 0) { for (var k = 0; k < len; k += 2) s += String.fromCharCode(dv.getUint16(so + off + k)); }
      else if (pid === 1) { for (var j = 0; j < len; j++) s += String.fromCharCode(dv.getUint8(so + off + j)); }
      if (s && (!f.names[id] || pid === 3)) f.names[id] = s;
    }
    f.family = f.names[16] || f.names[1]; f.subfamily = f.names[17] || f.names[2]; f.psName = (f.names[6] || (f.family || 'Font').replace(/\s+/g, '')).replace(/[^\x21-\x7e]/g, '').replace(/[()<>[\]{}/%]/g, '');
  }
  function readCmap(f) {
    var dv = f.dv, t = f.tables.cmap; f.map = {};
    if (!t) return;
    var n = dv.getUint16(t.off + 2), best = null, bestScore = -1;
    for (var i = 0; i < n; i++) {
      var r = t.off + 4 + i * 8, pid = dv.getUint16(r), eid = dv.getUint16(r + 2), off = t.off + dv.getUint32(r + 4), fmt = dv.getUint16(off);
      var score = fmt === 12 ? 3 : fmt === 4 && pid === 3 && eid === 1 ? 2 : fmt === 4 ? 1 : 0;
      if (score > bestScore) { bestScore = score; best = off; }
    }
    if (best === null) return;
    var fmt2 = dv.getUint16(best);
    if (fmt2 === 4) {
      var segX2 = dv.getUint16(best + 6), ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (var s = 0; s < segX2; s += 2) {
        var end = dv.getUint16(ends + s), start = dv.getUint16(starts + s), delta = dv.getInt16(deltas + s), ro = dv.getUint16(ranges + s);
        for (var c = start; c <= end && c !== 0xFFFF; c++) {
          var g = ro ? dv.getUint16(ranges + s + ro + (c - start) * 2) : c;
          if (ro && g) g = (g + delta) & 0xFFFF; else if (!ro) g = (c + delta) & 0xFFFF;
          if (g) f.map[c] = g;
        }
      }
    } else if (fmt2 === 12) {
      var groups = dv.getUint32(best + 12);
      for (var k = 0; k < groups; k++) { var q = best + 16 + k * 12, sc = dv.getUint32(q), ec = dv.getUint32(q + 4), sg = dv.getUint32(q + 8); for (var cc = sc; cc <= ec && cc - sc < 65536; cc++) f.map[cc] = sg + cc - sc; }
    }
  }
  T.gid = function (f, cp) { return f.map[cp] || 0; };
  /** Advance width of a glyph in 1/1000 em. */
  T.advance = function (f, gid) {
    var dv = f.dv, o = f.tables.hmtx.off, i = Math.min(gid, f.numH - 1);
    return dv.getUint16(o + i * 4) * 1000 / f.upm;
  };
  /** Family / style names from raw bytes (for the font loader). */
  T.names = function (u8) { try { var f = T.parse(u8); return { family: f.family, subfamily: f.subfamily }; } catch (e) { return null; } };

  function glyphRange(f, gid) {
    var dv = f.dv, lo = f.tables.loca.off, a, b;
    if (f.locFormat === 0) { a = dv.getUint16(lo + gid * 2) * 2; b = dv.getUint16(lo + gid * 2 + 2) * 2; }
    else { a = dv.getUint32(lo + gid * 4); b = dv.getUint32(lo + gid * 4 + 4); }
    return [f.tables.glyf.off + a, f.tables.glyf.off + b];
  }
  function components(f, gid, out) {
    var r = glyphRange(f, gid); if (r[1] <= r[0]) return;
    var dv = f.dv, p = r[0];
    if (dv.getInt16(p) >= 0) return;
    p += 10;
    for (var guard = 0; guard < 64; guard++) {
      var flags = dv.getUint16(p), g = dv.getUint16(p + 2);
      if (!out[g]) { out[g] = 1; components(f, g, out); }
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  }
  function sum(u8) { var s = 0, n = u8.length; for (var i = 0; i < n; i += 4) s = (s + ((u8[i] << 24) | ((u8[i + 1] || 0) << 16) | ((u8[i + 2] || 0) << 8) | (u8[i + 3] || 0))) >>> 0; return s; }
  /** Subset of a TrueType font keeping glyph ids. gids: { gid: 1 }. Returns Uint8Array (a valid .ttf). */
  T.subset = function (f, gids) {
    if (f.cff || !f.tables.glyf || !f.tables.loca) return f.u8;
    var keep = { 0: 1 }; for (var g in gids) keep[g] = 1;
    Object.keys(keep).forEach(function (k) { components(f, +k, keep); });
    var parts = [], offs = new Uint32Array(f.numGlyphs + 1), pos = 0;
    for (var i = 0; i < f.numGlyphs; i++) {
      offs[i] = pos;
      if (keep[i]) { var r = glyphRange(f, i), len = r[1] - r[0]; if (len > 0) { var pad = (len + 3) & ~3, b = new Uint8Array(pad); b.set(f.u8.subarray(r[0], r[1])); parts.push(b); pos += pad; } }
    }
    offs[f.numGlyphs] = pos;
    var glyf = new Uint8Array(pos), q = 0; parts.forEach(function (b) { glyf.set(b, q); q += b.length; });
    var loca = new Uint8Array((f.numGlyphs + 1) * 4), ldv = new DataView(loca.buffer);
    for (var j = 0; j <= f.numGlyphs; j++) ldv.setUint32(j * 4, offs[j]);
    var out = {};
    ['cmap', 'cvt ', 'fpgm', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'prep'].forEach(function (t) { var e = f.tables[t]; if (e) out[t] = f.u8.slice(e.off, e.off + e.len); });
    out.glyf = glyf; out.loca = loca;
    var hd = new DataView(out.head.buffer); hd.setInt16(50, 1); hd.setUint32(8, 0);
    var tags = Object.keys(out).sort(), nt = tags.length, dirLen = 12 + nt * 16, total = dirLen;
    tags.forEach(function (t) { total += (out[t].length + 3) & ~3; });
    var font = new Uint8Array(total), dv = new DataView(font.buffer);
    dv.setUint32(0, 0x00010000); dv.setUint16(4, nt);
    var es = Math.floor(Math.log2(nt)), sr = Math.pow(2, es) * 16;
    dv.setUint16(6, sr); dv.setUint16(8, es); dv.setUint16(10, nt * 16 - sr);
    var off = dirLen, headOff = 0;
    tags.forEach(function (t, k) {
      var d = out[t], r = 12 + k * 16;
      for (var c = 0; c < 4; c++) dv.setUint8(r + c, t.charCodeAt(c));
      dv.setUint32(r + 4, sum(d)); dv.setUint32(r + 8, off); dv.setUint32(r + 12, d.length);
      font.set(d, off); if (t === 'head') headOff = off;
      off += (d.length + 3) & ~3;
    });
    dv.setUint32(headOff + 8, (0xB1B0AFBA - sum(font)) >>> 0);
    return font;
  };
})();
