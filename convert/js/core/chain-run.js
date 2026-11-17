/* Runs a route (chain.js) or a workflow (workflows/, steps from the operation registry, shared/ops/registry.js): each
 * step's outputs are the next step's inputs. An 'each' step runs once per input, so a step that made several files (PDF
 * to images: one per page) has the next step mapped over each of them; a 'combine' step (Images to PDF) takes the whole
 * set at once. A failure stops only the files it came from, and says which step failed.
 * Pure orchestration: the work is each step's own run(files, options, { signal, progress }). No DOM.
 *   runChain(steps, items, { optsFor, progress, keep, keepStep, onUnit, signal })
 *     steps     [{ conv, fmt, to, name? }]: to is the kind the step makes (the next step's input kind), or a function
 *               (inKind, opts) → kind for a step whose output follows its input (Watermark keeps PNG as PNG); name is
 *               what errors and progress call the step (a workflow's step title), else 'CSV → JSON'
 *     items     [{ id, name, file, kind }]: the original files
 *     optsFor(conv, item, i)  the option values of step i for that file (a combine step takes its first file's)
 *     progress({ step, steps, from, to, done, total, name })  before every run
 *     keep(item)      true: that file's in-between outputs are returned too (every step)
 *     keepStep(i)     true: the outputs of step i (0-based) are returned too, for every file (a workflow's "keep")
 *     onUnit({ step, ids, state: 'run' | 'done' | 'error', message?, count?, fraction? })  per file per step, for a
 *                     progress grid; 'run' may repeat with a fraction when the step reports its own progress
 *     signal    an AbortSignal: checked before every run and passed to the step; a cancel ends the run with
 *               cancelled: true and the files not done get a 'Cancelled' error
 *   -> { outputs, middles, errors: [{ ids, step, message }], info, cancelled } */
import { TAG } from './chain.js';
import { tr } from './i18n.js';

const asFile = (o) => (typeof File === 'function' && !(o.blob instanceof File) ? new File([o.blob], o.name, { type: o.blob.type || '' }) : o.blob);
const uniq = (list) => [...new Set(list)];
const aborted = (signal) => !!(signal && signal.aborted);
const isAbort = (e) => e && (e.name === 'AbortError' || e.message === 'Cancelled');   // i18n-ignore: an id compared, not shown
const CANCELLED = () => tr('convert.chain.cancelled');

export async function runChain(steps, items, { optsFor = () => ({}), progress = null, keep = null, keepStep = null, onUnit = null, signal = null } = {}) {
  const errors = [], info = [], middles = [];
  let cur = items.map((it) => ({ name: it.name, file: it.file, kind: it.kind, src: [it] }));
  let kinds = items.length ? items[0].kind : '', cancelled = false;
  const unit = (d) => { if (onUnit) try { onUnit(d); } catch (e) { /* the grid must not stop the run */ } };
  for (let i = 0; i < steps.length && cur.length; i++) {
    const { conv, fmt, to, name } = steps[i], last = i === steps.length - 1;
    const units = conv.mode === 'combine' ? [cur] : cur.map((x) => [x]), next = [];
    const kindFor = (k, opts) => (typeof to === 'function' ? to(k, opts) : to) || conv.ext || k;
    const label = name || `${TAG(kinds)} → ${TAG(typeof to === 'function' ? kindFor(kinds, {}) : to || conv.ext)}`;
    for (let u = 0; u < units.length; u++) {
      const group = units[u], src = uniq(group.flatMap((x) => x.src)), ids = src.map((s) => s.id);
      if (cancelled || aborted(signal)) { cancelled = true; errors.push({ ids, step: i + 1, message: CANCELLED() }); unit({ step: i + 1, ids, state: 'error', message: CANCELLED() }); continue; }
      const opts = { ...optsFor(conv, src[0], i), ...(fmt ? { format: fmt } : {}) };
      const made = kindFor(group[0].kind, opts);
      if (progress) progress({ step: i + 1, steps: steps.length, from: kinds, to: made, done: u, total: units.length, name: label });
      unit({ step: i + 1, ids, state: 'run' });
      try {
        const ctx = { signal, progress: (f) => unit({ step: i + 1, ids, state: 'run', fraction: Math.max(0, Math.min(1, Number(f) || 0)) }) };
        const res = await conv.run(group.map(({ name: n, file, kind }) => ({ name: n, file, kind })), opts, ctx);
        if (res.info) info.push(res.info);
        for (const o of res) next.push({ name: o.name, file: asFile(o), blob: o.blob, kind: o.kind || made, src });
        if (!res.length) throw new Error(tr('convert.chain.no_file'));
        unit({ step: i + 1, ids, state: 'done', count: res.length });
      } catch (e) {
        if (isAbort(e) || aborted(signal)) { cancelled = true; errors.push({ ids, step: i + 1, message: CANCELLED() }); unit({ step: i + 1, ids, state: 'error', message: CANCELLED() }); continue; }
        const message = (e && e.message) || String(e);
        errors.push({ ids, step: i + 1, message: steps.length > 1 ? tr('convert.chain.step_failed', { i: String(i + 1), n: String(steps.length), label, message }) : message });
        unit({ step: i + 1, ids, state: 'error', message });
      }
    }
    if (!last && (keep || keepStep)) {
      const all = keepStep && keepStep(i);
      for (const o of next) if (all || (keep && o.src.some((s) => keep(s)))) middles.push({ name: o.name, blob: o.blob, step: i + 1, src: o.src.map((s) => s.id) });
    }
    cur = next;
    kinds = cur.length ? cur[0].kind : kindFor(kinds, {});
  }
  if (cancelled) cur = [];
  return { outputs: cur.map((o) => ({ name: o.name, blob: o.blob, kind: o.kind, src: o.src.map((s) => s.id) })), middles, errors, info: uniq(info), cancelled };
}
