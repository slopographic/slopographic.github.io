/* SlopNav modal: the navigation dialog. Presets (with a live description and clashes), a Customise
 * view with one row per binding (select, live text, "Reset to preset"), a try-it pad, and Apply.
 * Built on SlopUI.dialog. Classic script; sets window.SlopNav.modal. */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});

  /** Opens the dialog for one app. opts: { app, title?, shortcuts?: () => [{ combo, title, action }] } */
  function open(opts) {
    const UI = window.SlopUI;
    if (!UI || !opts || !opts.app) return null;
    const app = opts.app, el = UI.el, D = N.describe, L = N.logic;
    const say = (k, v) => { const I = window.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // the dialog is built on open, in the chosen language (shared/i18n/ui/<code>/print.js)
    const S = { tab: 'presets', selected: N.store.resolve(app).id, draft: null, draftFrom: null, pad: null, refs: {} };
    const shortcuts = () => { try { return typeof opts.shortcuts === 'function' ? opts.shortcuts() : []; } catch (e) { return []; } };
    const storedCustom = () => N.store.get(app).custom;
    const bindingsFor = (id) => (id === 'custom' ? (storedCustom() ? storedCustom().bindings : N.presets.get('slop').bindings) : N.presets.get(id).bindings);
    const clashLines = (b, name) => L.clashes(b, shortcuts()).filter((c) => !name || c.binding === name);

    /* ---- presets pane ---- */
    const cards = el('div', { class: 'nav-cards', role: 'radiogroup', 'aria-label': say('ui.nav.presets') });
    const whatBox = el('ul', { class: 'nav-what' });
    const clashBox = el('div', { class: 'nav-clash-box' });
    const presetsPane = el('div', { class: 'nav-pane' }, cards, whatBox, clashBox);
    for (const p of N.presets.list()) {
      const radio = el('input', { type: 'radio', name: 'nav-preset', value: p.id });
      radio.checked = p.id === S.selected;
      radio.addEventListener('change', () => { S.selected = p.id; renderWhat(); });
      cards.append(el('label', { class: 'nav-card' + (p.custom ? ' nav-card-custom' : '') }, radio, el('span', { class: 'nav-card-body' }, el('b', null, p.name), el('span', { class: 'nav-hint' }, p.blurb))));
    }
    function renderWhat() {
      const b = bindingsFor(S.selected);
      whatBox.replaceChildren(...D.describe(b).map((x) => el('li', null, el('b', null, x.title + ': '), x.text)));
      const cl = clashLines(b);
      clashBox.replaceChildren(...cl.map((c) => el('p', { class: 'nav-clash' }, say('ui.nav.clash', { what: D.title(c.binding), key: L.label(c.combo), cmd: c.title }))));
    }

    /* ---- customise pane ---- */
    const rowsBox = el('div', { class: 'nav-rows' });
    const customPane = el('div', { class: 'nav-pane', hidden: true }, rowsBox);
    const baseBindings = () => {
      const id = S.draftFrom === 'custom' ? (storedCustom() ? storedCustom().from : N.presets.DEFAULT) : S.draftFrom;
      return N.presets.get(id).bindings;
    };
    function ensureDraft() {
      if (S.draft && S.draftFrom === S.selected) return;
      S.draft = N.presets.clone(bindingsFor(S.selected));
      S.draftFrom = S.selected;
    }
    function refreshRow(name) {
      const r = S.refs[name];
      if (!r) return;
      r.sel.value = D.valueOf(name, S.draft[name]);
      r.hint.textContent = D.describe(S.draft).find((x) => x.name === name).text;
      const cl = clashLines(S.draft, name);
      r.clash.textContent = cl.length ? say('ui.nav.clash_row', { cmd: cl[0].title, key: L.label(cl[0].combo) }) : '';
    }
    function buildRows() {
      rowsBox.replaceChildren();
      S.refs = {};
      for (const name of N.validate.KEYS) {
        const sel = el('select', { class: 'sui-input', 'aria-label': D.title(name) });
        for (const [v, l] of D.optionsFor(name, S.draft[name])) sel.append(el('option', { value: v }, l));
        const hint = el('small', { class: 'nav-hint' });
        const clash = el('small', { class: 'nav-clash' });
        const reset = el('button', { class: 'sui-btn', type: 'button', onclick: () => {
          S.draft[name] = N.presets.clone(baseBindings())[name];
          refreshRow(name);
          if (S.pad) S.pad.refresh();
        } }, say('ui.nav.reset_row'));
        sel.addEventListener('change', () => { S.draft[name] = D.parseOption(name, sel.value); refreshRow(name); if (S.pad) S.pad.refresh(); });
        S.refs[name] = { sel, hint, clash };
        rowsBox.append(el('div', { class: 'nav-row' }, el('label', { class: 'nav-row-head' }, el('span', { class: 'sui-label' }, D.title(name)), sel), reset, hint, clash));
      }
      for (const name of N.validate.KEYS) refreshRow(name);
    }
    const customHead = el('p', { class: 'nav-hint' }, say('ui.nav.custom_note'));
    customPane.prepend(customHead);

    /* ---- try-it pad and messages ---- */
    const padBox = el('div', { class: 'nav-pad-wrap' });
    const padLine = el('p', { class: 'nav-hint nav-readout' });
    const errBox = el('p', { class: 'nav-err', role: 'alert' });
    const tabPresets = el('button', { class: 'sui-btn nav-tab', type: 'button', role: 'tab', 'aria-selected': 'true' }, say('ui.nav.presets'));
    const tabCustom = el('button', { class: 'sui-btn nav-tab', type: 'button', role: 'tab', 'aria-selected': 'false' }, say('ui.nav.customise'));
    function show(tab) {
      if (tab === 'custom') { ensureDraft(); buildRows(); }
      S.tab = tab;
      presetsPane.hidden = tab !== 'presets';
      customPane.hidden = tab !== 'custom';
      tabPresets.setAttribute('aria-selected', String(tab === 'presets'));
      tabCustom.setAttribute('aria-selected', String(tab === 'custom'));
      errBox.textContent = '';
      if (S.pad) S.pad.refresh();
    }
    tabPresets.addEventListener('click', () => show('presets'));
    tabCustom.addEventListener('click', () => show('custom'));
    const body = el('div', { class: 'nav-body' },
      el('div', { class: 'nav-tabs', role: 'tablist' }, tabPresets, tabCustom),
      presetsPane, customPane,
      el('div', { class: 'nav-try' }, el('b', { class: 'nav-try-title' }, say('ui.nav.try')),
        el('p', { class: 'nav-hint' }, say('ui.nav.try_note')),
        padBox, padLine, errBox));

    function apply() {
      if (S.tab === 'custom') {
        const from = S.draftFrom === 'custom' ? (storedCustom() ? storedCustom().from : N.presets.DEFAULT) : S.draftFrom;
        const r = N.store.setCustom(app, S.draft, from);
        if (!r.ok) { errBox.textContent = r.errors.join('. '); return false; }
        N.store.setPreset(app, 'custom');
        return true;
      }
      const r = N.store.setPreset(app, S.selected);
      if (!r.ok) { errBox.textContent = r.errors.join('. '); return false; }
      return true;
    }

    renderWhat();
    const dlg = UI.dialog({
      title: opts.title || say('ui.nav.dialog'),
      body,
      cls: 'nav-dlg',
      buttons: [{ label: say('menu.cancel') }, { label: say('ui.apply'), primary: true, act: apply }],
      onClose: () => { if (S.pad) { S.pad.destroy(); S.pad = null; } },
    });
    S.pad = N.pad.mount(padBox, { bindings: () => (S.tab === 'custom' && S.draft ? S.draft : bindingsFor(S.selected)), onChange: (t) => { padLine.textContent = t; } });
    return dlg;
  }

  N.modal = { open };
})();
