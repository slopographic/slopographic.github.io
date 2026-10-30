/* Keeps the keyboard focus through a redraw of the file list and the bulk bar: the control that had it (a row's
 * checkbox, Convert to or Remove, matched by the row's data-id) gets it back. When its row is gone (removed), the same
 * control on the row now in its place does, else the one above, else the drop zone's Choose files button.
 * An option control on a card or in the bulk bar keeps it by its id. A route's tile, + Then… and × keep it too.
 *   keepFocus(hosts, fallback, draw) */
const KINDS = ['.cv-bulk-allbox', '.cv-file-check', '.cv-to', '[data-remove]', '.cv-bulk-rm', '.cv-bulk-clear', '.cv-route-mid', '.cv-route-then', '.cv-route-x'];
const ROUTE = /^\.cv-route/;   // a route's controls (chain-row.js): a middle tile by its step; when gone, + Then… or Convert to

export function keepFocus(hosts, fallback, draw) {
  const a = document.activeElement;
  const host = a && hosts.find((x) => x.contains(a));
  if (!host) { draw(); return; }
  let kind = KINDS.find((k) => a.matches(k));
  if (kind === '.cv-route-mid') kind += `[data-step="${a.dataset.step}"]`;
  const id = a.id && !kind ? a.id : '';   // an option control (cv-o-<file>-<key>) has a stable id
  const li = a.closest('li[data-id]');
  const rows = li ? [...host.querySelectorAll('li[data-id]')] : [];
  const at = rows.indexOf(li);
  draw();
  let next = null;
  if (id) next = document.getElementById(id);
  else if (kind && li) {
    const same = host.querySelector(`li[data-id="${li.dataset.id}"] ${kind}`);
    const now = [...host.querySelectorAll('li[data-id]')];
    const near = now[at] || now[at - 1];
    const own = ROUTE.test(kind) && host.querySelector(`li[data-id="${li.dataset.id}"]`);
    next = same || (own && (own.querySelector('.cv-route-mid, .cv-route-then') || own.querySelector('.cv-to'))) || (near && (near.querySelector(kind) || near.querySelector('[data-remove]')));
  } else if (kind) next = host.querySelector(kind) || (ROUTE.test(kind) && host.querySelector('.cv-route-then, .cv-to')) || hosts.map((x) => x.querySelector('.cv-file-check, .cv-to')).find(Boolean);
  if (!next && fallback) next = fallback.querySelector('button');
  if (next && !next.disabled) next.focus({ preventScroll: true });
}
