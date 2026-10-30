/* Runs the conversions over a batch. 'each' conversions run once per file, 'combine' ones once for all their files.
 * A failure in one group is recorded against those files and the rest of the batch carries on.
 *   convertAll(conv, items, optsFor, progress)       one conversion over its files; optsFor(item) gives that file's values
 *                                                    (a 'combine' run takes its first file's) or optsFor is a plain object
 *   runGroups(groups, optsFor, progress)             every file with its own target and values: optsFor(conv, item); a
 *                                                    route's group (steps) runs step by step (core/chain-run.js), and
 *                                                    progress(done, total, { step, steps, from, to, done, total }) names the step;
 *                                                    in-between files of items with keepMid come back with mid: true
 *   firstUseGate()                                   the video engine's first-download notice (once) */
import { runChain } from '../core/chain-run.js';
import { kindsOf } from '../core/chain.js';
import { CONVERSIONS } from '../core/catalog.js';

/** A route's group: the kinds along it come from its first file (and its last step's own Format value). */
async function runRoute(g, optsFor, progress) {
  const kinds = kindsOf(g.items[0].kind, g.key, CONVERSIONS, optsFor(g.conv, g.items[0])) || [];
  const steps = g.steps.map((s, i) => ({ conv: s.conv, fmt: s.fmt, to: kinds[i + 1] || s.conv.ext }));
  const res = await runChain(steps, g.items, { optsFor: (c, it) => optsFor(c, it), keep: (it) => !!it.keepMid, progress });
  return { outputs: [...res.outputs, ...res.middles.map((m) => ({ ...m, mid: true }))], errors: res.errors, info: res.info };
}

export async function convertAll(conv, items, optsFor, progress) {
  const opts = typeof optsFor === 'function' ? optsFor : () => optsFor || {};
  const outputs = [], errors = [], info = [];
  const groups = conv.mode === 'combine' ? [items] : items.map((i) => [i]);
  for (let g = 0; g < groups.length; g++) {
    if (progress) progress(g, groups.length);
    const inputs = groups[g].map((i) => ({ name: i.name, file: i.file, kind: i.kind }));
    try {
      const res = await conv.run(inputs, opts(groups[g][0]));
      outputs.push(...res);
      if (res.info) info.push(res.info);
    } catch (e) {
      errors.push({ ids: groups[g].map((i) => i.id), message: (e && e.message) || String(e) });
    }
  }
  return { outputs, errors, info };
}

/** groups: [{ conv, items }]. optsFor(conv, item) gives a file's option values for that conversion. progress(done, total) counts runs. */
export async function runGroups(groups, optsFor, progress) {
  const all = { outputs: [], errors: [], info: [] };
  const units = (g) => ((g.steps ? g.steps[0].conv : g.conv).mode === 'combine' ? 1 : g.items.length);
  const total = groups.reduce((n, g) => n + units(g), 0);
  let done = 0;
  for (const g of groups) {
    const res = g.steps && g.steps.length > 1
      ? await runRoute(g, optsFor, (p) => progress && progress(done + ((p.step - 1) + p.done / p.total) / p.steps * units(g), total, p))
      : await convertAll(g.conv, g.items, (it) => optsFor(g.conv, it), (i) => progress && progress(done + i, total));
    done += units(g);
    all.outputs.push(...res.outputs); all.errors.push(...res.errors); all.info.push(...res.info);
  }
  return all;
}

export { firstUseGate } from '../core/ffmpeg-engine.js';
