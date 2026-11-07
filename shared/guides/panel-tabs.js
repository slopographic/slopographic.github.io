/* SlopGuides panel: the Form / Notation / Intervals tabs and the preset actions menu. Words: shared/i18n/ui/<code>/guides.js
 * (keys ui.guides.*), read as a tab is built (the panel builds it again after a language switch). */
(function (root) {
  'use strict';
  const SG = root.SlopGuides = root.SlopGuides || {};
  const tr = (k, v) => (root.SlopI18n ? root.SlopI18n.t(k, v) : k);

  /** A text input bound to obj[key]; accepts numbers with units ('10px', '5%'). */
  function lenInput(el, obj, key, label, placeholder, onInput) {
    const i = el('input', { type: 'text', class: 'sgd-in sgd-num', 'aria-label': label, title: label, placeholder: placeholder || '', spellcheck: 'false', autocomplete: 'off' });
    i.value = obj[key] == null ? '' : obj[key];
    i.addEventListener('input', () => { obj[key] = i.value.trim(); i.classList.toggle('sgd-bad', !!i.value.trim() && !SG.parseLen(i.value)); onInput(i); });
    i.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const l = SG.parseLen(i.value || '0'); if (!l) return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1), v = Math.round((l.v + step) * 1000) / 1000;
      i.value = /[a-z%]$/i.test(i.value.trim()) ? v + l.u : String(v);
      i.dispatchEvent(new Event('input'));
    });
    return i;
  }
  function check(el, obj, key, label, onChange) {
    const c = el('input', { type: 'checkbox' }); c.checked = !!obj[key];
    c.addEventListener('change', () => { obj[key] = c.checked; onChange(); });
    return el('label', { class: 'sgd-chk' }, c, el('span', null, label));
  }
  const group = (el, title, ...kids) => el('fieldset', { class: 'sgd-group' }, el('legend', null, title), ...kids);
  const cells = (el, ...kids) => el('div', { class: 'sgd-cells' }, ...kids);
  const cell = (el, label, input) => el('label', { class: 'sgd-cell' }, input, el('span', null, label));

  function formTab(st, update, el) {
    const f = st.form, m = f.margins;
    const sides = ['top', 'right', 'bottom', 'left'], ins = {};
    const onMargin = (src) => { if (f.link) for (const s of sides) if (ins[s] !== src) { ins[s].value = src.value; m[s] = src.value.trim(); } update(); };
    for (const s of sides) ins[s] = lenInput(el, m, s, tr('ui.guides.margin_' + s), '0', onMargin);
    const link = el('button', { type: 'button', class: 'sgd-btn sgd-icon sgd-link' + (f.link ? ' sgd-on' : ''), 'aria-pressed': String(!!f.link), title: tr('ui.guides.link_tip'), 'aria-label': tr('ui.guides.link') }, '⛓');
    link.addEventListener('click', () => {
      f.link = !f.link; link.classList.toggle('sgd-on', f.link); link.setAttribute('aria-pressed', String(f.link));
      if (f.link) { const v = sides.map((s) => m[s]).find((x) => x) || ''; for (const s of sides) { m[s] = v; ins[s].value = v; } update(); }
    });
    const c = f.cols, r = f.rows, u = () => update();
    const bl = f.baseline || (f.baseline = { on: false, step: '', offset: '' });
    return el('div', { class: 'sgd-form' },
      group(el, tr('ui.guides.margins'), el('div', { class: 'sgd-cells sgd-cells5' }, ...sides.map((x) => cell(el, tr('ui.guides.side_' + x), ins[x])), link)),
      group(el, tr('ui.guides.columns'), cells(el, cell(el, tr('ui.guides.count_label'), lenInput(el, c, 'count', tr('ui.guides.cols_count'), '–', u)), cell(el, tr('ui.guides.width'), lenInput(el, c, 'width', tr('ui.guides.col_width'), 'auto', u)), cell(el, tr('ui.guides.gutter'), lenInput(el, c, 'gutter', tr('ui.guides.col_gutter'), '0', u)))),
      group(el, tr('ui.guides.rows'), cells(el, cell(el, tr('ui.guides.count_label'), lenInput(el, r, 'count', tr('ui.guides.rows_count'), '–', u)), cell(el, tr('ui.guides.height'), lenInput(el, r, 'height', tr('ui.guides.row_height'), 'auto', u)), cell(el, tr('ui.guides.gutter'), lenInput(el, r, 'gutter', tr('ui.guides.row_gutter'), '0', u)))),
      group(el, tr('ui.guides.also_add'),
        el('div', { class: 'sgd-checks' }, ...[[f, 'colMid'], [f, 'rowMid'], [f, 'midV'], [f, 'midH'], [f, 'edges'], [bl, 'on']].map(([o, k]) => check(el, o, k, tr('ui.guides.add_' + (o === bl ? 'baseline' : k.toLowerCase())), u))),
        cells(el, cell(el, tr('ui.guides.baseline_every'), lenInput(el, bl, 'step', tr('ui.guides.baseline_step'), '24', u)), cell(el, tr('ui.guides.offset'), lenInput(el, bl, 'offset', tr('ui.guides.baseline_offset'), '0', u)))));
  }

  function notationTab(st, update, el) {
    const ta = el('textarea', { class: 'sgd-in sgd-code', rows: 5, spellcheck: 'false', autocomplete: 'off', 'aria-label': tr('ui.guides.notation_aria') });
    ta.value = st.notation || '';
    ta.addEventListener('input', () => { st.notation = ta.value; update(); });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); const b = ta.closest('.sgd-panel').querySelector('.sgd-primary'); if (b && !b.disabled) b.click(); } });
    const help = el('dl', { class: 'sgd-help' }, SG.NOTATION_HELP.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, tr(v))]));
    const ex = el('div', { class: 'sgd-examples' }, el('span', null, tr('ui.guides.try')), ...['| ~ | ~ | ~ |', '|10px|~|10px|', '(|~|20px|)*4 ~|', '| ~ | ~ | ( h )'].map((s) => {
      const b = el('button', { type: 'button', class: 'sgd-chip', title: tr('ui.guides.use_example') }, s);
      b.addEventListener('click', () => { ta.value = s; st.notation = s; update(); });
      return b;
    }));
    return el('div', { class: 'sgd-notation' }, ta, ex, el('details', { class: 'sgd-syntax', open: true }, el('summary', null, tr('ui.guides.syntax')), help));
  }

  function intervalsTab(st, update, el) {
    const iv = st.intervals, u = () => update();
    const row = (spec, axis) => group(el, tr('ui.guides.iv_' + axis),
      check(el, spec, 'on', tr('ui.guides.iv_' + axis + '_on'), u),
      cells(el, cell(el, tr('ui.guides.every'), lenInput(el, spec, 'step', tr('ui.guides.iv_' + axis + '_step'), '100', u)), cell(el, tr('ui.guides.from'), lenInput(el, spec, 'origin', tr('ui.guides.iv_' + axis + '_origin'), '0', u))));
    return el('div', { class: 'sgd-intervals' },
      row(iv.x, 'x'),
      row(iv.y, 'y'),
      el('p', { class: 'sgd-hint' }, tr('ui.guides.iv_hint')));
  }

  SG.buildTab = function (tab, st, update, el) {
    return tab === 'notation' ? notationTab(st, update, el) : tab === 'intervals' ? intervalsTab(st, update, el) : formTab(st, update, el);
  };

  /** The ⋯ preset menu: save / delete / export / import. */
  SG.presetActions = function (anchor, st, ctx) {
    const UI = root.SlopUI, say = (m) => (ctx.toast ? ctx.toast(m) : UI ? UI.toast(m) : null);
    const ask = (head, l, v) => (UI ? UI.prompt(head, l, v, { ok: tr('ui.guides.save') }) : Promise.resolve(root.prompt(l, v)));
    const custom = SG.loadCustom();
    const items = [
      { label: tr('ui.guides.save_preset_dots'), act: async () => {
        const name = await ask(tr('ui.guides.save_preset_title'), tr('ui.guides.name'), tr('ui.guides.my_' + st.tab));
        if (!name || !name.trim()) return;
        const p = { name: name.trim(), tab: st.tab, unit: st.unit, snap: st.snap };
        if (st.tab === 'form') p.form = st.form; else if (st.tab === 'notation') p.notation = st.notation; else p.intervals = st.intervals;
        SG.addPreset(p); ctx.fillPresets(); say(tr('ui.guides.saved_preset', { name: p.name }));
      } },
      { label: tr('ui.guides.delete_preset'), disabled: !custom.length, sub: custom.length ? custom.map((p) => ({ label: p.name, act: () => { SG.removePreset(p.name); ctx.fillPresets(); say(tr('ui.guides.deleted_preset', { name: p.name })); } })) : undefined },
      '-',
      { label: tr('ui.guides.export_presets'), disabled: !custom.length, act: () => {
        const blob = new Blob([SG.exportJSON()], { type: 'application/json' });
        if (UI) UI.download(blob, 'guide-presets.json');
      } },
      { label: tr('ui.guides.import_presets'), act: async () => {
        const read = async (f) => { try { const n = SG.importJSON(await f.text()); ctx.fillPresets(); say(tr('ui.guides.imported', { n })); } catch (e) { say(e.message); } return f.name; };
        const SI = root.SlopIntake; // a part of the one intake ('guides.presets') where the page has it
        if (SI && SI.part) { await SI.pick({ to: SI.part({ id: 'guides.presets', accept: { types: ['application/json'], exts: ['.json'], get noun() { return tr('ui.guides.presets_noun'); } }, process: read }), accept: '.json,application/json' }); return; }
        const files = UI ? await UI.pickFiles({ accept: '.json,application/json' }) : []; // intake-ok: a page without shared/intake
        for (const f of files) await read(f);
      } },
    ];
    const r = anchor.getBoundingClientRect();
    if (UI) UI.menu(items, r.left, r.bottom + 2);
  };
})(window);
