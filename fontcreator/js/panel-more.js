/* Slop Font: the rest of the right panel. Characters (add a whole set, keep only some: a subset), Handwriting (print a
 * sheet to fill in, read a photo of it), Export (the format) and the panel's foot, always in reach: Download font (the
 * main action), Save to Slop Drive…, Save project, Copy CSS and Open in…. Classic script, before js/panel.js mounts.
 *   FC.panelMore.sections() → the panel's sections   paint()   subset(text)   addSet(id) */
(function (g) {
  'use strict';
  const S = () => g.FC.state, F = () => g.SlopFont, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  const parts = {};
  const safe = (fn) => () => Promise.resolve().then(fn).catch((e) => g.SlopUI.toast(e.message));
  const button = (id, label, run) => { const b = el('button', { type: 'button', class: 'sui-btn', id }, t(label)); b.addEventListener('click', safe(run)); return b; };
  const field = (label, control, note) => { const l = el('label', { class: 'sf-field' }, el('span', { class: 'sf-lab' }, t(label)), control); if (note) l.append(el('span', { class: 'sf-note' }, t(note))); return l; };   // keys

  function addSet(id) {
    const cps = F().charset.codes(id), p = S().project(), missing = cps.filter((c) => !p.glyphs.some((x) => x.unicode === c));
    if (!missing.length) { g.SlopUI.toast(t('fontcreator.more.set_there')); return 0; }
    S().edit(t('fontcreator.grid.undo_add', { n: missing.length }), 'project', (pp) => { for (const c of missing) F().model.ensure(pp, c); });
    g.SlopUI.toast(t('fontcreator.more.set_added', { n: missing.length }));
    return missing.length;
  }
  function subset(textOrSet) {
    const CS = F().charset;
    const cps = CS.SETS.some((s) => s.id === textOrSet) || textOrSet === 'all' ? CS.codes(textOrSet) : CS.parseChars(textOrSet);
    if (!cps.length) throw new Error(t('fontcreator.more.keep_none'));
    const before = S().project().glyphs.length;
    S().edit(t('fontcreator.more.undo_keep'), 'project', (p) => { F().model.subset(p, cps.concat(0x20)); });
    const n = before - S().project().glyphs.length;
    g.SlopUI.toast(n ? t('fontcreator.more.removed', { n, left: S().project().glyphs.length }) : t('fontcreator.more.nothing_removed'));
    return n;
  }
  function sections() {
    const setSel = el('select', { id: 'fc-add-set' });
    for (const s of F().charset.SETS) setSel.append(el('option', { value: s.id }, g.FC.setName(s.id)));
    const keep = el('input', { type: 'text', id: 'fc-keep', placeholder: 'ABC abc 0123 .,!?', autocomplete: 'off', spellcheck: 'false' }); // i18n-ignore
    const format = el('select', { id: 'fc-format' });
    for (const f of g.FC.io.FORMATS) format.append(el('option', { value: f.id }, t(`fontcreator.format.${f.id}`)));
    format.addEventListener('change', () => S().set({ format: format.value }));
    Object.assign(parts, { setSel, keep, format });
    return [
      { title: t('fontcreator.more.chars'), key: 'chars', settings: [
        el('div', { class: 'fc-row' }, field('fontcreator.more.add_set', setSel), button('fc-add-set-go', 'fontcreator.more.add', () => addSet(setSel.value))),
        el('div', { class: 'fc-row' }, field('fontcreator.more.keep_label', keep, 'fontcreator.more.keep_note'),
          button('fc-keep-go', 'fontcreator.more.keep', async () => {
            if (!keep.value.trim()) throw new Error(t('fontcreator.more.keep_type'));
            if (await g.SlopUI.confirm(t('fontcreator.more.keep_title'), t('fontcreator.more.keep_msg', { chars: keep.value.trim().slice(0, 80) }), t('fontcreator.more.keep_ok'), { danger: true })) subset(keep.value);
          }))] },
      { title: t('fontcreator.more.hand'), key: 'hand', settings: [
        el('p', { class: 'sf-note' }, t('fontcreator.more.hand_note')),
        el('div', { class: 'fc-btns' }, button('fc-sheet-print', 'fontcreator.more.sheet_print', () => g.FC.sheetUi.template()), button('fc-sheet-read', 'fontcreator.more.sheet_read', () => g.FC.sheetUi.pick()))] },
      { title: t('menu.export'), key: 'export', settings: [field('fontcreator.more.format', format, 'fontcreator.more.format_note'),
        el('div', { class: 'fc-btns' }, button('fc-css', 'fontcreator.more.css', () => g.FC.io.copyCss()), button('fc-dl-project', 'fontcreator.app.download_project', () => g.FC.io.download('sfont')))] },
    ];
  }
  function paint() {
    if (!parts.format) return;
    const s = S().settings(), f = g.FC.io.FORMATS.find((x) => x.id === s.format) || g.FC.io.FORMATS[0], st = F().model.stats(S().project());
    parts.format.value = f.id;
    const side = g.FC.panel.side();
    if (!side) return;
    const none = !st.drawn, IO = g.FC.io, phone = g.matchMedia && g.matchMedia('(max-width: 860px)').matches;
    side.footer([
      { id: 'fc-download', label: t('fontcreator.more.download', { ext: f.ext }), primary: true, disabled: none && f.id !== 'sfont', run: () => IO.download().catch((e) => g.SlopUI.toast(e.message)) },
      { id: 'fc-drive', label: t('fontcreator.more.drive'), disabled: none && f.id !== 'sfont', run: () => IO.saveToDrive().catch((e) => g.SlopUI.toast(t('fontcreator.more.save_failed', { error: e.message }))) },
      phone ? null : { id: 'fc-save-project', label: t('fontcreator.more.save_project'), run: () => IO.saveToDrive('sfont').catch((e) => g.SlopUI.toast(t('fontcreator.more.save_failed', { error: e.message }))) },   // phones: in the ⋯ menu
      { id: 'fc-openin', label: t('fontcreator.more.open_in'), disabled: none, menu: () => IO.openInItems() },
    ], { stack: true, more: t('ui.settings'), note: none ? t('fontcreator.more.draw_first') : t('fontcreator.more.note', { drawn: st.drawn, glyphs: st.glyphs }) + ' · ' + t('fontcreator.more.pairs', { n: st.pairs }) + (S().dirty() ? ' · ' + t('fontcreator.more.changed') : '') });
  }
  g.FC.panelMore = { sections, paint, subset, addSet };
})(window);
