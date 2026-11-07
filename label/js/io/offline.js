/* SlopLabel — io/offline: "Download app (offline .html)". Inlines every stylesheet and script listed in
 * index.html (app, shared SlopUI/apps/hub, vendored bwip-js) into one file, and embeds the sources as
 * JSON in <script type="application/json" id="app-src"> so the offline copy can rebuild itself
 * byte-for-byte. All String.replace calls use function replacers, so "$&" / "$$" in code survive. */
'use strict';

const OFFLINE_INLINE_ONLY = 150000; // big files whose inline copy is exact are not duplicated in the JSON
const LINK_RE = /<link rel="stylesheet" href="([^"]+)">/g;
const SCRIPT_RE = /<script src="([^"]+)"(?: data-src="[^"]*")?><\/script>/g;
/* The string tables (label/i18n, shared/i18n): the copy runs in English, so i18n/index.js is followed by the English parts
   and the shared words (shared/i18n/ui/en.js); i18n.js fetches nothing in an offline copy. */
const I18N_UI = '../shared/i18n/ui/en.js';
const i18nParts = (indexJs) => { const m = /parts:\s*\[([^\]]*)\]/.exec(String(indexJs || '')); return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : []; };
/** The shared components' English parts (UI_PARTS in i18n.js), which i18n.js would otherwise fetch. */
const uiParts = (i18nJs) => { const m = /\/\*ui-parts\*\/\{\s*parts:\s*\[([^\]]*)\]/.exec(String(i18nJs || '')); return m ? m[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean).map((p) => '../shared/i18n/ui/en/' + p + '.js') : []; };
const i18nExtra = (sources) => (sources['i18n/index.js'] == null ? [] : [I18N_UI, ...uiParts(sources['../shared/i18n/i18n.js']), ...i18nParts(sources['i18n/index.js']).map((p) => 'i18n/en/' + p + '.js')]);
function escInlineScript(code) { return String(code).replace(/<\/(script)/gi, (m, w) => '<\\/' + w).replace(/<!--/g, () => '<\\!--'); }
function escInlineStyle(css) { return String(css).replace(/<\/(style)/gi, (m, w) => '<\\/' + w); }
function escJSONForHTML(json) { return json.replace(/</g, () => '\\u003c').replace(/\u2028/g, () => '\\u2028').replace(/\u2029/g, () => '\\u2029'); }
/** Local stylesheet/script paths referenced by index.html, in document order. */
function offlineManifest(indexHTML) {
  const out = [];
  String(indexHTML).replace(/<link rel="stylesheet" href="([^"]+)">|<script src="([^"]+)"(?: data-src="[^"]*")?><\/script>/g, (m, css, js) => { const p = css || js; if (!/^[a-z]+:|^\/\//i.test(p)) out.push(p); return m; });
  return out;
}
/** sources: { 'index.html': text, '<path>': text, … } → single-file HTML string. */
function buildOfflineHTML(sources) {
  const index = sources['index.html'];
  if (index == null) throw new Error('index.html source missing');
  const extra = i18nExtra(sources), need = offlineManifest(index).concat(extra);
  for (const p of need) if (sources[p] == null) throw new Error('Missing source ' + p);
  let html = index.replace(LINK_RE, (m, href) => (sources[href] == null ? m : `<style data-src="${href}">${escInlineStyle(sources[href])}</style>`));
  const inline = (src) => `<script data-src="${src}">${escInlineScript(sources[src])}</script>`;
  html = html.replace(SCRIPT_RE, (m, src) => (sources[src] == null ? m : inline(src) + (src === 'i18n/index.js' ? extra.map(inline).join('') : '')));
  // first in <head>, so the string tables (shared/i18n) see an offline copy and fetch nothing
  const META = '<meta name="sloplabel-build" content="offline">';
  html = /<head>/i.test(html) ? html.replace(/<head>/i, (m) => m + '\n  ' + META) : html.replace(/<meta charset="utf-8">/i, (m) => m + '\n  ' + META);
  const files = {};
  for (const p of ['index.html', ...need]) {
    const s = sources[p];
    const inlineExact = p !== 'index.html' && s.length > OFFLINE_INLINE_ONLY && (/\.css$/.test(p) ? escInlineStyle(s) : escInlineScript(s)) === s;
    files[p] = inlineExact ? null : s;
  }
  const blob = escJSONForHTML(JSON.stringify({ app: 'sloplabel', v: 1, files }));
  const tag = `<script type="application/json" id="app-src">${blob}</script>\n`;
  // insert before the page's own </body>: the last one, since inlined code may contain the text "</body>" too
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
/** Read the embedded sources back out of a built page (a Document or HTML string). */
function extractOfflineSources(docOrHTML) {
  const d = typeof docOrHTML === 'string' ? new DOMParser().parseFromString(docOrHTML, 'text/html') : docOrHTML;
  const el = d.getElementById('app-src');
  if (!el) return null;
  const { files } = JSON.parse(el.textContent);
  const out = {};
  for (const p in files) {
    if (files[p] != null) { out[p] = files[p]; continue; }
    const node = [...d.querySelectorAll('[data-src]')].find((n) => n.getAttribute('data-src') === p);
    if (!node) throw new Error('Embedded source missing: ' + p);
    out[p] = node.textContent;
  }
  return out;
}
const isOfflineBuild = () => !!document.querySelector('meta[name="sloplabel-build"]');
/** Collect sources: from the embedded JSON when running offline, otherwise fetch them next to index.html. */
async function collectOfflineSources() {
  if (isOfflineBuild()) { const s = extractOfflineSources(document); if (s) return s; }
  const base = new URL('./', location.href);
  const get = async (p) => { const r = await fetch(new URL(p, base), { cache: 'no-cache' }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.text(); };
  const sources = { 'index.html': await get('index.html') };
  for (const p of offlineManifest(sources['index.html'])) sources[p] = await get(p);
  for (const p of i18nExtra(sources)) sources[p] = await get(p);
  return sources;
}
async function downloadOfflineApp() {
  const html = buildOfflineHTML(await collectOfflineSources());
  SlopUI.download(new Blob([html], { type: 'text/html' }), 'sloplabel.html');
  return html.length;
}
