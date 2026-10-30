// The site's page frame for content pages (landing, task, hub, guide, round-up and how-it-works pages) and the pieces
// they share, in one language (L, a context from lang.mjs; the root language when left out): the same look as the apps'
// About pages (shared/landing/landing.css, which follows the chosen theme), the profile, theme and consent scripts, and
// the shell (Theme and Apps in the header). siteTop() and siteFoot() are also written into hand-made pages between
// <!-- site:top --> and <!-- site:foot --> markers (write.mjs), so every page has the same header and footer.
// <html> carries the page's language (lang, dir) and data-lang-page: the language switcher then goes to the same page in
// the language picked (its <link rel="alternate" hreflang>), and the shared chrome reads in the page's language
// (shared/i18n/i18n.js). Used by landing.mjs, tasks.mjs, roundups.mjs, guides.mjs and write.mjs.
import { isPage } from './site.mjs';
import { context, ROOT_LANG } from './lang.mjs';
import { footNav } from './footnav.mjs';
import { existsSync } from 'node:fs';
import { jpegSize } from './jpeg-size.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT_L = context(ROOT_LANG);
/** Pictures and clips are found by name: assets/shots/<id>.jpg, assets/clips/<id>.webm and .mp4. */
const hasFile = (rel) => existsSync(path.join(ROOT, rel));
/** width and height attributes from a picture's own size (assets/shots come in many sizes), so its box is right before it loads. */
const sizeAttrs = (rel, w, h) => { const s = jpegSize(path.join(ROOT, rel)) || (w ? { width: w, height: h } : null); return s ? ` width="${s.width}" height="${s.height}"` : ''; };
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The brand profile's tone (set at build time, like shared/theme/theme.js): a plain build says Available / Beta / Preview,
// the same words as its homepage (home/sections.js, the i18n keys plain.status.*).
const TONE = /*profile:tone*/'playful';
export const statusWords = (L = ROOT_L) => Object.fromEntries(['live', 'beta', 'building'].map((s) => [s, L.t(`seo.ui.${TONE === 'plain' ? 'status_plain' : 'status'}.${s}`)]));
/** The status words in the root language. */
export const STATUS = statusWords();
export const statusOf = (app, L = ROOT_L) => statusWords(L)[app.status || 'live'];
/** Readable names for the MIME patterns in an app's `accepts`: a format name as it is, or a key (k:) for one with words. */
const TYPE = {
  '*': 'k:any_file', 'image/*': 'k:any_image', 'video/*': 'k:video', 'audio/*': 'k:audio', 'text/*': 'k:text',
  'application/pdf': 'PDF', 'text/csv': 'CSV', 'text/tab-separated-values': 'TSV', 'text/plain': 'k:plain_text',
  'text/markdown': 'Markdown', 'text/html': 'HTML', '.html': 'HTML', '.htm': 'HTML', 'application/json': 'JSON',
  'text/vcard': 'vCard', 'text/x-vcard': 'vCard', 'image/svg+xml': 'SVG', 'image/jpeg': 'JPEG', 'image/png': 'PNG',
  'image/webp': 'WebP', 'image/tiff': 'TIFF', 'image/vnd.adobe.photoshop': 'Photoshop (PSD)',
  'application/x-openraster': 'OpenRaster', 'application/illustrator': 'Illustrator (.ai)',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel (.xlsx)',
  'application/vnd.ms-excel': 'Excel (.xls)', 'application/vnd.oasis.opendocument.spreadsheet': 'k:ods',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint (.pptx)',
  'application/vnd.oasis.opendocument.presentation': 'k:odp',
  'message/rfc822': 'k:email', '.eml': 'k:email', 'model/gltf-binary': 'GLB', 'model/obj': 'OBJ', 'model/gltf+json': 'glTF', 'model/stl': 'STL', 'model/3mf': '3MF',
  'model/vnd.collada+xml': 'DAE (Collada)', 'application/x-ply': 'PLY', 'application/x-fbx': 'FBX',
  'audio/mpeg': 'MP3', 'audio/wav': 'WAV', 'audio/ogg': 'Ogg', 'audio/flac': 'FLAC', 'audio/mp4': 'M4A',
  'audio/aac': 'AAC', 'audio/opus': 'Opus', 'text/css': 'CSS', 'text/javascript': 'JavaScript',
  'application/javascript': 'JavaScript', 'text/x-python': 'Python', 'text/typescript': 'TypeScript',
};
const typeName = (t, L) => { const v = TYPE[t] || t; return v.startsWith('k:') ? L.t('seo.ui.type.' + v.slice(2)) : v; };
export const fileTypeList = (app, L = ROOT_L) => [...new Set((app.accepts || []).map((t) => typeName(t, L)))];
export const fileTypes = (app, L = ROOT_L) => fileTypeList(app, L).join(', ') || L.t('seo.ui.type.none');

