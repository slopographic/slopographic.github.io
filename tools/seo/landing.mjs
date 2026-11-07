// Landing pages, built from the app registry (shared/apps.js): one per app page under /apps/<id>/, plus
// /slop-365/, /creative-slop-pro/ and /compare/. Each page has an H1, an intro, a feature matrix (features as
// rows, with status and file types), the file types it opens, a button to the app, and related apps.
// Only registry facts are written. Called by tools/seo/write.mjs, which adds the SEO head block to each page.
// /slop-365/ and /creative-slop-pro/ are written only when every app they list is shown (a profile's apps.hide).
// In one language (L from lang.mjs, the root one when left out): the registry's title, tagline and features are the
// SEO tables' seo.reg.<id>.* in a language other than English (tools/seo/tables.mjs writes the English part).
import { isPage, registryWindow } from './site.mjs';
import { compareTables } from './roundups.mjs';
import { appNav, withToc, docsLayout } from './guide.mjs';
import { ROOT_L, esc, shell, cardList, statusOf, fileTypeList, fileTypes, mediaBlock, related } from './frame.mjs';
import OFFLINE_APPS from '../../shared/offline/manifest.js';
import { installIn } from '../../shared/seo/install-copy.mjs';
import { seg } from '../../shared/seo/i18n.mjs';

export { esc, shell, cardList, related, fileTypeList, STATUS, statusWords, siteTop, siteFoot, SITE_HEAD, videoLink, shotFigure, mediaBlock } from './frame.mjs';

/** Slop 365 tools, in the order the hub lists them. Each id must be an app in the registry. */
const CREATIVE = ['photoslop', 'vector', 'slopedit'];
export const SLOP365 = ['invoices', 'orders', 'contacts', 'inventory', 'crm', 'ledger', 'reports', 'tables', 'docs', 'notes'];
const NOTE = (L) => ({ beta: L.t('seo.ui.note.beta'), building: L.t('seo.ui.note.building', { status: statusOf({ status: 'building' }, L) }) });

/** An app's registry words in a language: { title, features } (English: the registry itself). */
export function regWords(app, L = ROOT_L) {
  if (L.code === 'en') return { title: app.title || app.name, features: [...(app.features || [])] };
  const k = `seo.reg.${seg(app.id)}`;
  return { title: app.title ? L.t(`${k}.title`) : app.name, features: [...(app.features || [])].map((f, i) => L.t(`${k}.features.${i}`)) };   // an array of this realm (the registry is read in a VM)
}

/** The offline download link, for an app with a shared offline build (shared/offline/manifest.js). */
const offlineLink = (app, L) => (OFFLINE_APPS[app.id] && OFFLINE_APPS[app.id].entry
  ? `\n<p class="note"><a href="/downloads/${esc(app.id)}.html" download>${esc(L.t('seo.ui.offline.link'))}</a>${esc(L.t('seo.ui.offline.note'))}</p>`
  : '');
