// Task pages: one page per thing people search for that an app does ("bulk background remover", "merge PDF files"),
// written to /<app path><slug>/ with the landing pages' look (landing.mjs). The copy is in shared/seo/tasks/ (one file
// per family of apps, merged by index.mjs); this file checks it and draws the pages. Each page has the task's steps, its
// questions and answers, the app's picture and tutorial, an Open button that starts the app set up for the task
// (`query`), the app's other tasks and its landing page. write.mjs adds the head block and the sitemap entries.
// Every function takes the language last (L, a lang.mjs context; the root language when left out).
//   taskPages(apps, site, TASKS, { ROUNDUPS, GUIDES }, L) -> [{ key, dir, url, html, app, task }]
//   taskJsonLd(task, app, url, site, L) -> the page's JSON-LD (WebPage, BreadcrumbList, HowTo, FAQPage, VideoObject)
//   videoJsonLd(app, site, L) -> a VideoObject for an app's tutorial, or null
import { ROOT_L, esc, shell, shotFigure, videoLink, cardList, related, taglineOf } from './frame.mjs';
import { appNav, withToc, docsLayout } from './guide.mjs';
import { descLimits } from './head.mjs';

/** A question ends in its script's question mark: ? (Latin, Cyrillic…), ？ (Han, kana), ؟ (Arabic). */
const QUESTION = /[?？؟]$/;
/** The shortest lead and answer for a language: Han, kana and Hangul say more per character, so their minimum is
 *  scaled like their description limits (descLimits: 45 of Latin's 120 for zh and ja). */
const atLeast = (n, code) => Math.ceil(n * descLimits(code)[0] / descLimits('en')[0]);

/** Checks one task's copy; throws with the task's key on the first problem. */
export function checkTask(t, app, code = 'en') {
  const key = `${t.app}/${t.slug}`;
  const fail = (m) => { throw new Error(`task ${key}: ${m}`); };
  if (!app) fail('no such app in shared/apps.js');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.slug || '')) fail('slug must be lower-case words joined by hyphens');
  if (!t.h1 || t.h1.length > 80) fail('h1 missing or longer than 80 characters');
  if (!t.lead || t.lead.length < atLeast(60, code)) fail(`lead missing or shorter than ${atLeast(60, code)} characters`);
  if (!Array.isArray(t.steps) || t.steps.length < 3 || t.steps.length > 6) fail('3 to 6 steps');
  if (!Array.isArray(t.faq) || t.faq.length < 3) fail('at least 3 questions');
  for (const [q, a] of t.faq) if (!q || !QUESTION.test(q) || !a || a.length < atLeast(40, code)) fail(`question "${q}": a question mark and an answer of ${atLeast(40, code)}+ characters`);
  if (t.query && !/^[a-z0-9_-]+=[a-z0-9_.-]+(&[a-z0-9_-]+=[a-z0-9_.-]+)*$/i.test(t.query)) fail('query must be like key=value&key=value (plain words)');
  if (t.body && !Array.isArray(t.body)) fail('body is a list of paragraphs');
  if (t.image && (!/^\/assets\/[\w./-]+\.(jpg|png|webp)$/.test(t.image.src || '') || !t.image.alt)) fail('image: { src under /assets/, alt }');
}


export function videoJsonLd(app, site, L = ROOT_L) {
  const v = app.video;
  if (!v) return null;
  return { '@context': 'https://schema.org', '@type': 'VideoObject', name: v.title, description: `${app.name}: ${taglineOf(app, L)}`,
    thumbnailUrl: `${site}/assets/video/yt-${v.id}.jpg`, uploadDate: v.date, duration: v.duration,
    contentUrl: `https://www.youtube.com/watch?v=${v.id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}` };
}

/** The Open link: the app, set up for the task when the task has a query. */
const openHref = (app, t) => `/${app.path}${t.query ? `?${t.query}` : ''}`;

/** A task page's picture: the task's own (t.image: { src, alt }, a screenshot of that very result) or else the app's
 *  screenshot, and the app's video tutorial. Never the app's general demo clip, which shows other things. */
function taskMedia(t, app, L) {
  const pic = t.image ? `<figure class="shot"><img src="${esc(t.image.src)}" alt="${esc(t.image.alt)}" loading="lazy"></figure>` : shotFigure(app, L);
  const parts = [pic, videoLink(app, L)].filter(Boolean);
  return parts.length ? `<div class="media">${parts.join('')}</div>` : '';
}

