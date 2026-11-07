/* A route's Options (the card's disclosure when its target is a route, core/chain.js): one group per step under a heading,
 * "Step 1 · SIE → CSV", with that step's own options from the catalog (options.js draws them; values are the file's own,
 * kept per conversion like a one-step target's). A step in the middle has its Format fixed by the route, so that control is
 * left out. Last, "Also keep the in-between files" adds what the middle steps made to the results.
 *   routeOptionsBox({ kind, key, valuesOf(conv), prefix, open, onToggle, onChange(conv, values, final), keep, onKeep, cls, label })
 *   control ids: cv-o-<prefix>s<step>-<key>, and cv-o-<prefix>keep */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import { renderOptions, readOptions } from './options.js';
import { changed } from './file-opts.js';
import { stepsOf, kindsOf, stepLabel } from '../core/chain.js';
import { CONVERSIONS } from '../core/catalog.js';

/** The options a step shows: a middle step's Format is the route's. */
export const stepSpecs = (step, last) => step.conv.options.filter((o) => last || o.key !== 'format');

export function routeOptionsBox({ kind, key, valuesOf, prefix, open = false, onToggle, onChange, keep = false, onKeep, cls = '', label = tr('convert.opts.options') }) {
  const steps = stepsOf(key), lastVals = valuesOf(steps[steps.length - 1].conv);
  const kinds = kindsOf(kind, key, CONVERSIONS, lastVals) || [];
  const sum = h('span', { class: 'cv-file-opts-sum' });
  const vals = steps.map((s) => valuesOf(s.conv));
  const paint = () => { sum.textContent = steps.map((s, i) => changed({ options: stepSpecs(s, i === steps.length - 1) }, vals[i])).filter(Boolean).join('; '); };
  const groups = steps.map((s, i) => {
    const specs = stepSpecs(s, i === steps.length - 1), id = `cv-o-${prefix}s${i + 1}-h`;
    const body = h('div', { class: 'cv-opts-body' });
    if (specs.length) renderOptions(body, specs, vals[i], `${prefix}s${i + 1}-`);
    else body.append(h('p', { class: 'cv-hint' }, tr('convert.opts.no_step_opts')));
    const read = (e) => {
      const v = readOptions(body, specs, `${prefix}s${i + 1}-`);
      vals[i] = { ...vals[i], ...v };
      paint();
      if (onChange) onChange(s.conv, vals[i], e.type === 'change');
    };
    body.addEventListener('input', read);
    body.addEventListener('change', read);
    return h('section', { class: 'cv-step-opts', 'aria-labelledby': id, 'data-step': i + 1 }, h('h4', { class: 'cv-step-h', id }, kinds.length > i + 1 ? stepLabel(kinds, i) : tr('convert.opts.step', { n: i + 1 })), body);
  });
  const box = h('input', { type: 'checkbox', id: `cv-o-${prefix}keep`, checked: !!keep });
  box.addEventListener('change', () => { if (onKeep) onKeep(box.checked); });
  const keepRow = h('div', { class: 'cv-opt cv-check cv-keep' }, h('label', { for: box.id }, box, ' ', tr('convert.opts.keep_mid')));
  paint();
  const d = h('details', { class: 'cv-file-opts cv-route-opts ' + cls, open: !!open },
    h('summary', { class: 'cv-file-opts-h' }, h('span', null, label), sum), ...groups, keepRow);
  d.addEventListener('toggle', () => { if (onToggle) onToggle(d.open); });
  return d;
}
