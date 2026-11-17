// Guides: the tutorials of each app ("Getting started with PhotoSlop" and the like), written to /<app path><slug>/ in
// the guide layout (guide.mjs), with the app's tutorial video. The copy is in shared/seo/guides/ (one file per family).
// A guide: { app, slug, crumb, title (≤ 75), description (120–160), h1, lead, sections: [{ h2, text?: [paragraphs],
//   steps?: [lines], image?: { src (under /assets/), alt }, tip? }] (≥ 3), shortcuts?: [[keys, what it does]] }.
//   checkGuide(g, app) -> throws on the first problem
//   guidePages(apps, site, GUIDES, { TASKS, ROUNDUPS }, L) -> [{ key, dir, url, html, app, guide }]
//   guideJsonLd(g, app, url, site, L) -> TechArticle, BreadcrumbList and, with a video, VideoObject
// L: the language (a lang.mjs context), the root one when left out.
import { ROOT_L, esc, shell, videoLink } from './frame.mjs';
import { appNav, withToc, docsLayout } from './guide.mjs';
import { videoJsonLd } from './tasks.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './site.mjs';
/** A guide picture that is on disk (a white-label build without media leaves them out, and the page then has none). */
const hasImage = (img) => !!img && existsSync(path.join(ROOT, img.src));

export function checkGuide(g, app) {
  const fail = (m) => { throw new Error(`guide ${g.app}/${g.slug}: ${m}`); };
  if (!app) fail('no such app in shared/apps.js');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug || '')) fail('slug must be lower-case words joined by hyphens');
  if (!g.h1 || !g.lead || !g.crumb) fail('h1, crumb and lead');
  if (!Array.isArray(g.sections) || g.sections.length < 3) fail('at least 3 sections');
  for (const s of g.sections) {
    if (!s.h2 || !((s.text && s.text.length) || (s.steps && s.steps.length))) fail(`section "${s.h2}": a heading and text or steps`);
    if (s.image && (!/^\/assets\/[\w./-]+\.(jpg|png|webp)$/.test(s.image.src || '') || !s.image.alt)) fail(`section "${s.h2}": an image under /assets/ with alt text`);
  }
  if (g.shortcuts && g.shortcuts.some((r) => !Array.isArray(r) || r.length !== 2)) fail('shortcuts: [keys, what it does] pairs');
}

function body(g, app, L) {
  const sec = (s) => `<h2>${esc(s.h2)}</h2>
${(s.text || []).map((p) => `<p>${esc(p)}</p>`).join('\n')}
${s.steps ? `<ol>${s.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
${hasImage(s.image) ? `<figure class="shot"><img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}" loading="lazy"></figure>` : ''}
${s.tip ? `<p class="note"><b>${esc(L.t('seo.ui.guide.tip'))}</b> ${esc(s.tip)}</p>` : ''}`;
  const keys = g.shortcuts ? `<h2>${esc(L.t('seo.ui.guide.shortcuts'))}</h2>\n<div class="wrap"><table><thead><tr><th scope="col">${esc(L.t('seo.ui.guide.col_keys'))}</th><th scope="col">${esc(L.t('seo.ui.guide.col_what'))}</th></tr></thead><tbody>${g.shortcuts.map(([k, w]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(w)}</td></tr>`).join('')}</tbody></table></div>` : '';
  return `<p class="eyebrow">${esc(L.t('seo.ui.guide.eyebrow', { app: app.name }))}</p>
<h1>${esc(g.h1)}</h1>
<p class="lead">${esc(g.lead)}</p>
<p><a class="btn" href="/${esc(app.path)}">${esc(L.t('seo.ui.task.open', { app: app.name }))}</a></p>
${app.video ? `<div class="media">${videoLink(app, L)}</div>` : ''}
${g.sections.map(sec).join('\n')}
${keys}`;
}

export function guideJsonLd(g, app, url, site, L = ROOT_L) {
  const out = [
    { '@context': 'https://schema.org', '@type': 'TechArticle', headline: g.h1, description: g.description, url, about: { '@type': 'SoftwareApplication', name: app.name, url: `${site}/apps/${app.id}/` },
      author: { '@type': 'Organization', name: 'Slopographic', url: `${site}/` } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: L.t('seo.ui.crumb.home'), item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: app.name, item: `${site}/apps/${app.id}/` }, { '@type': 'ListItem', position: 3, name: g.crumb, item: url }] },
  ];
  const v = videoJsonLd(app, site, L);
  if (v) out.push(v);
  return out;
}

export function guidePages(apps, site, GUIDES, { TASKS = [], ROUNDUPS = [] } = {}, L = ROOT_L) {
  const seen = new Set();
  return GUIDES.map((g) => {
    const app = apps.find((a) => a.id === g.app);
    checkGuide(g, app);
    const dir = `${app.path}${g.slug}/`;
    if (seen.has(dir)) throw new Error(`guide ${g.app}/${g.slug}: listed twice`);
    seen.add(dir);
    const { body: b, toc } = withToc(body(g, app, L));
    const nav = appNav(app, { tasks: TASKS.filter((t) => t.app === g.app), roundups: ROUNDUPS.filter((r) => r.app === g.app), guides: GUIDES.filter((x) => x.app === g.app) }, `/${dir}`, L);
    return { key: `${g.app}/${g.slug}`, dir, url: `${site}/${dir}`, html: shell(docsLayout(nav, toc, b, L), L), app, guide: g };
  });
}
