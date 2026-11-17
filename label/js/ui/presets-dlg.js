/* SlopLabel — ui/presets-dlg: File ▸ Presets…, the gallery of built-in label presets (A4 sheets, rolls and single labels) and the
 * user's own presets (saved from a config). Each has a preview of its page. A preset opens in a new tab, or is applied to the
 * open label as one undo step. Classic script; uses core/presets.js, configs-dlg.js and the helpers of ui/dialogs.js. */
'use strict';

/** A preset opens in a new tab ('tab') or is applied to the open label ('apply'). */
function presetChoice(p, how) {
  if (how === 'apply') { applyConfigToLabel(p.name, p.body); return; }
  const T = openDocTab(docFromConfig(p.body, p.name), { label: LT('label.presets.new_from_preset'), dirty: true });
  SlopUI.toast(LT('label.presets.opened', { name: p.name }));
  return T;
}

/** File ▸ Presets…: the gallery. */
function presetsDialog() {
  let dlg;
  const tile = (p, mine) => {
    const b = p.body, slots = presetSlots(b);
    const preview = mk('span', { class: 'tp' });
    preview.innerHTML = presetPreviewSvg(b, p.name); // numbers and the escaped name only (core/presets.js)
    const round = b.label.radius >= Math.min(b.label.w, b.label.h) / 2 - 0.01; // a round label, not just rounded corners
    const meta = [b.stock.kind === 'sheet' ? LT('label.presets.per_sheet', { n: slots }) : null, round ? LT('label.presets.round') : null].filter(Boolean).join(' · ');
    const acts = mk('div', { class: 'cfg-acts' },
      fBtn(LT('label.cmd.new_tab'), () => { dlg.close(true); presetChoice(p, 'tab'); }, { cls: 'primary' }),
      fBtn(LT('label.presets.this_tab'), () => { dlg.close(true); presetChoice(p, 'apply'); }),
      mine ? fBtn(LT('label.panels.remove'), async () => { if (!(await SlopUI.confirm(LT('label.presets.remove_this_preset'), LT('label.presets.removed_body', { name: p.name }), LT('label.panels.remove'), { danger: true }))) return; LabelConfigs.removePreset(p.id); dlg.close(true); presetsDialog(); }) : null);
    return mk('div', { class: 'tpl pst' }, preview, mk('b', null, mine ? p.name : LW('preset', p.id, p.name)), mk('small', null, [mine ? p.desc : LW('preset_desc', p.id, p.desc), meta].filter(Boolean).join(' · ')), acts);
  };
  const groups = PRESET_GROUPS.map((g) => mk('div', { class: 'pst-group' }, mk('h4', { class: 'sec-h' }, LW('pgroup', g, g)),
    mk('div', { class: 'tpl-grid' }, ...PRESETS.filter((p) => p.group === g).map((p) => tile(p, false)))));
  const mine = LabelConfigs.presets;
  if (mine.length) groups.push(mk('div', { class: 'pst-group' }, mk('h4', { class: 'sec-h' }, LT('label.presets.your_presets')),
    mk('div', { class: 'tpl-grid' }, ...mine.map((r) => tile({ id: r.id, name: r.name, desc: LT('label.presets.saved_from_a_config'), group: 'mine', body: r.body }, true)))));
  dlg = SlopUI.dialog({ title: LT('label.presets.presets'), cls: 'sl-wide', body: mk('div', null,
    mk('p', { class: 'sui-p' }, LT('label.presets.pick_a_preset_to_start')),
    ...groups),
  buttons: [{ label: LT('label.print.close'), primary: true }] });
}
