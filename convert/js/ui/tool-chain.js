/* The ConvertTool's routes (core/chain.js) and its Convert run, kept beside tool.js:
 *   tool.rowRoute(item, key, fmt)   a card's route changed (a middle tile, + Then…, ×); fmt: the Format the new last step keeps
 *   tool.bulkRoute(key, fmt)        the same for the selected files (or every file) where the route fits
 *   tool.routes()                   the route keys every file in scope could take (tool.targets() lists the single conversions)
 *   runTool(tool)                   Convert: every file with its own target and values, a route step by step; the status line
 *                                   names the step ("Step 2 of 3: CSV → JSON"); in-between files join the results when kept */
import { tr } from '../core/i18n.js';
import { stepsOf, TAG } from '../core/chain.js';
import { applyTarget } from './targets.js';
import { runGroups, firstUseGate } from './run.js';
import { uniqueName } from '../io/files.js';
import { forgetSecrets } from './file-opts.js';
import { CONVERSIONS } from '../core/catalog.js';


/** A step that had its Format fixed by the route ('pdf-to-images@jpg') and is now the last keeps it as its option. */
function keepFormat(it, key, fmt) {
  if (!fmt) return;
  const s = stepsOf(key), conv = s.length && s[s.length - 1].conv;
  if (!conv) return;
  it.opts = it.opts || {};
  it.opts[conv.id] = { ...(it.opts[conv.id] || {}), format: fmt };
}

export function installRoutes(Tool) {
  Object.assign(Tool.prototype, {
    rowRoute(it, key, fmt = '') { it.target = key; keepFormat(it, key, fmt); this.render(); },
    bulkRoute(key, fmt = '') {
      const act = this.active();
      for (const it of this.scope()) if (applyTarget(it, act, key, this.only)) keepFormat(it, key, fmt);
      this.render();
    },
    routes() { return this.candidates().filter((c) => c.route).map((c) => c.id); },
  });
}

function statusOf(i, total, p) {
  if (p && p.steps > 1) {
    const v = { step: p.step, steps: p.steps, from: TAG(p.from), to: TAG(p.to), i: p.done + 1, n: p.total };
    return p.total > 1 ? tr('convert.run.step_of_n', v) : tr('convert.run.step', v);
  }
  return total > 1 ? tr('convert.run.i_of_n', { i: Math.floor(i) + 1, n: total }) : tr('convert.run.converting');
}

export async function runTool(tool) {
  const groups = tool.groups(), ui = tool.ui;
  if (!groups.length || tool.busy) return;
  const engines = groups.flatMap((g) => (g.steps || [g]).map((s) => s.conv.engine));
  if (engines.includes('ffmpeg') && !(await firstUseGate())) return;   // the video engine's first download asks first
  tool.busy = true;
  tool.clearOutputs();
  for (const it of tool.items) it.error = '';
  ui.run.disabled = true;
  const n = groups.reduce((s, g) => s + g.items.length, 0);
  tool.setStatus(tr('convert.run.converting_n', { n }));
  ui.flow.state('run').progress(0);
  const res = await runGroups(groups, (conv, it) => tool.valuesOf(it, conv), (i, total, p) => { ui.flow.progress(i / total); tool.setStatus(statusOf(i, total, p)); });
  for (const e of res.errors) for (const it of tool.items) if (e.ids.includes(it.id)) it.error = e.message;
  forgetSecrets(tool.items, CONVERSIONS);   // passwords (Protect PDF) are not kept once used; render() below clears the fields
  const taken = new Set();
  tool.outputs = res.outputs.map((o) => ({ name: uniqueName(o.name, taken), blob: o.blob, url: URL.createObjectURL(o.blob), ...(o.mid ? { mid: true } : {}) }));
  tool.busy = false;
  ui.flow.state(res.outputs.length ? 'done' : 'error');
  tool.setStatus([tool.summary(res), ...res.info].filter(Boolean).join(' '));
  tool.render();
  tool.renderResults();
  if (tool.opts.onResults) tool.opts.onResults(tool.outputs.slice());
}