/** Body of one app's landing page. */
function appBody(app, apps, tasks = [], roundups = [], L = ROOT_L) {
  const { title, features: feats } = regWords(app, L);
  const types = fileTypeList(app, L), status = statusOf(app, L), name = app.name;
  const rows = feats.length
    ? feats.map((f) => `<tr><td>${esc(f)}</td><td>${esc(status)}</td><td>${esc(fileTypes(app, L))}</td></tr>`).join('')
    : `<tr><td colspan="3">${esc(L.t('seo.ui.app.no_features'))}</td></tr>`;
  const note = NOTE(L)[app.status || 'live'];
  const intro = (feats.length ? L.t('seo.ui.app.features', { app: name, list: feats.slice(0, 2).join('; ') }) : L.t('seo.ui.app.no_features_line', { app: name })) +
    (types.length ? L.t('seo.ui.app.opens_types', { types: types.join(', ') }) : '');
  return `<p class="eyebrow">${esc(name)} · ${esc(status)}</p>
<h1>${esc(title)}</h1>
<p class="lead">${esc(L.code === 'en' ? app.tagline : L.t(`seo.reg.${seg(app.id)}.tagline`))}</p>
<p><a class="btn" href="/${esc(app.path)}" aria-label="${esc(L.t('seo.ui.app.open_now_label', { app: name }))}">${esc(L.t('seo.ui.app.open_now'))}</a></p>${offlineLink(app, L)}
<p class="note" data-web-only>${esc(installIn(L.code).how)}</p>
${mediaBlock(app, L)}
<p>${esc(intro)}</p>
${note ? `<p class="note">${esc(note)}</p>` : ''}
${tasks.length ? `<h2>${esc(L.t('seo.ui.app.what_you_can_do', { app: name }))}</h2>\n<ul>${tasks.map((t) => `<li><a href="/${esc(app.path)}${esc(t.slug)}/">${esc(t.h1)}</a></li>`).join('')}</ul>\n` : ''}${roundups.map((r) => `<h2>${esc(L.t('seo.ui.app.how_compares', { app: name }))}</h2>\n<p>${esc(L.t('seo.ui.app.next_to', { app: name, tools: r.tools.filter((t) => !t.ours).map((t) => t.name).join(', '), date: r.checked }))}</p>\n${compareTables(r, L)}\n<p><a href="/best/${esc(r.slug)}/">${esc(L.t('seo.ui.app.full_comparison', { h1: r.h1 }))}</a></p>\n`).join('')}<h2>${esc(L.t('seo.ui.app.matrix'))}</h2>
<div class="wrap"><table>
<caption>${esc(L.t('seo.ui.app.matrix_caption', { app: name }))}</caption>
<thead><tr><th scope="col">${esc(L.t('seo.ui.app.col_feature'))}</th><th scope="col">${esc(L.t('seo.ui.app.col_status'))}</th><th scope="col">${esc(L.t('seo.ui.app.col_types'))}</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>
<h2>${esc(L.t('seo.ui.app.file_types'))}</h2>
<p>${esc(types.length ? L.t('seo.ui.app.opens', { app: name, types: types.join(', ') }) : L.t('seo.ui.app.no_types'))}</p>
<h2>${esc(L.t('seo.ui.app.related'))}</h2>
${cardList(related(app, apps), L)}
<p class="note"><a href="/compare/">${esc(L.t('seo.ui.app.compare_all'))}</a></p>`;
}

function slop365Body(apps, L = ROOT_L) {
  const tools = SLOP365.map((id) => apps.find((a) => a.id === id));
  return `<p class="eyebrow">${esc(L.t('seo.ui.s365.eyebrow'))}</p>
<h1>${esc(L.t('seo.ui.s365.h1'))}</h1>
<p class="lead">${esc(L.t('seo.ui.s365.lead'))}</p>
<h2>${esc(L.t('seo.ui.s365.tools'))}</h2>
${cardList(tools, L)}`;
}

function creativeBody(apps, L = ROOT_L) {
  const picks = CREATIVE.map((id) => apps.find((a) => a.id === id));
  const [photo, vector, video] = picks;
  return `<p class="eyebrow">Creative Slop Pro</p>
<h1>${esc(L.t('seo.ui.csp.h1'))}</h1>
<p class="lead">${esc(L.t('seo.ui.csp.lead'))}</p>
<p>${esc(L.t('seo.ui.csp.intro'))}</p>
${cardList(picks, L)}
<h2>${esc(L.t('seo.ui.csp.not_h2'))}</h2>
<ul>
<li>${esc(L.t('seo.ui.csp.not_1'))}</li>
<li>${esc(L.t('seo.ui.csp.not_2'))}</li>
<li>${esc(L.t('seo.ui.csp.not_3'))}</li>
</ul>
<h2>${esc(L.t('seo.ui.csp.where_h2'))}</h2>
<ul>
<li><a href="/apps/photoslop/">${esc(photo.name)}</a>${esc(L.t('seo.ui.csp.photo'))}</li>
<li><a href="/apps/vector/">${esc(vector.name)}</a>${esc(L.t('seo.ui.csp.vector'))}</li>
<li><a href="/apps/slopedit/">${esc(video.name)}</a>${esc(L.t('seo.ui.csp.video'))}</li>
</ul>`;
}