function body(t, app, apps, siblings, L) {
  const steps = t.steps.map((s) => `<li>${esc(s)}</li>`).join('');
  const faq = t.faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n');
  const more = siblings.length ? `<h2>${esc(L.t('seo.ui.task.more', { app: app.name }))}</h2>\n<ul>${siblings.map((s) => `<li><a href="/${esc(app.path)}${esc(s.slug)}/">${esc(s.h1)}</a></li>`).join('')}</ul>` : '';
  return `<p class="eyebrow"><a href="/apps/${esc(app.id)}/">${esc(app.name)}</a> · ${esc(L.t('seo.ui.task.eyebrow'))}</p>
<h1>${esc(t.h1)}</h1>
<p class="lead">${esc(t.lead)}</p>
<p><a class="btn" href="${esc(openHref(app, t))}">${esc(t.cta || L.t('seo.ui.task.open', { app: app.name }))}</a></p>
${taskMedia(t, app, L)}
<h2>${esc(L.t('seo.ui.task.how'))}</h2>
<ol>${steps}</ol>
${(t.body || []).map((p) => `<p>${esc(p)}</p>`).join('\n')}
<p class="note">${esc(L.t('seo.ui.task.local', { app: app.name }))}</p>
<h2>${esc(L.t('seo.ui.task.questions'))}</h2>
${faq}
${more}
<h2>${esc(L.t('seo.ui.app.related'))}</h2>
${cardList(related(app, apps).slice(0, 3), L)}`;
}

export function taskJsonLd(t, app, url, site, L = ROOT_L) {
  const landing = `${site}/apps/${app.id}/`;
  const out = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: t.title, description: t.description, url, isPartOf: { '@type': 'WebSite', name: 'Slopographic', url: `${site}/` } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: L.t('seo.ui.crumb.home'), item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: app.name, item: landing },
      { '@type': 'ListItem', position: 3, name: t.crumb || t.h1, item: url }] },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: t.h1, description: t.lead, tool: { '@type': 'HowToTool', name: app.name },
      step: t.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: t.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const v = videoJsonLd(app, site, L);
  if (v) out.push(v);
  return out;
}

export function taskPages(apps, site, TASKS, { ROUNDUPS = [], GUIDES = [] } = {}, L = ROOT_L) {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const seen = new Set();
  return TASKS.map((t) => {
    const app = byId.get(t.app);
    checkTask(t, app, L.code);
    const dir = `${app.path}${t.slug}/`;
    if (seen.has(dir)) throw new Error(`task ${t.app}/${t.slug}: listed twice`);
    seen.add(dir);
    const siblings = TASKS.filter((s) => s.app === t.app && s.slug !== t.slug);
    const { body: b, toc } = withToc(body(t, app, apps, siblings, L));
    const nav = appNav(app, { tasks: TASKS.filter((s) => s.app === t.app), roundups: ROUNDUPS.filter((r) => r.app === t.app), guides: GUIDES.filter((g) => g.app === t.app) }, `/${dir}`, L);
    return { key: `${t.app}/${t.slug}`, dir, url: `${site}/${dir}`, html: shell(docsLayout(nav, toc, b, L), L), app, task: t };
  });
}

/** The hub of every task page, grouped by app in registry order: /all-tools/. Every landing and task page links it. */
export function hubPage(apps, site, TASKS, L = ROOT_L) {
  const groups = apps.map((a) => ({ app: a, tasks: TASKS.filter((t) => t.app === a.id) })).filter((g) => g.tasks.length);
  const count = groups.reduce((n, g) => n + g.tasks.length, 0);
  const body = `<p class="eyebrow">${esc(L.t('seo.ui.hub.eyebrow'))}</p>
<h1>${esc(L.t('seo.ui.hub.h1', { n: count }))}</h1>
<p class="lead">${esc(L.t('seo.ui.hub.lead'))}</p>
${groups.map((g) => `<h2><a href="/apps/${esc(g.app.id)}/">${esc(g.app.name)}</a></h2>\n<ul>${g.tasks.map((t) => `<li><a href="/${esc(g.app.path)}${esc(t.slug)}/">${esc(t.h1)}</a></li>`).join('')}</ul>`).join('\n')}`;
  return { key: 'all-tools', dir: 'all-tools/', url: `${site}/all-tools/`, html: shell(body, L), count };
}
