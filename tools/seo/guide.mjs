// The guide around each app: a sidebar on every page about one app (its landing page, its guides, its task pages and its
// comparisons) that lists all of them, and an "On this page" list of the page's sections. Built from the same data as
// the pages themselves (the registry, shared/seo/tasks, shared/seo/guides, shared/seo/roundups), so a new page shows up
// in its app's sidebar by itself. On a phone the sidebar folds into an "In this guide" menu at the top.
//   appNav(app, { tasks, guides, roundups }, current, L) -> the sidebar HTML (current: the href of the page shown; L: the
//                                                          language, lang.mjs context, the root one when left out)
//   withToc(body) -> { body, toc }   ids added to the body's <h2>s, and the list of them
//   docsLayout(nav, toc, body, L) -> the page's main area: sidebar and content side by side
import { esc, ROOT_L } from './frame.mjs';

const slugify = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 's';

export function withToc(body) {
  const toc = [], used = new Set();
  const out = body.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (m, attrs = '', inner) => {
    let id = (/\sid="([^"]+)"/.exec(attrs) || [])[1];
    if (!id) { id = slugify(inner); let n = 2; while (used.has(id)) id = `${slugify(inner)}-${n++}`; attrs = `${attrs} id="${id}"`; }
    used.add(id);
    toc.push({ id, text: inner.replace(/<[^>]+>/g, '').trim() });
    return `<h2${attrs}>${inner}</h2>`;
  });
  return { body: out, toc };
}

export function appNav(app, { tasks = [], guides = [], roundups = [] } = {}, current = '', L = ROOT_L) {
  const link = (href, text) => `<li><a href="${esc(href)}"${href === current ? ' aria-current="page"' : ''}>${esc(text)}</a></li>`;
  const group = (title, items) => (items.length ? `<p class="l-side-h">${esc(title)}</p><ul>${items.join('')}</ul>` : '');
  const v = app.video;
  return `<nav class="l-side-nav" aria-label="${esc(L.t('seo.ui.side.label', { app: app.name }))}">
<p class="l-side-app"><a href="/apps/${esc(app.id)}/"${`/apps/${app.id}/` === current ? ' aria-current="page"' : ''}>${esc(app.name)}</a></p>
<p><a class="btn l-side-open" href="/${esc(app.path)}">${esc(L.t('seo.ui.task.open', { app: app.name }))}</a></p>
${group(L.t('seo.ui.side.guides'), [...guides.map((g) => link(`/${app.path}${g.slug}/`, g.crumb || g.h1)), ...(v ? [`<li><a href="https://www.youtube.com/watch?v=${esc(v.id)}" rel="noopener">${esc(L.t('seo.ui.video.tutorial'))}</a></li>`] : [])])}
${group(L.t('seo.ui.side.how_to'), tasks.map((t) => link(`/${app.path}${t.slug}/`, t.crumb || t.h1)))}
${group(L.t('seo.ui.side.compared'), roundups.map((r) => link(`/best/${r.slug}/`, r.crumb || r.h1)))}
</nav>`;
}

/** The sidebar (the app's guide, then this page's sections) beside the content; a <details> menu on narrow screens.
 * It starts folded, so a phone draws it folded from its first paint; the script right after it opens it on a wide screen
 * (folding it on phones after the page had drawn it open moved everything below it: CLS 0.55 on a slow phone). */
export function docsLayout(nav, toc, body, L = ROOT_L) {
  const onPage = toc.length > 2 ? `<p class="l-side-h">${esc(L.t('seo.ui.side.on_page'))}</p><ul class="l-toc">${toc.map((t) => `<li><a href="#${esc(t.id)}">${esc(t.text)}</a></li>`).join('')}</ul>` : '';
  return `<div class="l-docs">
<aside class="l-side"><details class="l-side-fold"><summary>${esc(L.t('seo.ui.side.fold'))}</summary>
${nav}
${onPage}
</details><script>if (!matchMedia('(max-width: 899px)').matches) document.currentScript.previousElementSibling.open = true;</script></aside>
<div class="l-docs-main">
${body}
</div>
</div>`;
}