function compareBody(apps, ROUNDUPS = [], L = ROOT_L) {
  const pages = apps.filter(isPage);
  // each app's comparison with other tools (shared/seo/roundups): "vs Photopea, GIMP, Pixlr", linked
  const vs = (a) => ROUNDUPS.filter((r) => r.app === a.id).map((r) => `<a href="/best/${esc(r.slug)}/">${esc(L.t('seo.ui.cmp.vs', { tools: r.tools.filter((t) => !t.ours).map((t) => t.name).slice(0, 3).join(', ') }))}</a>`).join('<br>') || `<span class="note">${esc(L.t('seo.ui.cmp.not_compared'))}</span>`;
  const rows = pages.map((a) => `<tr><td><a href="/apps/${esc(a.id)}/">${esc(a.name)}</a></td><td>${vs(a)}</td><td>${esc(statusOf(a, L))}</td><td>${esc(regWords(a, L).features.slice(0, 2).join('; ') || L.t('seo.ui.cmp.none_listed'))}</td><td>${esc(fileTypes(a, L))}</td></tr>`).join('');
  const col = (k) => `<th scope="col">${esc(L.t('seo.ui.cmp.col_' + k))}</th>`;
  return `<p class="eyebrow">${esc(L.t('seo.ui.cmp.eyebrow'))}</p>
<h1>${esc(L.t('seo.ui.cmp.h1'))}</h1>
<p class="lead">${esc(L.t('seo.ui.cmp.lead', { n: pages.length }))}</p>
${ROUNDUPS.length ? `<h2>${esc(L.t('seo.ui.cmp.with_tools'))}</h2>\n<p>${esc(L.t('seo.ui.cmp.with_tools_p'))}</p>\n<ul class="cmp-list">${ROUNDUPS.map((r) => `<li><a href="/best/${esc(r.slug)}/">${esc(r.h1)}</a></li>`).join('')}</ul>\n<h2>${esc(L.t('seo.ui.cmp.all_apps'))}</h2>` : ''}
<div class="wrap"><table>
<caption>${esc(L.t('seo.ui.cmp.caption'))}</caption>
<thead><tr>${['app', 'compared', 'status', 'features', 'types'].map(col).join('')}</tr></thead>
<tbody>${rows}</tbody>
</table></div>`;
}

/**
 * Every landing page: [{ key, dir, url, html, crumb }]. `key` is the copy id in shared/seo/copy.mjs LANDING
 * (an app id, or slop-365, creative-slop-pro, compare). `dir` is the folder the page is written to (in the language's
 * folder: write.mjs adds it). Throws if a page has no copy.
 */
export function landingPages(apps, site, LANDING, TASKS = [], ROUNDUPS = [], GUIDES = [], L = ROOT_L) {
  const out = [];
  const add = (key, dir, crumb, html) => {
    if (!LANDING[key]) throw new Error(`${key}: no landing copy in shared/seo/copy.mjs LANDING`);
    out.push({ key, dir, url: `${site}/${dir}`, html: shell(html, L), crumb });
  };
  for (const app of apps) {
    if (!isPage(app)) continue;
    const tasks = TASKS.filter((t) => t.app === app.id), roundups = ROUNDUPS.filter((r) => r.app === app.id);
    const { body, toc } = withToc(appBody(app, apps, tasks, roundups, L));
    add(app.id, `apps/${app.id}/`, app.name, docsLayout(appNav(app, { tasks, roundups, guides: GUIDES.filter((g) => g.app === app.id) }, `/apps/${app.id}/`, L), toc, body, L));
  }
  // a page of a few apps: only when the profile shows them all (an id the registry lacks is a mistake here)
  const all = (ids, what) => {
    const known = registryWindow().SLOP_ALL_APPS;
    if (ids.some((id) => !known.some((a) => a.id === id))) throw new Error(`${what} lists an id that is not in shared/apps.js`);
    return ids.every((id) => apps.some((a) => a.id === id));
  };
  if (all(SLOP365, 'SLOP365')) add('slop-365', 'slop-365/', L.t('seo.ui.s365.crumb'), slop365Body(apps, L));
  if (all(CREATIVE, 'Creative Slop Pro')) add('creative-slop-pro', 'creative-slop-pro/', L.t('seo.ui.csp.crumb'), creativeBody(apps, L));
  add('compare', 'compare/', L.t('seo.ui.cmp.crumb'), compareBody(apps, ROUNDUPS, L));
  return out;
}
