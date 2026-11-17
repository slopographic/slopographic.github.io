/* The homepage's savings list (#savings): every paid subscription the suite stands in for, with the apps it covers, its
 * yearly price, its terms and its pricing page, then the total and the figure the hero line shows (shared/savings/data.mjs,
 * the one source; the hero line's number is that file's SHOWN, tests/node/savings.test.mjs checks the two agree). The list
 * sits in a closed <details> until asked for, so filling it never moves the page; the hero's asterisk (href="#savings")
 * opens it. Prices are formatted in the page's language (SlopI18n.money, Intl), always in US dollars. A brand profile with
 * "savings": false leaves out the line and the section (tools/whitelabel), and this script then does nothing.
 * Module (index.html loads it with type="module"). Tests: tests/node/savings.test.mjs, tests/home/savings.test.html. */
import { PLANS, CURRENCY, yearly, TOTAL, SHOWN } from '../shared/savings/data.mjs';

const SHOW = /*profile:savings*/true;
const I = window.SlopI18n;
const t = (k, vars) => (I ? I.t(k, vars) : k);
const money = (n, opt) => (I ? I.money(n, CURRENCY, opt) : '$' + n.toFixed(2));
const WHOLE = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
const day = (iso) => (I ? I.date(iso + 'T12:00:00', { dateStyle: 'medium' }) : iso);
const appName = (id) => (window.slopAppName ? window.slopAppName(id) : id);
// the apps this build lists (a brand profile can hide some: shared/apps.js leaves them out of SLOP_APPS)
const listed = (id) => !window.SLOP_APPS || window.SLOP_APPS.some((a) => a.id === id);

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  for (const c of kids) if (c != null) e.append(c);
  return e;
}

/** The table: one row per plan, then the total and the shown figure. */
export function render(host) {
  const head = el('tr', null, ...['col_plan', 'col_apps', 'col_price', 'col_source'].map((k) => el('th', { scope: 'col' }, t('savings.list.' + k))));
  const rows = PLANS.map((p) => el('tr', null,
    el('th', { scope: 'row' }, el('b', null, p.name), el('small', null, t('savings.terms.' + p.terms))),
    el('td', null, (I ? I.list(p.apps.filter(listed).map(appName)) : p.apps.join(', '))),
    el('td', { class: 'num' }, money(yearly(p))),
    el('td', null, el('a', { href: p.source, rel: 'noopener', target: '_blank' }, t('savings.list.source', { date: day(p.checked) })))));
  const foot = el('tr', null, el('th', { scope: 'row', colspan: '2' }, t('savings.list.total')), el('td', { class: 'num' }, money(TOTAL)),
    el('td', null, t('savings.list.shown', { total: money(SHOWN, WHOLE) })));
  host.replaceChildren(el('table', { class: 'savings-table' }, el('thead', null, head), el('tbody', null, ...rows), el('tfoot', null, foot)));
}

/** Opens the list when the asterisk (or a link to #savings) is followed. */
function openOnHash(details) {
  const open = () => { if (location.hash === '#savings') details.open = true; };
  window.addEventListener('hashchange', open);
  document.addEventListener('click', (e) => { if (e.target.closest('a[href="#savings"]')) details.open = true; });
  open();
}

const host = document.getElementById('savings-list'), details = document.getElementById('savings-how');
if (SHOW && host && details) {
  render(host);
  openOnHash(details);
  window.addEventListener('slopi18n', () => render(host));   // a language change: the new tables are in
}
