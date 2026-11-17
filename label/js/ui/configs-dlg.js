/* SlopLabel — ui/configs-dlg: File ▸ Save as config… and File ▸ Configs…: save the open label's setup by name, apply a config
 * to the open label (one undo step), rename, duplicate, save as a preset, delete, and export to or import from a JSON file.
 * A configs file dropped on the app is imported too (ui/export.js). Storage is io/configs-store.js. Classic script. */
'use strict';

const persistNote = (msg) => (LabelConfigs.persisted ? msg : msg + ' ' + LT('label.cfg.blocked_note'));
/** Applies a config to the open label as one undo step (undo takes it back). Returns the notes about data columns. */
function applyConfigToLabel(name, body) {
  let notes = [];
  editDoc((d) => { notes = applyConfigToDoc(d, body); }, LT('label.cfg.apply_undo', { name }));
  fitView();
  SlopUI.toast(notes.length ? notes.join('. ') + '.' : LT('label.cfg.applied', { name }), 4800);
}
/** File ▸ Save as config…: the open label's setup under a name. */
async function saveConfigDialog() {
  let body;
  try { body = configFromDoc(App.doc); } catch (e) { SlopUI.alert(LT('label.cfg.this_label_cannot_be_saved'), e.message || String(e)); return; }
  const name = await SlopUI.prompt(LT('label.cfg.save_as_config'), LT('label.cfg.config_name'), cleanConfigName(App.doc.name), { ok: LT('label.menu.save'), placeholder: 'e.g. 4 × 6 shipping' });
  if (name == null) return;
  const r = LabelConfigs.add(name, body);
  if (!r.ok) { SlopUI.toast(r.error); return; }
  SlopUI.toast(persistNote(LT('label.cfg.saved', { name: r.record.name })), 4200);
}
/** Imports a configs file (text). Reports what was added and what was refused. */
function importConfigsText(text) {
  const r = LabelConfigs.importText(text);
  if (!r.ok) { SlopUI.alert(LT('label.cfg.could_not_import_the_configs'), r.error); return r; }
  SlopUI.toast(LT('label.cfg.imported', { n: r.added }));
  if (r.rejected.length) SlopUI.alert(LT('label.cfg.rejected', { n: r.rejected.length }), r.rejected.map((x) => `${x.name}: ${x.error}`).join('; '));
  return r;
}
/** The one-line summary of a config, for the list. */
const configSummary = (b) => `${num(b.label.w, 2)} × ${num(b.label.h, 2)} mm · ${b.stock.kind === 'sheet' ? LT('label.cfg.per_sheet', { grid: b.stock.cols + ' × ' + b.stock.rows }) : LT('label.cfg.roll')} · ${b.dpi} dpi`
  + (b.data ? ' · ' + LT('label.cfg.data_cols', { n: b.data.columns.length }) : '');

/** File ▸ Configs…: the saved configs, with their actions. */
function configsDialog() {
  let dlg;
  const list = mk('div', { class: 'cfg-list' });
  const draw = () => {
    const rows = LabelConfigs.configs;
    list.replaceChildren(...(rows.length ? rows.map((r) => cfgRow(r)) : [mk('p', { class: 'hint' }, LT('label.cfg.no_saved_configs_yet_use'))]));
  };
  const cfgRow = (r) => {
    const acts = mk('div', { class: 'cfg-acts' },
      fBtn(LT('label.dlg.apply'), () => { dlg.close(true); applyConfigToLabel(r.name, r.body); }, { cls: 'primary' }),
      fBtn(LT('label.props.rename'), async () => {
        const n = await SlopUI.prompt(LT('label.cfg.rename_config'), LT('label.cfg.new_name'), r.name, { ok: LT('label.props.rename') });
        if (n == null) return;
        const res = LabelConfigs.rename(r.id, n);
        if (!res.ok) SlopUI.toast(res.error);
        draw();
      }),
      fBtn(LT('label.cmd.duplicate'), () => { const res = LabelConfigs.duplicate(r.id); if (!res.ok) SlopUI.toast(res.error); draw(); }),
      fBtn(LT('label.cfg.save_as_preset'), () => { const res = LabelConfigs.saveAsPreset(r.id); SlopUI.toast(res.ok ? persistNote(LT('label.cfg.saved_preset', { name: res.record.name })) : res.error); }),
      fBtn('Delete', async () => {
        if (!(await SlopUI.confirm(LT('label.cfg.delete_this_config'), LT('label.cfg.delete_body', { name: r.name }), LT('ui.delete'), { danger: true }))) return;
        LabelConfigs.remove(r.id); draw();
      }));
    return mk('div', { class: 'cfg-row' }, mk('div', { class: 'cfg-main' }, mk('b', null, r.name), mk('small', { class: 'mono' }, configSummary(r.body))), acts);
  };
  const notice = LabelConfigs.readOnly ? mk('div', { class: 'msg warn' }, LT('label.cfg.the_configs_saved_in_this'))
    : !LabelConfigs.persisted ? mk('div', { class: 'msg warn' }, LT('label.cfg.storage_is_blocked_here_so')) : null;
  draw();
  dlg = SlopUI.dialog({ title: LT('label.cfg.configs'), cls: 'sl-wide', body: mk('div', { class: 'dlg-form' },
    mk('p', { class: 'sui-p' }, LT('label.cfg.a_config_is_a_label')),
    notice, list),
  buttons: [
    { label: LT('label.cfg.import'), act: async () => { const r = await SlopIntake.pick({ to: 'label.configs', multiple: false, accept: '.json,application/json' }); if (r.added.length) draw(); return false; } },
    { label: LT('label.cfg.export_all'), act: () => { if (!LabelConfigs.configs.length) { SlopUI.toast(LT('label.cfg.no_configs_to_export_yet')); return false; } SlopUI.download(new Blob([LabelConfigs.exportText()], { type: 'application/json' }), 'sloplabel-configs.json'); return false; } },
    { label: LT('label.print.close'), primary: true },
  ] });
}
