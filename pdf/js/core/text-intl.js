/* Slop PDF — text in any writing system. A text's own font (a standard font or an installed family) sets what it can;
   characters it cannot set (Arabic, Chinese, Devanagari, Cyrillic in Helvetica…) are set in the Noto language font for
   their script, downloaded just in time by SlopFontJIT and prepared as a face under the key
   "lang:<pack>|<weight>" (fonts-custom.js), so measuring and saving work as for any installed family. A line is cut into
   runs by SlopBidi: right-to-left text reads right to left, numbers keep their order, and each run
   carries the font that sets it. fontkit shapes the runs (Arabic joining, Indic syllables) when pdf-lib embeds them.
     E.langKey(pack, bold)                      the face key of a language font
     E.charsetOf(key)                           the code points a font key can set (text.js)
     E.langFaceFor(cp, bold, text)              the prepared language face key that sets cp, or null
     E.runsOf(line, key, bold) -> [{ text, font, rtl }]   the line in visual order, left to right, one font per run
     E.needsScripts(text, key)                  true when the text has characters the font cannot set and no face is ready
     E.ensureScripts(text, key, bold, { ask })  downloads (after asking, unless automatic) and prepares the faces needed
     E.langFamilies()                           the CSS families of the prepared language fonts, for screen text */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine;
  var families = [];

  E.langKey = function (pack, bold) { return 'lang:' + pack + '|' + (bold ? '700' : '400'); };
  /** The language face that sets a code point: the bold one when asked and ready, else the regular one. */
  E.langFaceFor = function (cp, bold, text) {
    var J = window.SlopFontJIT, pack = J && J.packFor(cp, text);
    if (!pack) return null;
    var keys = bold ? [E.langKey(pack, true), E.langKey(pack, false)] : [E.langKey(pack, false)];
    for (var i = 0; i < keys.length; i++) { var f = E.face(keys[i]); if (f && f.cs.has(cp)) return keys[i]; }
    return null;
  };
  function scriptOf(cp) { return window.SlopScripts ? window.SlopScripts.scriptOf(cp) : 'latin'; }

  E.runsOf = function (line, key, bold) {
    var cs = E.charsetOf(key), B = window.SlopBidi;
    if (bold == null) bold = /Bold|\|[6-9]00\|/.test(key);   // a key says its weight: Helvetica-Bold, Inter|700|n
    if (!B || !line) return [{ text: line || '', font: key }];
    var fontOf = function (cp) {
      if (scriptOf(cp) === 'common' && cs.has(cp)) return null;   // spaces, digits, punctuation: the font around them
      if (cs.has(cp)) return key;
      return E.langFaceFor(cp, bold, line) || key;
    };
    var out = [];
    B.segments(line, { fontOf: fontOf }).forEach(function (seg) {
      // a character the run's font lacks (a symbol beside Arabic, say) goes back to the text's own font
      var fcs = seg.font === key ? cs : E.charsetOf(seg.font), cur = null, parts = [];
      for (var ch of seg.text) {
        var f = fcs.has(ch.codePointAt(0)) ? seg.font : key;
        if (cur && cur.font === f) cur.text += ch; else { cur = { text: ch, font: f, rtl: seg.rtl }; parts.push(cur); }
      }
      // inside a right-to-left segment the runs go right to left too (each run's text stays in logical order)
      if (seg.rtl) parts.reverse();
      out.push.apply(out, parts);
    });
    return out;
  };

  /** True when some character of the text is beyond its font and no language face is ready for it. */
  E.needsScripts = function (text, key) {
    var cs = E.charsetOf(key);
    for (var ch of String(text || '')) {
      var cp = ch.codePointAt(0);
      if (ch !== '\n' && !cs.has(cp) && scriptOf(cp) !== 'common' && !E.langFaceFor(cp, false, text)) return true;
    }
    return false;
  };

  /** Readies the language fonts a text needs. Resolves true when the text can be set (or nothing was needed). */
  E.ensureScripts = async function (text, key, bold, opts) {
    var J = window.SlopFontJIT, S = window.SlopScripts;
    if (!J || !S || !E.needsScripts(text, key)) return true;
    await J.deps();
    var cs = E.charsetOf(key);
    var ok = await J.ready(text, function (cp) { return cs.has(cp); }, { ask: !(opts && opts.ask === false) });
    if (!ok) return false;
    var packs = S.packsFor(text, function (cp) { return cs.has(cp); }, { han: S.hanFor(text, navigator.language) });
    for (var i = 0; i < packs.length; i++) {
      var weights = bold ? [false, true] : [false];
      for (var w = 0; w < weights.length; w++) {
        var k = E.langKey(packs[i], weights[w]);
        if (E.face(k)) continue;
        var bytes = await J.bytes(packs[i], { bold: weights[w] });
        if (bytes) await E.prepareFace(k, new Uint8Array(bytes));
      }
      var fam = await J.family(packs[i]);
      if (fam && families.indexOf(fam) < 0) { families.push(fam); J.face(packs[i]).catch(function () { /* the screen falls back to system fonts */ }); }
    }
    return true;
  };
  E.langFamilies = function () { return families.slice(); };
})();
