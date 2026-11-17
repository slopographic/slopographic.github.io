/* Slop Workflows: "+ Add step", a searchable menu of every operation (shared/ui/menubutton.js), grouped by app (File
 * convert, SlopIsolate, Slop Watermark…, and an app's macros under it once an app host adapter provides them). Each row
 * shows the kind it makes (SlopFlow tile); the search reads the label, the app, the group and the keywords. A step that
 * cannot take what the last step makes is still offered (its card then says why), but marked "cannot take PNG".
 *   addStep(ctx, id, options, { at }) → { step, notes, errors }   (also the commands' and the "Add to a workflow…" way)
 *   mountAdd(ctx, button) */
import { checksOf } from './steps.js';
import { kindsLabel } from '../core/compat.js';
import { tr } from '../core/text.js';

/** The kinds the next step gets: what the last step makes, or the files in. */
function lastKinds(ctx) {
  const res = checksOf(ctx);
  if (res.length) return res[res.length - 1].out;
  const k = [...new Set(ctx.S.files.map((f) => f.kind))];
  return k.length ? k : null;
}

export function addStep(ctx, id, options = {}, { at = null } = {}) {
  const { R, F } = ctx, op = R.byId(id);
  if (!op) throw new Error(`There is no step called ${id}.`);
  const v = R.validateOptions(op, options), step = { kind: op.kind === 'macro' ? 'macro' : 'op', id, options: {}, uid: F.uid() };
  if (op.kind === 'macro') { step.app = op.app; step.macroId = op.macroId || id; }
  const defs = R.defaultsOf(op);
  for (const [k, val] of Object.entries(v.options)) if (val !== defs[k] && !op.options.some((o) => o.key === k && o.type === 'password')) step.options[k] = val;
  ctx.edit(tr('workflows.undo.add', 'Add {name}', { name: op.label }), (d) => { if (at === null || at >= d.steps.length) d.steps.push(step); else d.steps.splice(Math.max(0, at), 0, step); });
  return { step, notes: v.notes, errors: v.errors };
}

function items(ctx) {
  const { R } = ctx, kinds = lastKinds(ctx), out = [];
  for (const g of R.apps()) {
    out.push({ heading: g.label });
    for (const op of g.ops) {
      if (op.available && !op.available()) continue;
      const bad = kinds ? kinds.filter((k) => !R.accepts(op, k)) : [];
      const made = R.outOf(op, kinds ? kinds[0] : op.from[0], R.defaultsOf(op));
      out.push({ value: op.id, label: kinds && bad.length === kinds.length ? tr('workflows.add.cannot', '{name} (cannot take {kinds})', { name: op.label, kinds: kindsLabel(bad) }) : op.label,
        icon: globalThis.SlopFlow.tile(made && made !== '*' ? made : 'file', { size: 'sm' }),
        keywords: [g.label, op.group || '', op.ext || '', ...(op.keywords || [])] });
    }
  }
  return out;
}

export function mountAdd(ctx, button) {
  globalThis.SlopMenuButton.attach(button, {
    label: tr('workflows.tool.add_step_tip', 'Add a step'), search: true, empty: tr('workflows.add.none', 'No step matches'), items: () => items(ctx),
    onPick: (id) => {
      const { step } = addStep(ctx, id);
      requestAnimationFrame(() => {
        const el = ctx.root.querySelector(`.wf-step[data-uid="${step.uid}"]`);
        if (el) { el.scrollIntoView({ block: 'nearest' }); const g = el.querySelector('.wf-grip'); if (g) g.focus(); }
      });
    },
  });
}
