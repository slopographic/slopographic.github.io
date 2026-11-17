/* SlopLabel — ui/props-reset: Reset for the Properties panel. The baseline is taken when the selection
 * changes (that is when the panel "opens" for those objects, or for the label itself when nothing is
 * selected). Reset puts those values back, after a SlopUI confirm when they were edited. */
'use strict';

let propBase = null; // { key, objs: [object copies], label: label settings copy }
const labelSettingsOf = (d) => deepClone({ name: d.name, unit: d.unit, dpi: d.dpi, label: d.label, stock: d.stock, printer: d.printer, grid: d.grid });

/** Takes the baseline the first time the panel shows this selection (rebuilds keep it). */
function markPropsOpen() {
  const key = App.sel.join(',') || '(label)';
  if (propBase && propBase.key === key) return;
  propBase = { key, objs: selObjs().map((o) => deepClone(o)), label: labelSettingsOf(App.doc) };
}
function propsDirty() {
  if (!propBase) return false;
  if (propBase.objs.length) return propBase.objs.some((b) => { const o = objById(b.id); return !o || JSON.stringify(o) !== JSON.stringify(b); });
  return JSON.stringify(labelSettingsOf(App.doc)) !== JSON.stringify(propBase.label);
}
/** Puts the baseline back. The panel's own Reset button calls this. */
async function resetProps() {
  if (!propBase) return;
  if (propsDirty() && !(await SlopUI.confirm(LT('label.reset.reset_these_properties'), LT('label.reset.your_changes_to_this_selection'), LT('label.props.reset'), { danger: true }))) return;
  const base = propBase;
  if (base.objs.length) {
    editDoc((d) => { for (const b of base.objs) { const i = d.objects.findIndex((o) => o.id === b.id); if (i >= 0) d.objects[i] = deepClone(b); } }, LT('label.reset.reset_properties'));
  } else {
    editDoc((d) => Object.assign(d, deepClone(base.label)), LT('label.reset.reset_label'));
  }
  refresh();
}