/** Related apps: the most shared file types first, then the same group. Deterministic, registry order breaks ties. */
export function related(app, apps) {
  const mine = new Set(fileTypeList(app));
  const score = (b) => fileTypeList(b).filter((l) => mine.has(l)).length * 2 + (b.group && b.group === app.group ? 1 : 0);
  return apps.filter((b) => isPage(b) && b.id !== app.id)
    .map((b, i) => ({ b, s: score(b), i }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .slice(0, 6).map((x) => x.b);
}

const NAV = [['/', 'home'], ['/all-tools/', 'all_tools'], ['/compare/', 'all_apps'], ['/best/', 'comparisons'], ['/how-it-works/', 'how'], ['/settings/', 'settings']];
const nav = (L) => NAV.map(([h, k]) => `<a href="${h}">${esc(L.t('seo.ui.nav.' + k))}</a>`).join('');
export const SITE_HEAD = ['<script src="/shared/profile/profile.js"></script>', '<script src="/shared/theme/theme.js" data-app="site"></script>',
  '<script src="/shared/consent/config.js"></script>', '<script src="/shared/consent/state.js"></script>', '<script src="/shared/consent/consent-mode.js"></script>',
  '<script src="/shared/consent/banner.js"></script>', '<link rel="icon" href="/favicon.ico" type="image/x-icon">', '<link rel="stylesheet" href="/shared/landing/landing.css">',
  '<link rel="stylesheet" href="/shared/footnav/footnav.css">'];
// the slot keeps the room the shell's header buttons take (shell/header.js fills it), so nothing moves when they come
export const siteTop = (L = ROOT_L) => `<header class="l-top"><a class="l-brand" href="/"><span class="l-brand-dot" aria-hidden="true"></span>Slopographic</a><nav aria-label="${esc(L.t('seo.ui.nav.site'))}">${nav(L)}</nav><div class="sh-hdr-slot"></div></header>`;
export const siteFoot = (L = ROOT_L) => `<footer class="l-foot">${footNav(L)}<div class="l-foot-links">${nav(L)}<a href="https://github.com/slopographic/apps" rel="noopener">${esc(L.t('seo.ui.foot.source'))}</a></div><p class="l-fine">${esc(L.t('seo.ui.foot.fine'))}</p><p class="l-fine l-made">${esc(L.t('seo.ui.foot.made'))}</p></footer>`;
/** <html> of a page in one language: lang, dir for a right-to-left one, and the page language for the switcher. */
export const htmlTag = (L = ROOT_L) => `<html lang="${L.code}"${L.dir === 'rtl' ? ' dir="rtl"' : ''} data-lang-page="${L.code}">`;
export function shell(body, L = ROOT_L) {
  return `<!doctype html>
${htmlTag(L)}
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${SITE_HEAD.join('\n  ')}
</head>
<body>
<div class="l-wrap">
${siteTop(L)}
<main class="l-doc">
${body}
</main>
${siteFoot(L)}
</div>
<script src="/shell/shell.js"></script>
</body>
</html>
`;
}

const thumb = (id) => (hasFile(`assets/shots/${id}.jpg`) ? `<img class="thumb" src="/assets/shots/${esc(id)}.jpg" alt="" width="220" height="137" loading="lazy">` : '');
/** An app's one-line tagline in a language: the registry's in English, else seo.reg.<id>.tagline. */
export const taglineOf = (b, L = ROOT_L) => (L.code === 'en' ? b.tagline : L.t(`seo.reg.${b.id}.tagline`));
export const cardList = (items, L = ROOT_L) => `<ul class="cards">${items.map((b) => `<li>${thumb(b.id)}<a href="/apps/${esc(b.id)}/">${esc(b.name)}</a><br><span class="note">${esc(statusOf(b, L))}</span><br>${esc(taglineOf(b, L))}</li>`).join('')}</ul>`;

/** The app's YouTube tutorial (shared/apps.js `video`) as a card: its thumbnail is kept in assets/video, so the page
 *  loads nothing from YouTube. '' without one. */
const lengthWords = (iso, L) => {
  const m = /PT(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '') || [], n = Math.max(1, Math.round((Number(m[1] || 0) * 60 + Number(m[2] || 0)) / 60));
  return n >= 2 && n <= 5 ? L.t(`seo.ui.video.minutes_${n}`) : L.t('seo.ui.video.minutes', { n });
};
export function videoLink(app, L = ROOT_L) {
  const v = app.video;
  return v ? `<a class="demo" href="https://www.youtube.com/watch?v=${esc(v.id)}" rel="noopener" data-slop-video="${esc(v.id)}" data-slop-video-title="${esc(v.title)}"><img src="/assets/video/yt-${esc(v.id)}.jpg" alt="" width="480" height="360" loading="lazy"><span><b>${esc(L.t('seo.ui.video.watch', { title: v.title }))}</b><br>${esc(L.t('seo.ui.video.on_youtube', { length: lengthWords(v.duration, L) }))}</span></a>` : '';
}
/** The app's screenshot as a figure (assets/shots/<id>.jpg), or '' when there is none. */
export const shotFigure = (app, L = ROOT_L) => (hasFile(`assets/shots/${app.id}.jpg`) ? `<figure class="shot"><img src="/assets/shots/${esc(app.id)}.jpg" alt="${esc(L.t('seo.ui.media.shot_alt', { app: app.name }))}"${sizeAttrs(`assets/shots/${app.id}.jpg`, 1280, 800)} loading="lazy"></figure>` : '');
/** The picture, the clip and the YouTube demo of one app, when the files exist. */
export function mediaBlock(app, L = ROOT_L) {
  const id = app.id, out = [];
  const clip = hasFile(`assets/clips/${id}.mp4`);
  if (!clip && shotFigure(app, L)) out.push(shotFigure(app, L));
  if (clip) {
    // the poster's size: without it the video is 300 x 150 until the poster loads, and what follows moves
    const poster = hasFile(`assets/shots/${id}.jpg`) ? ` poster="/assets/shots/${esc(id)}.jpg"${sizeAttrs(`assets/shots/${id}.jpg`)}` : '';
    out.push(`<video class="clip" controls preload="none" playsinline${poster}><source src="/assets/clips/${esc(id)}.webm" type="video/webm"><source src="/assets/clips/${esc(id)}.mp4" type="video/mp4">${esc(L.t('seo.ui.media.no_video'))}</video>`);
  }
  if (app.video) out.push(videoLink(app, L));
  return out.length ? `<div class="media">${out.join('')}</div>` : '';
}
