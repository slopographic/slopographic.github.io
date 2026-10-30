// Round-up pages: "the best free <kind of tool>", a fair comparison of one of our apps with well-known tools, at
// /best/<slug>/ in the site's look (landing.mjs shell). The copy is in shared/seo/roundups/ (one file per family).
// Every claim about another product carries a source (its own page) and the date it was checked; the page says we make
// one of the tools, states its criteria, and gives each tool an honest "best for". write.mjs adds the head and sitemap.
//   checkRoundup(r, apps) -> throws on the first problem
//   roundupPages(apps, site, ROUNDUPS, { TASKS, GUIDES }, L) -> [{ key, dir, url, html, r }]
//   roundupJsonLd(r, url, site, L) -> Article, ItemList, BreadcrumbList and FAQPage
// L: the language (a lang.mjs context), the root one when left out. The facts (names, URLs, sources, dates, marks) are
// the same in every language; only the words around them are translated (shared/seo/i18n/README.md).
import { ROOT_L, esc, shell } from './frame.mjs';
import { appNav, withToc, docsLayout } from './guide.mjs';

const MONTH = /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export function checkRoundup(r, apps) {
  const fail = (m) => { throw new Error(`roundup ${r.slug}: ${m}`); };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.slug || '')) fail('slug must be lower-case words joined by hyphens');
  if (!apps.find((a) => a.id === r.app)) fail(`no app ${r.app} in shared/apps.js`);
  if (!MONTH.test(r.checked || '')) fail('checked must be the date the facts were checked, YYYY-MM-DD');
  if (!r.h1 || !r.lead || !Array.isArray(r.criteria) || r.criteria.length < 3) fail('h1, lead and at least 3 criteria');
  if (!Array.isArray(r.tools) || r.tools.length < 3 || r.tools.length > 8) fail('3 to 8 tools');
  if (r.tools.filter((t) => t.ours).length !== 1) fail('exactly one tool is ours (ours: true)');
  if (!Array.isArray(r.columns) || !r.columns.length) fail('columns: the comparison table headings');
  for (const t of r.tools) {
    if (!t.name || !t.bestFor || !Array.isArray(t.pros) || !Array.isArray(t.cons) || !t.cons.length) fail(`${t.name}: name, bestFor, pros and at least one con`);
    if (!Array.isArray(t.cells) || t.cells.length !== r.columns.length) fail(`${t.name}: one cell per column`);
    if (!t.ours) {
      if (!/^https:\/\//.test(t.url || '')) fail(`${t.name}: its own https URL`);
      if (!Array.isArray(t.sources) || !t.sources.length || t.sources.some((s) => !/^https:\/\//.test(s.url || '') || !s.label)) fail(`${t.name}: sources [{ label, url }] for the facts`);
    }
  }
  if (!Array.isArray(r.faq) || r.faq.length < 3) fail('at least 3 questions');
  if (r.matrix) {
    if (!Array.isArray(r.matrix) || r.matrix.length < 5) fail('matrix: at least 5 features');
    for (const m of r.matrix) {
      if (!m.feature || !Array.isArray(m.values) || m.values.length !== r.tools.length) fail(`matrix "${m.feature}": one value per tool`);
      for (const v of m.values) if (!(v in MARK) && (typeof v !== 'string' || !v.trim())) fail(`matrix "${m.feature}": yes, no, partial, unknown or a short text`);
    }
  }
}
/** The marks of the feature matrix: yes, no, partial (some of it, or on a paid plan), unknown (the sources do not say). */
const MARK = { yes: '✓', no: '✗', partial: '◐', unknown: '–' };
const cell = (v, L) => (MARK[v] ? `<td class="m-${v}"><span aria-hidden="true">${MARK[v]}</span> ${esc(L.t('seo.ui.best.mark_' + v))}</td>` : `<td>${esc(v)}</td>`);
/** The comparison tables of a round-up: the facts at a glance and, when it has one, the feature matrix. Used by the
 *  round-up page and by the app's landing page (landing.mjs), so both show the same sourced data. */
export function compareTables(r, L = ROOT_L) {
  const name = (t) => `${esc(t.name)}${t.ours ? ` <span class="l-badge">${esc(L.t('seo.ui.best.ours'))}</span>` : ''}`;
  const glance = `<div class="wrap"><table class="cmp"><caption>${esc(L.t('seo.ui.best.glance_caption', { h1: r.h1, date: r.checked }))}</caption>
<thead><tr><th scope="col">${esc(L.t('seo.ui.best.col_tool'))}</th>${r.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${r.tools.map((t) => `<tr${t.ours ? ' class="us"' : ''}><th scope="row">${name(t)}</th>${t.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (!r.matrix) return glance;
  const matrix = `<div class="wrap"><table class="cmp matrix"><caption>${esc(L.t('seo.ui.best.matrix_caption'))}</caption>
<thead><tr><th scope="col">${esc(L.t('seo.ui.best.col_feature'))}</th>${r.tools.map((t) => `<th scope="col"${t.ours ? ' class="us"' : ''}>${name(t)}</th>`).join('')}</tr></thead><tbody>${r.matrix.map((m) => `<tr><th scope="row">${esc(m.feature)}</th>${m.values.map((v) => cell(v, L)).join('')}</tr>`).join('')}</tbody></table></div>`;
  return glance + '\n' + matrix;
}

const app = (apps, id) => apps.find((a) => a.id === id);
function body(r, apps, L) {
  const ours = r.tools.find((t) => t.ours), a = app(apps, r.app), u = (k, v) => esc(L.t('seo.ui.best.' + k, v));
  const tools = r.tools.map((t, i) => `<h2 id="t${i + 1}">${i + 1}. ${esc(t.name)}${t.ours ? u('ours_paren') : ''}</h2>
<p><b>${u('best_for')}</b> ${esc(t.bestFor)}</p>
${t.summary ? `<p>${esc(t.summary)}</p>` : ''}
<h3>${u('good')}</h3><ul>${t.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<h3>${u('not_so_good')}</h3><ul>${t.cons.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
<p>${t.ours ? `<a class="btn" href="/${esc(a.path)}">${esc(L.t('seo.ui.task.open', { app: a.name }))}</a>` : `<a href="${esc(t.url)}" rel="noopener nofollow">${u('website', { tool: t.name })}</a>`}${t.sources ? ` · ${u('sources')} ${t.sources.map((s) => `<a href="${esc(s.url)}" rel="noopener nofollow">${esc(s.label)}</a>`).join(', ')}` : ''}</p>`).join('\n');
  return `<p class="eyebrow">${u('eyebrow', { date: r.checked })}</p>
<h1>${esc(r.h1)}</h1>
<p class="lead">${esc(r.lead)}</p>
<p class="note">${u('we_make', { ours: ours.name, date: r.checked })}</p>
<h2>${u('how_compared')}</h2>
<ul>${r.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
<h2>${u('glance')}</h2>
${compareTables(r, L)}
${tools}
${r.verdict ? `<h2>${u('choose')}</h2>\n${(Array.isArray(r.verdict) ? r.verdict : [r.verdict]).map((p) => `<p>${esc(p)}</p>`).join('\n')}` : ''}
<h2>${esc(L.t('seo.ui.task.questions'))}</h2>
${r.faq.map(([q, ans]) => `<h3>${esc(q)}</h3>\n<p>${esc(ans)}</p>`).join('\n')}
<p class="note">${u('trademarks')}</p>`;
}

export function roundupJsonLd(r, url, site, L = ROOT_L) {
  return [
    { '@context': 'https://schema.org', '@type': 'Article', headline: r.h1, description: r.description, dateModified: r.checked, url,
      author: { '@type': 'Organization', name: 'Slopographic', url: `${site}/` }, publisher: { '@type': 'Organization', name: 'Slopographic', url: `${site}/` } },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: r.h1, itemListElement: r.tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: t.ours ? `${site}/apps/${r.app}/` : t.url })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: L.t('seo.ui.crumb.home'), item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: L.t('seo.ui.crumb.compared'), item: `${site}/best/` }, { '@type': 'ListItem', position: 3, name: r.crumb || r.h1, item: url }] },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: r.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
}

