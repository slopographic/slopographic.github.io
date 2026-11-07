/* Slop Docs — ui/random: Random template. A seed (typed, or drawn at random) gives a business document design from
 * shared/templates. The dialog shows the first page with the same renderer as the page view; a click opens it full
 * size. Reshuffle picks a new seed, Enter regenerates from the typed seed, Use this template opens the design as a
 * new document, and Save as template keeps it in My templates (templates.js). Classic script; window.SlopDocs.random. */
(function () {
  'use strict';
  const S = window.SlopDocs;
  const E = () => window.SlopDocEngine;
  const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };
  const t = S.t;
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    n.append(...kids);
    return n;
  };
  let cur = null;   // { seed, vars, doc } for the open dialog
  const PREVIEW_W = 300, PREVIEW_H = 400;  // the preview box in px: pages of any shape fit inside it
  let view = null;  // { seedIn, thumb, info, pg } while the dialog is open
  let run = 0;      // a late preview never overwrites a newer one

  S.random = {};
  const schemeName = (id) => (E().TPL.SCHEMES.find((s) => s.id === id) || { name: id }).name;
  /** One line that says what the design is, for the dialog. */
  const describe = (d) => {
    const v = d.vars;
    return t('docs.tpl.describe', { title: v.title, font1: v.fonts[0], font2: v.fonts[1], scheme: schemeName(v.scheme), table: v.table, layout: v.layout, margins: v.margins });
  };

  /** Draw the first page of the current design into the preview. */
  async function paint() {
    const mine = ++run, doc = cur.doc;
    await E().ensureDocFonts(doc).catch(() => {});
    if (!view || mine !== run) return;
    const pg = E().layoutDoc(doc).pages[0];
    view.pg = pg;
    // Fit the page into a fixed box, so the dialog keeps its size for every paper size and orientation.
    const scale = Math.min(PREVIEW_W / pg.w, PREVIEW_H / pg.h);
    view.thumb.replaceChildren(S.R.pageEl(pg, 0, scale));
  }
  function regenerate(seed) {
    cur = E().TPL.generateTemplate(seed);
    if (!view) return;
    view.seedIn.value = cur.seed;
    view.info.textContent = describe(cur);
    paint();
  }
  function openFull() {
    if (!view || !view.pg) return;
    const box = el('div', { class: 'tpl-full' }, [S.R.pageEl(view.pg, 0, 4 / 3)]);
    SlopUI.dialog({ title: t('docs.tpl.preview_title', { name: cur.doc.meta.title }), body: box, cls: 'tpl-full-dlg', buttons: [{ label: t('menu.close'), primary: true }] });
  }

  /** Open a new document from a design (a template record's doc, or the current preview), in a new tab. */
  S.random.useDoc = async function (doc) {
    const d = E().M.normalizeDoc(JSON.parse(JSON.stringify(doc)));
    d.meta = Object.assign({}, d.meta, { created: Date.now(), modified: Date.now() });
    S.openNew(d, { id: null, name: (d.meta.title || S.untitled()) + '.sdoc', dirty: false });
    toast(t('docs.tpl.new_from'));
    return true;
  };
  async function saveAsTemplate() {
    if (!cur) return false;
    const name = await SlopUI.prompt(t('docs.tpl.save_as'), t('docs.tpl.name'), cur.doc.meta.title, { ok: t('menu.save') });
    if (!name || !name.trim()) return false;
    const rec = await S.tplSave(name.trim(), cur.seed, cur.doc);
    toast(t('docs.tpl.saved', { name: rec.name }));
    return false;
  }

  /** Open the dialog. seed is optional: a new random seed is drawn when it is missing. */
  S.random.open = function (seed) {
    if (!window.SlopUI || !E() || view) return;
    const seedIn = el('input', { type: 'text', class: 'sui-input tpl-seed', id: 'tplSeed', 'aria-label': t('docs.tpl.seed'), spellcheck: 'false', autocomplete: 'off' });
    const thumb = el('div', { class: 'tpl-thumb', id: 'tplPreview', role: 'button', tabindex: '0', 'aria-label': t('docs.tpl.preview_aria'), title: t('docs.tpl.preview_tip') });
    const info = el('p', { class: 'tpl-info', id: 'tplInfo' });
    // Enter regenerates; stopPropagation keeps SlopUI from pressing the primary button (Use this template) for it
    seedIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); regenerate(seedIn.value.trim() || E().TPL.newSeed()); } });
    thumb.addEventListener('click', openFull);
    thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFull(); } });
    const body = el('div', { class: 'tpl-body' }, [SlopUI.field(t('docs.tpl.seed'), seedIn, t('docs.tpl.seed_hint')), thumb, info]);
    view = { seedIn, thumb, info, pg: null };
    SlopUI.dialog({
      title: t('docs.tpl.title'), body, cls: 'tpl-dlg',
      buttons: [
        { label: t('docs.tpl.reshuffle'), act: () => { regenerate(E().TPL.newSeed()); return false; } },
        { label: t('docs.tpl.save_as'), act: saveAsTemplate },
        { label: t('menu.close') },
        { label: t('docs.tpl.use'), primary: true, act: async () => (await S.random.useDoc(cur.doc)) ? undefined : false },
      ],
      onClose: () => { view = null; cur = null; run++; },
    });
    regenerate(seed || E().TPL.newSeed());
    setTimeout(() => seedIn.focus({ preventScroll: true }), 30);
  };
  window.addEventListener('slopdocs:fonts', () => { if (view && cur) paint(); });
})();
