/* Draws the tool's lists: the files (one row each with its own Convert to and Options, file-row.js and file-opts.js),
 * the bulk bar for the selected rows (bulk.js), and the converted files with their Download links. Focus survives the
 * redraw (focus.js). A card whose target is a route (core/chain.js) shows the route under its row (chain-row.js) and one
 * group of options per step (chain-opts.js); a one-step target has "+ Then…" beside its Convert to. The bulk bar does the
 * same for the selected files when they share a target.
 *   drawFiles(tool, { bulk })     tool is the ConvertTool (its items, targets and handlers); bulk: false keeps the bar
 *   drawResults(ui, outputs) */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import { fmtSize } from '../io/files.js';
import { choicesFor, sharedTargets, commonTarget, keywordsOf, WITH } from './targets.js';
import { conversionById, groupLabel } from '../core/catalog.js';
import { optionsBox } from './file-opts.js';
import { fileRow } from './file-row.js';
import { drawBulk } from './bulk.js';
import { keepFocus } from './focus.js';
import { isRoute, stepsOf } from '../core/chain.js';
import { routeRow, thenButton } from './chain-row.js';
import { routeOptionsBox } from './chain-opts.js';

const choice = (c) => ({ id: c.id, label: c.label, ext: c.ext || 'file', group: c.route ? c.group : groupLabel(c.group), keywords: keywordsOf(c) });   // built at each draw, so labels follow the language

const lastOf = (key) => { const s = stepsOf(key); return s.length ? s[s.length - 1].conv : null; };

/** A card's Options: the options of its own target, with its own values (for a route: per step). */
function rowOptions(tool, it, target) {
  if (isRoute(target)) {
    return routeOptionsBox({ kind: it.kind, key: target, valuesOf: (c) => tool.valuesOf(it, c), prefix: `${it.id}-`, open: it.optsOpen,
      onToggle: (o) => { it.optsOpen = o; }, onChange: (c, v, final) => tool.rowOptions(it, c, v, final), keep: !!it.keepMid,
      onKeep: (on) => { it.keepMid = on; tool.emit(); } });
  }
  const conv = target && target !== WITH ? conversionById(target) : null;
  return optionsBox({ conv, values: tool.valuesOf(it, conv), prefix: `${it.id}-`, label: tr('convert.opts.options'), open: it.optsOpen,
    onToggle: (o) => { it.optsOpen = o; }, onChange: (v, final) => tool.rowOptions(it, conv, v, final) });
}

export function drawFiles(tool, { bulk = true } = {}) {
  const ui = tool.ui, act = tool.active(), only = tool.only;
  keepFocus(bulk ? [ui.list, ui.bulk] : [ui.list], ui.drop, () => {
    ui.list.replaceChildren(...(tool.items.length ? tool.items.map((it) => {
      const reason = tool.skipReason(it), target = reason ? '' : tool.targetOf(it);
      const chain = reason ? {} : routeParts(tool, it.kind, target, it.name, (k, fmt) => tool.rowRoute(it, k, fmt), (c) => tool.valuesOf(it, c));
      return fileRow(it, { reason, choices: reason ? [] : choicesFor(it, act, only), target, selected: !reason && it.selected, ...chain,
        onPick: (x, id) => tool.rowPick(x, id), onSelect: (x, on, range) => tool.select(x, on, range), options: reason ? null : rowOptions(tool, it, target) });
    }) : [h('li', { class: 'cv-empty' }, tr('convert.tool.no_files'))]));
    if (!bulk) return;
    const sel = tool.selected(), common = commonTarget(sel, act, only), conv = common ? (isRoute(common) ? lastOf(common) : conversionById(common)) : null;
    const mates = () => sel.filter((i) => tool.targetOf(i) === common);
    const prefix = `${tool.ns === 'cv' ? '' : tool.ns}bulk-`;
    const every = (on) => { for (const i of act) i.selected = on; tool.render(); };
    const label = tr('convert.bulk.options_sel', { n: sel.length }), onToggle = (o) => { tool.bulkOptsOpen = o; };
    const options = !(sel.length > 1 && conv) ? null : isRoute(common)
      ? routeOptionsBox({ kind: sel[0].kind, key: common, valuesOf: (c) => tool.valuesOf(sel[0], c), prefix, cls: 'cv-bulk-opts', label, open: tool.bulkOptsOpen, onToggle,
        onChange: (c, v, final) => tool.bulkOptions(mates(), c, v, final), keep: sel.every((i) => i.keepMid), onKeep: (on) => { for (const i of sel) i.keepMid = on; tool.emit(); } })
      : optionsBox({ conv, values: tool.valuesOf(sel[0], conv), prefix, cls: 'cv-bulk-opts', label, open: tool.bulkOptsOpen, onToggle,
        onChange: (v, final) => tool.bulkOptions(mates(), conv, v, final) });
    const chain = sel.length && common ? routeParts(tool, sel[0].kind, common, tr('convert.bulk.the_n_selected', { n: sel.length }), (k, fmt) => tool.bulkRoute(k, fmt), (c) => tool.valuesOf(sel[0], c)) : {};
    drawBulk(ui.bulk, { items: act, selected: sel, target: common, choices: sharedTargets(sel, only).map(choice), options, ...chain,
      onAll: every, onNone: () => every(false), onPick: (id) => tool.bulkPick(id),
      onRemove: () => { tool.items = tool.items.filter((i) => !sel.includes(i)); tool.render(); } });
  });
}

/** A route's row of tiles (its target is a route), or "+ Then…" for a one-step target; none on a page for one conversion. */
function routeParts(tool, kind, target, name, onRoute, valuesFor) {
  if (!target || target === WITH) return {};
  const only = tool.only;
  if (isRoute(target)) return { route: routeRow({ kind, key: target, finalOpts: valuesFor(lastOf(target)), name, fixed: !!only, onRoute }) };
  if (only) return {};
  return { then: thenButton({ kind, key: target, finalOpts: valuesFor(conversionById(target)), name, onRoute }) };
}

export function drawResults(ui, outputs) {
  ui.results.hidden = !outputs.length;
  ui.zip.hidden = outputs.length < 2;
  ui.outList.replaceChildren(...outputs.map((o) => h('li', { class: 'cv-out-item' },
    h('span', { class: 'cv-file-name', text: o.name }),
    h('span', { class: 'cv-file-meta', text: fmtSize(o.blob.size) + (o.mid ? ' · ' + tr('convert.tool.in_between') : '') }),
    h('a', { class: 'cv-btn cv-small cv-primary', href: o.url, download: o.name }, tr('ui.download')))));
}
