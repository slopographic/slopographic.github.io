/* Slop Workflows: running a workflow. The steps become the one runner's steps (convert/js/core/chain-run.js runChain):
 * each step's own operation from the registry, its option values checked against the option schema
 * (registry validateOptions), the kind it makes worked out per file (registry outOf), its title for the progress and the
 * errors, and its "keep" for the in-between files. Pure orchestration, Node-tested with fake operations.
 *   plan(doc, R, { secrets })   → { steps, options: [values per step], notes, errors }   secrets: { uid: { key: value } },
 *                                 the password fields, which are never stored in the workflow
 *   runWorkflow(doc, items, R, { secrets, signal, onUnit, progress }) → runChain's result, plus notes */
import { runChain } from '../../../convert/js/core/chain-run.js';

export function plan(doc, R, { secrets = {} } = {}) {
  const steps = [], options = [], notes = [], errors = [];
  doc.steps.forEach((s, i) => {
    const op = R.byId(s.id);
    if (!op) { errors.push(`Step ${i + 1}: ${s.id} is not available on this page.`); return; }
    const v = R.validateOptions(op, { ...(s.options || {}), ...(secrets[s.uid] || {}) });
    for (const e of v.errors) errors.push(`Step ${i + 1} (${op.label}): ${e}`);
    for (const n of v.notes) if (!/ignored unknown/.test(n)) notes.push(`Step ${i + 1} (${op.label}): ${n}`);
    steps.push({ conv: op, fmt: '', name: op.label, to: (kind, o) => R.outOf(op, kind, o) });
    options.push(v.options);
  });
  return { steps, options, notes, errors };
}

export async function runWorkflow(doc, items, R, { secrets = {}, signal = null, onUnit = null, progress = null } = {}) {
  const p = plan(doc, R, { secrets });
  if (p.errors.length) throw new Error(p.errors[0]);
  const res = await runChain(p.steps, items, { optsFor: (c, it, i) => p.options[i], keepStep: (i) => !!doc.steps[i].keep, onUnit, progress, signal });
  return { ...res, notes: p.notes };
}
