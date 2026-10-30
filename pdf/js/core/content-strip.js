/* Slop PDF — removing text from a page's content stream. Pure (no DOM), tested alone in Node
   (tests/node/pdf-content-strip.test.mjs). Works on the operators of content-lex.js.
     glyphs(ops, fonts) → every glyph the page's own stream shows: { k (operator index), at (string index in the
       operator), code, x, y (its origin, PDF user space), w (its advance, user space), up (upright), tr (render mode) }.
       fonts(name) → { two (two-byte codes), width(code) → 1/1000 em } or null when the font cannot be measured (then the
       glyphs it shows, and the ones after them up to the next line move, have no known place and are never picked).
     strip(src, fonts, targets) → { text, dropped, first } or null. targets: [{ x0, x1, y, fs }] in user space: a glyph is
       dropped when its centre is in x0..x1 and its origin on the line of baseline y. Each text operator that shows a dropped glyph
       is rewritten as a TJ array that keeps the other glyphs and moves the pen past the dropped ones by their advance
       (a numeric adjustment), so nothing after it moves; one left with no glyphs and no kept text after it in its BT
       goes. ' and " keep their line move (and their spacing). Every other operator stays byte for byte. null when nothing matched, when a dropped glyph is invisible (render mode 3: the
       words a scan shows are in its picture, so removing them would change nothing on the page) or clipping text (modes
       4 to 7: its removal would change what is clipped). Text in Form XObjects is not in the page's stream: not found.
   Text state follows the PDF model: Tc, Tw, Tz, TL, Tf, Ts and Tr are graphics state (q/Q), Tm and Tlm are per BT. */
