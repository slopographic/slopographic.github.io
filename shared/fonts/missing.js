/* Slopographic missing-font check, the asset prompt of the PDF editor (window.SlopFontCheck.ask). A thin wrapper over the Fonts
 * panel (panel.js): ask(needs, uses) resolves a Map family -> { family, how } ('library', 'file' or 'closest') once every needed
 * family has an answer, or null when the person cancels. New code calls SlopFonts.openPanel and SlopFonts.askOnce.
 * Classic script; needs shared/fonts/picker.js (it loads the panel). */
(function (root) {
  'use strict';
  const tr = (k, v) => { const I = root.SlopI18n; return I ? I.t(k, v) : k; };
  /** Asks about the needed families (needs: [{ family, closest, pack }]); uses: the names listed in the prompt. */
  function ask(needs, uses) {
    if (!needs.length) return Promise.resolve(new Map());
    return root.SlopFonts.ready().then(() => new Promise((resolve) => {
      const answers = new Map();
      let done = false, handle = null;
      const finish = (r) => { if (!done) { done = true; resolve(r); } };
      const answer = (fam, how, family) => {
        if (done || answers.has(fam)) return;
        answers.set(fam, { family, how });
        if (answers.size === needs.length) { finish(answers); if (handle) handle.close(false); }
      };
      handle = root.SlopFonts.openPanel({
        title: 'ui.fonts.missing_title',
        closeLabel: 'ui.fonts.cancel_edit',
        // the panel reads its notes again on a language switch; the names stay as the document gives them
        note: [() => tr('ui.fonts.doc_uses', { names: (uses || needs.map((n) => n.family)).join(', ') }), 'ui.fonts.choose_how'],
        fonts: needs.map((n) => n.family),
        library: false,
        onUse: ({ family, use }) => answer(family, 'closest', use),
        onAdd: ({ family, how, row }) => { const key = row || family; if (needs.some((n) => n.family === key)) answer(key, how, family); },
        onClose: () => finish(null),
      });
    }));
  }
  root.SlopFontCheck = { ask };
})(typeof window !== 'undefined' ? window : globalThis);