export function roundupPages(apps, site, ROUNDUPS, { TASKS = [], GUIDES = [] } = {}, L = ROOT_L) {
  const seen = new Set();
  return ROUNDUPS.map((r) => {
    checkRoundup(r, apps);
    if (seen.has(r.slug)) throw new Error(`roundup ${r.slug}: listed twice`);
    seen.add(r.slug);
    const a = app(apps, r.app), { body: b, toc } = withToc(body(r, apps, L));
    const nav = appNav(a, { tasks: TASKS.filter((t) => t.app === r.app), roundups: ROUNDUPS.filter((x) => x.app === r.app), guides: GUIDES.filter((g) => g.app === r.app) }, `/best/${r.slug}/`, L);
    return { key: `best/${r.slug}`, dir: `best/${r.slug}/`, url: `${site}/best/${r.slug}/`, html: shell(docsLayout(nav, toc, b, L), L), r };
  });
}

/** The index of every round-up: /best/. */
export function roundupIndex(site, ROUNDUPS, L = ROOT_L) {
  const list = ROUNDUPS.map((r) => `<li><a href="/best/${esc(r.slug)}/">${esc(r.h1)}</a></li>`).join(''), u = (k) => esc(L.t('seo.ui.best.' + k));
  return { dir: 'best/', url: `${site}/best/`, html: shell(`<p class="eyebrow">${u('index_eyebrow')}</p>\n<h1>${u('index_h1')}</h1>\n<p class="lead">${u('index_lead')}</p>\n<ul>${list}</ul>`, L) };
}
