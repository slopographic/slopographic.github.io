/* Slop Workflows: does each step fit the files the step before makes? Pure (the registry is passed in), Node-tested.
 *   check(steps, inputKinds, R)   steps: the workflow's steps ({ id, options }); inputKinds: the kinds of the files in
 *                                 (empty: none yet, so the first step's own kinds are assumed); R: shared/ops/registry.js
 *     → [{ ok, op, in: [kinds] | null, out: [kinds] | null, message }] one per step; null kinds = any (a step that takes
 *       any file and keeps it, Rename, before anything fixes the kind)
 *   firstProblem(result) → { index, message } | null
 *   kindsLabel(kinds) → 'PNG, JPG'  */
import { TAG } from '../../../convert/js/core/chain.js';
import { tr } from './text.js';

export const kindsLabel = (kinds) => (kinds && kinds.length ? kinds.map(TAG).join(', ') : tr('workflows.step.any', 'any file'));
const uniq = (list) => [...new Set(list)];

/** The kinds a workflow with no files yet is checked against: what its first step takes (none for "any file"). */
export function assumedKinds(op) {
  if (!op || op.from.includes('*')) return null;
  return op.from.slice();
}

export function check(steps, inputKinds, R) {
  const out = [];
  let kinds = inputKinds && inputKinds.length ? uniq(inputKinds) : null;
  steps.forEach((s, i) => {
    const op = R.byId(s.id);
    if (!op) { out.push({ ok: false, op: null, in: kinds, out: null, message: tr('workflows.check.na', 'This step ({id}) is not available on this page.', { id: s.id }) }); kinds = null; return; }
    if (i === 0 && kinds === null) kinds = assumedKinds(op);
    const opts = { ...R.defaultsOf(op), ...(s.options || {}) };
    const bad = kinds ? kinds.filter((k) => !R.accepts(op, k)) : [];
    let message = '';
    if (kinds && bad.length) {
      const v = { name: op.label, bad: kindsLabel(bad), takes: kindsLabel(op.from), i: String(i), prev: i ? (R.byId(steps[i - 1].id) || { label: steps[i - 1].id }).label : '' };
      message = i === 0 ? tr('workflows.check.first', '{name} cannot take {bad} files. It takes {takes}.', v)
        : tr('workflows.check.next', '{name} cannot take {bad}, which step {i} ({prev}) makes. It takes {takes}.', v);
    }
    if (!message && op.check) { try { message = op.check(opts) || ''; } catch (e) { message = e.message; } }
    // what goes on to the next step; when the kinds are not known (or none fit), the next step is not judged by them
    const made = kinds ? uniq(kinds.filter((k) => R.accepts(op, k)).map((k) => R.outOf(op, k, opts))) : op.ext ? [op.ext] : null;
    out.push({ ok: !message, op, in: kinds, out: made && made.length ? made : null, message });
    kinds = made && made.length ? made : null;
  });
  return out;
}

export function firstProblem(result) {
  const i = result.findIndex((r) => !r.ok);
  return i < 0 ? null : { index: i, message: tr('workflows.check.step', 'Step {n}: {message}', { n: String(i + 1), message: result[i].message }) };
}
