/* The bar above the file list: "Select all", and once rows are selected "N selected · Convert to [..] · Remove". Its
 * Convert to offers only the formats every selected file can become (targets.js sharedTargets); when there are none it
 * says so plainly. Selection is the items' `selected` flag; a shift-click on a row's checkbox selects the range from the
 * last one clicked (tool.js select()).
 * Once there are files it is always there (one fixed-height bar, so the list below never moves); with several selected
 * files of one target it also holds their Options (file-opts.js), which set every one of them.
 *   drawBulk(host, { items, selected, choices, target, options, route, then, onAll, onPick, onRemove, onNone })
 *     route: the shared route's tiles (chain-row.js); then: "+ Then…" for a shared one-step target */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import { targetButton } from './file-row.js';

export function drawBulk(host, { items, selected, choices, target, options = null, route = null, then = null, onAll, onPick, onRemove, onNone }) {
  host.hidden = !items.length;
  if (host.hidden) { host.replaceChildren(); return; }
  const all = h('input', { type: 'checkbox', class: 'cv-file-check cv-bulk-allbox' });
  all.checked = selected.length > 0 && selected.length === items.length;
  all.indeterminate = selected.length > 0 && !all.checked;
  all.addEventListener('change', () => onAll(all.checked));
  const n = selected.length;
  const parts = [h('label', { class: 'cv-bulk-all' }, all, h('span', null, tr('ui.select_all')))];
  if (n) {
    parts.push(h('span', { class: 'cv-bulk-n', role: 'status' }, tr('convert.bulk.n_selected', { n })));
    parts.push(choices.length
      ? h('div', { class: 'cv-file-to' }, h('span', { class: 'cv-file-to-h', 'aria-hidden': 'true' }, tr('convert.row.convert_to')),
        targetButton({ label: tr('convert.bulk.convert_sel', { n }), choices, target, onPick, empty: tr('convert.bulk.choose'), cls: 'cv-bulk-to' }), then)
      : h('p', { class: 'cv-bulk-none' }, n === 1 ? tr('convert.bulk.none_fits_one') : tr('convert.bulk.none_fits', { n })));
    parts.push(h('button', { type: 'button', class: 'cv-btn cv-small cv-bulk-rm' }, tr('ui.remove')));
    parts.push(h('button', { type: 'button', class: 'cv-btn cv-small cv-bulk-clear' }, tr('convert.bulk.clear_sel')));
    if (route && choices.length) parts.push(route);
    if (options) parts.push(options);
  }
  host.replaceChildren(...parts);
  const rm = host.querySelector('.cv-bulk-rm'), none = host.querySelector('.cv-bulk-clear');
  if (rm) { rm.setAttribute('aria-label', tr('convert.bulk.remove_sel', { n })); rm.addEventListener('click', onRemove); }
  if (none) none.addEventListener('click', onNone);
}
