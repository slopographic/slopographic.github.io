/* Slop PDF — Fonts (File ▸ Fonts…, the top-bar button). Opens the shared Fonts panel (shared/fonts/panel.js,
   SlopFonts.openPanel) with the fonts of the open document: the families it embeds as a subset, and the standard ones.
   The panel offers Download (the library), Drop your own font and Use the closest font for a missing family. A closest
   font chosen there is kept on each file that uses the family (f.fontMap), the same answer the first-edit prompt uses
   (SlopFontCheck is a shim over the same panel). A font embedded in full needs no answer and is not listed. Reopens any
   time. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, A = SP.app, S = SP.editor._, t = SP.util.t;

  /** The families of the open files: names (subset or standard), the standard ones, and the files that use each. */
  async function gather() {
    var names = [], standard = [], filesOf = new Map(), any = false;
    for (var f of E.files.values()) {
      if (!f.doc) continue;
      for (var facts of (await S.scanFonts(f)).values()) {
        any = true;
        if (facts.std) { if (standard.indexOf(facts.family) < 0) standard.push(facts.family); continue; }
        if (!facts.subset) continue;
        if (names.indexOf(facts.family) < 0) names.push(facts.family);
        if (!filesOf.has(facts.family)) filesOf.set(facts.family, []);
        if (filesOf.get(facts.family).indexOf(f) < 0) filesOf.get(facts.family).push(f);
      }
    }
    return { names: names, standard: standard, filesOf: filesOf, any: any };
  }

  /** File ▸ Fonts…: opens the shared panel for this document. */
  A.openFonts = async function () {
    if (SP.offline || !E.state.pages.length) return;
    var got = await gather();
    if (!got.names.length && !got.standard.length) {
      SlopUI.toast(t(got.any ? 'pdf.act.fonts_all_full' : 'pdf.act.fonts_no_text'));
      return;
    }
    await window.SlopFonts.ready();
    window.SlopFonts.openPanel({
      title: t('pdf.act.fonts_title'),
      note: t(got.names.length ? 'pdf.act.fonts_subset_note' : 'pdf.act.fonts_std_note'),
      fonts: got.names,
      standard: got.standard,
      onUse: function (ans) {
        (got.filesOf.get(ans.family) || []).forEach(function (f) { f.fontMap = f.fontMap || new Map(); f.fontMap.set(ans.family, ans.use); });
        SlopUI.toast(t('pdf.act.fonts_using', { use: ans.use, family: ans.family }));
      },
    });
  };
  var topBtn = document.getElementById('btnFonts');
  if (topBtn) topBtn.addEventListener('click', function () { A.openFonts(); });
})();
