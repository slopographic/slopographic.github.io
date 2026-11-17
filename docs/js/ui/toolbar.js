/* Slop Docs — ui/toolbar: the formatting toolbar and the status bar. Controls call SlopDocs.A and never change the
 * document themselves; after every change the controls are read back from A.state() ('view' event). Classic script. */
(function () {
  'use strict';
  const S = window.SlopDocs, $ = (id) => document.getElementById(id);
  const E = () => window.SlopDocEngine;

  /** Fill the font list from the engine's families (names a Word user knows, plus the built-in ones). */
  function fillFonts() {
    const sel = $('selFont');
    const names = (E().FAMILIES || []).map((f) => f.name); // built-in families, then the document's own fonts
    sel.replaceChildren(...names.map((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; return o; }));
    refresh();
  }
  /** Fonts…: the shared Fonts panel for the fonts this document uses. Slop Docs embeds only the TrueType families it ships,
   * so the panel has no library download here; it offers the closest shipped family (and a font file the person owns). */
  async function openFonts() {
    const S_ = window.SlopDocs, M = E().M, S2 = E().S;
    if (!window.SlopFonts || !S_.doc) return;
    await SlopFonts.ready();
    const used = new Set();
    for (const b of M.docBlocks(S_.doc)) if (b.type === 'p') for (const r of b.runs || []) if (!r.obj) used.add(S2.runMarks(S_.doc, b, r).font);
    // a name the engine ships (a family name or a Word alias such as Calibri, in any case) is built in, not missing
    const shipped = new Set(E().FAMILIES.filter((f) => !f.user).flatMap((f) => [f.name, ...f.aliases]).map((s) => s.toLowerCase()));
    const standard = [...used].filter((n) => shipped.has(String(n).trim().toLowerCase()));
    SlopFonts.openPanel({
      fonts: [...used], standard, title: S.t('docs.tb.fonts'), library: false, download: false,
      note: S.t('docs.fonts.note'),
      closest: { sans: 'Carlito', serif: 'Tinos', mono: 'Cousine' },
      addFile: (file, forName) => S.addOwnFont(file, forName),
      onUse: ({ use }) => { S_.A.setFont(use); S_.focusIme(); },
    });
  }
  /** Keep focus in the hidden input when a toolbar button is pressed. */
  function keepFocus(root) {
    root.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // touch-ok: only keeps the focus (browsers send it after a tap too)
  }
  function wire() {
    const A = () => S.A;
    const go = (fn) => () => { fn(); S.focusIme(); };
    $('tbUndo').addEventListener('click', go(() => A().undo()));
    $('tbRedo').addEventListener('click', go(() => A().redo()));
    $('tbBold').addEventListener('click', go(() => A().toggle('b')));
    $('tbItalic').addEventListener('click', go(() => A().toggle('i')));
    $('tbUnderline').addEventListener('click', go(() => A().toggle('u')));
    $('tbClear').addEventListener('click', go(() => A().clearFormat()));
    $('tbBigger').addEventListener('click', go(() => A().stepSize(1)));
    $('tbSmaller').addEventListener('click', go(() => A().stepSize(-1)));
    $('tbBullets').addEventListener('click', go(() => A().toggleList('bul')));
    $('tbNumbers').addEventListener('click', go(() => A().toggleList('num')));
    for (const b of document.querySelectorAll('[data-align]')) b.addEventListener('click', go(() => A().setAlign(b.dataset.align)));
    $('selStyle').addEventListener('change', (e) => { A().setStyle(e.target.value); S.focusIme(); });
    $('selFont').addEventListener('change', (e) => { A().setFont(e.target.value); S.focusIme(); });
    $('tbFonts').addEventListener('click', () => openFonts());
    $('selSize').addEventListener('change', (e) => { A().setSize(e.target.value); S.focusIme(); });
    $('selSize').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); A().setSize(e.target.value); S.focusIme(); } });
    $('zoomSel').addEventListener('change', (e) => { S.zoom = Number(e.target.value) || 1; S.R.render(); S.R.reveal(); S.focusIme(); });
    $('tbRandom').addEventListener('click', () => S.random.open());
    keepFocus($('toolbar'));
    fillFonts();
    S.on('doc', fillFonts);
  }
  /** Reflect the caret's formatting in the toolbar and status bar. */
  function refresh() {
    if (!S.doc || !S.A) return;
    const st = S.A.state(), pressed = (id, on) => $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
    pressed('tbBold', st.b); pressed('tbItalic', st.i); pressed('tbUnderline', st.u);
    for (const b of document.querySelectorAll('[data-align]')) pressed(b.id, b.dataset.align === st.align);
    pressed('tbBullets', st.list === 'bul'); pressed('tbNumbers', st.list === 'num');
    $('tbUndo').disabled = !st.canUndo; $('tbRedo').disabled = !st.canRedo;
    const styleSel = $('selStyle'), want = st.style;
    if ([...styleSel.options].some((o) => o.value === want)) styleSel.value = want;
    else if (document.activeElement !== styleSel) styleSel.value = 'Normal'; // i18n-ignore: style id
    const fam = [...$('selFont').options].find((o) => o.value === st.font) || [...$('selFont').options].find((o) => E().familyOf(st.font).name === o.value);
    if (fam) $('selFont').value = fam.value;
    if (document.activeElement !== $('selSize')) $('selSize').value = String(st.size);
    const pi = S.R.pageInfo(), wc = E().M.wordCount(S.doc);
    $('pageInfo').textContent = S.t('docs.status.page_of', { page: pi.page, pages: pi.of });
    $('wordInfo').textContent = S.t('docs.status.words', { n: wc.words });
    if (S.saveLabel) $('saveState').textContent = S.saveLabel();
    if (document.activeElement !== $('docName')) $('docName').value = S.displayName();
  }
  S.on('view', refresh);
  S.on('change', () => refresh());
  S.on('doc', () => refresh());
  S.toolbarRefresh = refresh;
  S.onLang(() => refresh());   // the status bar's words (the rest of the bar: data-i18n)
  wire();
})();