(function (root, factory) {
  var api = factory(root.SlopPdfLex || (typeof require === 'function' ? require('./content-lex.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfStrip = api;
})(typeof window !== 'undefined' ? window : globalThis, function (Lx) {
  'use strict';
  /** m1 × m2 for PDF matrices [a b c d e f]. */
  function mul(m1, m2) {
    return [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  var ID = [1, 0, 0, 1, 0, 0];
  function nums(args, n) {
    if (args.length < n) return null;
    var a = args.slice(args.length - n);
    return a.every(function (v) { return typeof v === 'number' && isFinite(v); }) ? a : null;
  }

  /** Walks the operators: calls show(k, el, ts) for each string a text operator shows (el: the string, ts: the text state
   * with Tm, CTM and a known flag) and keeps the state. opts (content-ink.js): gs0, the graphics state to start from (a
   * form's caller's); each(op, gs), called for every operator first (the colour state); form(name) → { ops, fonts, matrix,
   * opts } for a Form XObject to walk into (null: not followed). Returns nothing. */
  function walk(ops, fonts, show, opts) {
    opts = opts || {};
    var gs = Object.assign({ ctm: ID, tc: 0, tw: 0, th: 1, tl: 0, font: null, fs: 0, rise: 0, tr: 0 }, opts.gs0 || {}), stack = [];
    var tm = ID, tlm = ID, known = true;
    function lineMove(tx, ty) { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; known = true; }
    function adv(tx) { tm = mul([1, 0, 0, 1, tx, 0], tm); }
    function shows(k, str, si) {
      var f = gs.font ? fonts(gs.font) : null;
      var res = show(k, str, { gs: gs, tm: tm, known: known && !!f, f: f, si: si || 0 });
      if (!f || res == null) { known = false; return; }
      adv(res);
    }
    ops.forEach(function (o, k) {
      var a = o.args, n;
      if (opts.each) opts.each(o, gs);
      switch (o.op) {
        case 'Do':
          var x = opts.form && a[0] && a[0].name != null ? opts.form(a[0].name) : null;
          if (x) walk(x.ops, x.fonts, show, Object.assign({}, x.opts, { gs0: Object.assign({}, gs, { ctm: mul(x.matrix || ID, gs.ctm) }) }));
          break;
        case 'q': stack.push(Object.assign({}, gs)); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': if ((n = nums(a, 6))) gs.ctm = mul(n, gs.ctm); break;
        case 'BT': tm = tlm = ID; known = true; break;
        case 'Tc': if ((n = nums(a, 1))) gs.tc = n[0]; break;
        case 'Tw': if ((n = nums(a, 1))) gs.tw = n[0]; break;
        case 'Tz': if ((n = nums(a, 1))) gs.th = n[0] / 100; break;
        case 'TL': if ((n = nums(a, 1))) gs.tl = n[0]; break;
        case 'Ts': if ((n = nums(a, 1))) gs.rise = n[0]; break;
        case 'Tr': if ((n = nums(a, 1))) gs.tr = n[0]; break;
        case 'Tf': if (a.length >= 2 && a[0] && a[0].name != null && typeof a[1] === 'number') { gs.font = a[0].name; gs.fs = a[1]; } break;
        case 'Td': if ((n = nums(a, 2))) lineMove(n[0], n[1]); break;
        case 'TD': if ((n = nums(a, 2))) { gs.tl = -n[1]; lineMove(n[0], n[1]); } break;
        case 'Tm': if ((n = nums(a, 6))) { tlm = tm = n; known = true; } break;
        case 'T*': lineMove(0, -gs.tl); break;
        case 'Tj': if (a.length && a[a.length - 1].str != null) shows(k, a[a.length - 1].str); break;
        case "'": lineMove(0, -gs.tl); if (a.length && a[a.length - 1].str != null) shows(k, a[a.length - 1].str); break;
        case '"':
          if (a.length >= 3 && typeof a[0] === 'number' && typeof a[1] === 'number') { gs.tw = a[0]; gs.tc = a[1]; }
          lineMove(0, -gs.tl);
          if (a.length && a[a.length - 1].str != null) shows(k, a[a.length - 1].str);
          break;
        case 'TJ':
          var arr = Array.isArray(a[a.length - 1]) ? a[a.length - 1] : [], si = 0;
          arr.forEach(function (el) {
            if (typeof el === 'number') { if (known) adv(-el / 1000 * gs.fs * gs.th); }
            else if (el && el.str != null) shows(k, el.str, si++);
          });
          break;
      }
    });
  }

  /** The codes of a string in a font: one byte each, or two for a two-byte (Identity) font. */
  function codesOf(str, f) {
    var out = [];
    if (f && f.two) for (var i = 0; i + 1 < str.length; i += 2) out.push({ c: str.charCodeAt(i) * 256 + str.charCodeAt(i + 1), b: str.substr(i, 2) });
    else for (var j = 0; j < str.length; j++) out.push({ c: str.charCodeAt(j), b: str[j] });
    return out;
  }
  /** The advance (text space, before Th) of one code: its width, Tc, and Tw for a one-byte space. */
  function advOf(code, f, gs) {
    return (f.width(code.c) / 1000) * gs.fs + gs.tc + (!f.two && code.c === 32 ? gs.tw : 0);
  }

  /** Every glyph the stream shows with a known place. */
  function glyphs(ops, fonts, opts) {
    var out = [];
    walk(ops, fonts, function (k, str, t) {
      if (!t.f) return null;
      var m = mul(t.tm, t.gs.ctm), dx = 0, gs = t.gs;
      var up = m[0] > 0 && m[3] > 0 && Math.abs(m[1]) < 1e-3 * Math.abs(m[0]) && Math.abs(m[2]) < 1e-3 * Math.abs(m[3]);
      codesOf(str, t.f).forEach(function (code, at) {
        var w0 = (t.f.width(code.c) / 1000) * gs.fs * gs.th, o = apply(m, dx, gs.rise), e = apply(m, dx + w0, gs.rise);
        if (t.known) out.push({ k: k, si: t.si, at: at, code: code.c, x: o[0], y: o[1], w: e[0] - o[0], cx: (o[0] + e[0]) / 2, up: up, tr: gs.tr, fs: Math.abs(gs.fs * m[3]), fill: gs.fill, stroke: gs.stroke });
        dx += advOf(code, t.f, gs) * gs.th;
      });
      return dx;
    }, opts);
    return out;
  }
  /** Whether a glyph is in a target: its centre within x0..x1, its origin on the line of baseline y (from 0.3 em below it
   * to 0.6 em above: a shaped mark or accent placed above the letters is part of the line, the next line is not). */
  function inTarget(g, ts) {
    return g.up && ts.some(function (t) {
      var fs = t.fs || g.fs || 10, dy = g.y - t.y;
      return dy >= -Math.max(0.6, 0.3 * fs) && dy <= Math.max(0.6, 0.6 * fs) && g.cx >= t.x0 - 0.01 && g.cx <= t.x1 + 0.01;
    });
  }

  /** Rewrites the stream without the glyphs in the targets (see the header). */
  function strip(src, fonts, targets) {
    var ops = Lx.lex(src), drop = new Map(), dropped = 0, first = -1, bad = false;
    glyphs(ops, fonts).forEach(function (g) {
      if (!inTarget(g, targets)) return;
      if (g.tr >= 3) bad = true; // invisible (3: what shows is a picture, as in a scan) or clipping (4 to 7)
      if (!drop.has(g.k)) drop.set(g.k, []);
      drop.get(g.k).push(g);
      dropped++;
      if (first < 0 || g.k < first) first = g.k;
    });
    if (bad || !dropped) return null;
    // the replacement of each operator that loses glyphs, from the state it ran in
    var repl = new Map();
    walk(ops, fonts, function (k, str, t) {
      if (!t.f) return null;
      var gs = t.gs, adv = 0, codes = codesOf(str, t.f);
      codes.forEach(function (c) { adv += advOf(c, t.f, gs) * gs.th; });
      var mine = drop.has(k) ? drop.get(k).filter(function (g) { return g.si === t.si; }) : [];
      if (mine.length) {
        if (!gs.fs) { bad = true; return adv; }
        var gone = new Set(mine.map(function (g) { return g.at; })), parts = [], keep = '', pend = 0;
        codes.forEach(function (c, i) {
          if (gone.has(i)) { if (keep) { parts.push({ str: keep }); keep = ''; } pend += advOf(c, t.f, gs) / gs.fs * 1000; }
          else { if (pend) { parts.push(-pend); pend = 0; } keep += c.b; }
        });
        if (keep) parts.push({ str: keep });
        if (pend) parts.push(-pend);
        if (!repl.has(k)) repl.set(k, {});
        repl.get(k)[t.si] = parts;
      }
      return adv;
    });
    if (bad) return null;
    var out = '', at = 0, parts = new Map();
    repl.forEach(function (r, k) { var o = ops[k]; parts.set(k, o.op === 'TJ' ? mergeTJ(o.args[o.args.length - 1], r) : r[0]); });
    var omit = trailing(ops, parts);
    Array.from(repl.keys()).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var o = ops[k];
      out += src.slice(at, o.s) + (omit.has(k) ? prefix(o).trim() : prefix(o) + tj(parts.get(k)));
      at = o.e;
    });
    return { text: out + src.slice(at), dropped: dropped, first: first };
  }
  var SHOW = { Tj: 1, TJ: 1, "'": 1, '"': 1 };
  /** The rewritten operators left with no glyphs that no kept text follows in their text object: their pen move matters
   * to nothing, so they go altogether (a lone move would read as a space to text extraction). */
  function trailing(ops, parts) {
    var omit = new Set(), shows = [];
    function close() {
      for (var i = shows.length - 1; i >= 0; i--) {
        var p = parts.get(shows[i]);
        if (!p || p.some(function (x) { return typeof x !== 'number'; })) break;
        omit.add(shows[i]);
      }
      shows = [];
    }
    ops.forEach(function (o, k) { if (o.op === 'BT' || o.op === 'ET') close(); else if (SHOW[o.op]) shows.push(k); });
    close();
    return omit;
  }
  /** A TJ's new elements: its numbers stay where they were, its strings become their rewritten parts. */
  function mergeTJ(arr, r) {
    var out = [], si = 0;
    arr.forEach(function (el) {
      if (typeof el === 'number') { out.push(el); return; }
      if (!el || el.str == null) return;
      out = out.concat(r[si] || [el]); si++;
    });
    return out;
  }
  /** What a rewritten ' or " still does before its text: the line move, and for " the word and character spacing. */
  function prefix(o) {
    var a = o.args;
    if (o.op === "'") return 'T* ';
    if (o.op === '"') return Lx.num(a[0]) + ' Tw ' + Lx.num(a[1]) + ' Tc T* '; // i18n-ignore: PDF names / font names / producer, not UI
    return '';
  }
  /** A TJ operator from parts (strings and numbers), numbers next to each other added up. */
  function tj(parts) {
    var els = [];
    parts.forEach(function (p) {
      if (typeof p === 'number') { if (typeof els[els.length - 1] === 'number') els[els.length - 1] += p; else els.push(p); }
      else els.push(p);
    });
    return '[' + els.map(function (p) { return typeof p === 'number' ? Lx.num(p) : Lx.hexOf(p.str); }).join(' ') + '] TJ';
  }

  return { glyphs: glyphs, strip: strip, mul: mul, walk: walk, inTarget: inTarget };
});
