/* Slop PDF — the asset check, before the first text edit of a document. The fonts the document embeds are listed. A subset
   font that is neither installed nor bundled is asked about (SlopFontCheck: download it from the library, drop a file you own,
   or use the closest bundled font). A font embedded in full is not asked about. New text takes the installed family when there
   is one, else the answer for it, else the closest bundled family. Standard families (Arial is Helvetica) need no check.
   Asked once per document; cancelling the prompt cancels that edit. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, S = SP.editor._;
  var STD = [['Helvetica', /arial|helvetica/i], ['Times', /times/i], ['Courier', /courier/i]];

  /** The standard family a document font stands for (Arial is Helvetica, Times New Roman is Times), or null. */
  S.stdFamilyOf = function (family) { var hit = STD.find(function (s) { return s[1].test(family); }); return hit ? hit[0] : null; };
  /** The facts of a PostScript font name from the catalogue: { family, weight, italic, subset, name, std }. */
  S.fontFacts = function (ps) {
    var d = window.SlopFontCatalog.parseName(ps);
    // A subset is marked by its ABCDEF+ prefix. The catalogue also takes a -NNN suffix as a subset mark, but pdf-lib adds
    // that suffix to fonts embedded in full too (Barlow-Regular-9742), so only the prefix counts here.
    d.subset = /^[A-Z]{6}\+/.test(String(ps || ''));
    d.std = S.stdFamilyOf(d.family);
    return d;
  };
  /** The PostScript name of a page's font when the file embeds it (pdf.js has loaded it), else null. */
  S.embeddedName = function (pg, fontName) {
    var fo = pg.commonObjs.has(fontName) ? pg.commonObjs.get(fontName) : null;
    return fo && !fo.missingFile && fo.name ? fo.name : null;
  };
  /** The name of a standard font the file does not embed (Helvetica, Times, Courier: pdf.js marks it missingFile), or null.
   * jsPDF and most writers use these: they are text fonts too, listed as built in. */
  S.standardName = function (pg, fontName) {
    var fo = pg.commonObjs.has(fontName) ? pg.commonObjs.get(fontName) : null;
    return fo && fo.missingFile && fo.name && S.stdFamilyOf(fo.name) ? fo.name : null;
  };
  /** The embedded fonts a file's text uses: a Map of PostScript name to facts. */
  async function scan(f) {
    var seen = new Map();
    for (var i = 1; i <= f.doc.numPages; i++) {
      var pg = await f.doc.getPage(i), tc = await pg.getTextContent();
      // pdf.js loads a page's fonts into commonObjs only while it parses the page's operators: without this the
      // fonts are not there yet on a first look, and a document would be taken for one that embeds no fonts
      await pg.getOperatorList();
      tc.items.forEach(function (it) {
        if (typeof it.str !== 'string' || !it.str.trim()) return;
        var ps = S.embeddedName(pg, it.fontName) || S.standardName(pg, it.fontName);
        if (ps && !seen.has(ps)) seen.set(ps, S.fontFacts(ps));
      });
    }
    return seen;
  }
  /** Lists the fonts, asks about the missing subset ones, and records the answers on the file. False when cancelled.
   * Families already answered (here or in File ▸ Fonts, ui/fonts.js) are not asked again. */
  async function check(f) {
    var C = window.SlopFontCatalog, ask = window.SlopFontCheck;
    f.fontMap = f.fontMap || new Map();
    if (!C || !ask) return true;
    var needs = [], uses = [], listed = new Set();
    for (var facts of (await scan(f)).values()) {
      if (facts.std || listed.has(facts.family)) continue;
      listed.add(facts.family);
      var installed = await C.hasFamily(facts.family);
      var use = U.t(facts.subset ? 'pdf.ed.font_use_subset' : 'pdf.ed.font_use_full', { family: facts.family });
      uses.push(installed ? use : U.t('pdf.ed.font_use_missing', { use: use }));
      if (facts.subset && !installed && !f.fontMap.has(facts.family)) needs.push({ family: facts.family, closest: C.closestFamily(facts.family), pack: await C.packFor(facts.family) });
    }
    if (!needs.length) return true;
    var answers = await ask.ask(needs, uses);
    if (!answers) return false;
    answers.forEach(function (v, fam) { f.fontMap.set(fam, v.family); });
    return true;
  }
  S.scanFonts = scan;
  /** Resolves true when the file's text may be edited: the check has run (once) and the person did not cancel it. */
  S.fontsReady = function (f) {
    if (!f.fontCheck) {
      f.fontCheck = check(f).then(function (ok) { if (!ok) f.fontCheck = null; return ok; },
        function () { return true; }); // a file that cannot be scanned keeps the standard fonts
    }
    return f.fontCheck;
  };
  /** The font new text is set in for a run: { font, bold, italic, weight, std } where font is a standard family or the
   * installed family (or the closest one) that is now ready for measuring and saving. */
  S.runFont = async function (f, run) {
    var C = window.SlopFontCatalog, fx = run.facts;
    if (!fx || fx.std || !C) return { font: run.fam, bold: run.bold, italic: run.italic, std: true };
    var fam = fx.family, use = (await C.hasFamily(fam)) ? fam : (f.fontMap.get(fam) || C.closestFamily(fam));
    try { await E.prepareFont(use, fx.weight, fx.italic); }
    catch (e) { use = C.closestFamily(fam); await E.prepareFont(use, fx.weight, fx.italic); }
    if (window.SlopFonts) await window.SlopFonts.load(use); // the on-screen text draws the same face
    return { font: use, weight: fx.weight, italic: fx.italic, bold: fx.weight >= 600, std: false, family: fam };
  };
})();
