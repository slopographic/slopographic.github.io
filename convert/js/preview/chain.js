/* The preview of a route (core/chain.js): the original file before, what the last step makes after. Cheap only: a route
 * with a video engine step (ffmpeg) is not run for a preview, the RAW and HEIC engines are not downloaded (their preview
 * options), large text is cut and PDFs give page 1, as for one conversion (model.js). Browser only.
 *   buildRoutePreview(steps, items)   steps: [{ conv, fmt, opts }] -> { before, after, note, outputs }
 *   runRouteFull(steps, items)        the whole route, as Download makes it -> [{ name, blob }] */
import { tr } from '../core/i18n.js';
import { runChain } from '../core/chain-run.js';
import { pickInputs, previewInput, beforePanel, afterPanel } from './model.js';
import { RAW_KINDS } from '../core/raw.js';
import { FIRST_PAGE_ONLY } from './spec.js';

const err = (e) => ({ kind: 'error', message: (e && e.message) || String(e) });
const asItems = (inputs) => inputs.map((i, n) => ({ id: n + 1, name: i.name, file: i.file, kind: i.kind }));

export async function buildRoutePreview(steps, items) {
  const inputs = pickInputs(steps[0].conv, items).map(previewInput);
  const before = await beforePanel(inputs[0]).catch(err);
  if (steps.some((s) => s.conv.engine)) {
    return { before, after: { kind: 'info', text: tr('convert.pv.route_engine') }, note: '', outputs: null };
  }
  let cut = inputs.some((i) => i.truncated);
  const tweak = (s, i) => {
    const o = { ...s.opts };
    if (i === 0 && inputs.some((x) => RAW_KINDS.includes(x.kind))) { o.rawPreview = true; cut = true; }   // no engine download from a preview
    if (i === 0 && inputs.some((x) => x.kind === 'heic')) { o.heicPreview = true; cut = true; }
    if (FIRST_PAGE_ONLY.includes(s.conv.id) && !String(o.pages || '').trim()) { o.pages = '1'; cut = true; }
    return o;
  };
  const res = await runChain(steps.map((s) => ({ conv: s.conv, fmt: s.fmt, to: s.to })), asItems(inputs), { optsFor: (c, it, i) => tweak(steps[i], i) });
  let after;
  if (res.outputs.length) {
    const outs = res.outputs.map((o) => ({ name: o.name, blob: o.blob }));
    after = await afterPanel(outs, before.text || '').catch(err);
  } else after = res.errors.length ? err(new Error(res.errors[0].message)) : { kind: 'info', text: tr('convert.pv.route_none') };
  if (cut && after.kind === 'error') after.hint = tr('convert.pv.cut_hint');
  const notes = [tr('convert.pv.route_last', { n: steps.length })];
  if (cut) notes.push(tr('convert.pv.cut_note'));
  if (before.note) notes.push(before.note);
  return { before, after, note: notes.join(' '), outputs: cut || res.errors.length ? null : res.outputs.map((o) => ({ name: o.name, blob: o.blob })) };
}

export async function runRouteFull(steps, items) {
  const res = await runChain(steps.map((s) => ({ conv: s.conv, fmt: s.fmt, to: s.to })), asItems(pickInputs(steps[0].conv, items)), { optsFor: (c, it, i) => steps[i].opts });
  if (!res.outputs.length && res.errors.length) throw new Error(res.errors[0].message);
  return res.outputs.map((o) => ({ name: o.name, blob: o.blob }));
}
