/* Slop Code: builds the srcdoc for the run preview. The preview is an iframe with sandbox="allow-scripts" (no
 * same-origin, so no storage and no parent access). Its document carries a Content-Security-Policy with
 * connect-src 'none', so nothing can reach the network. Project CSS, JavaScript and images are inlined from
 * the Slop Drive folder, and a console hook posts console output back to the app. */

export const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; "
  + "img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src 'none'; "
  + "frame-src 'none'; form-action 'none'; base-uri 'none'";

/** Runs inside the preview. Sends console output and uncaught errors to the parent app. */
function consoleHook() {
  const post = (level, args) => {
    const text = args.map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || a.message;
      try { return JSON.stringify(a) ?? String(a); } catch (e) { return String(a); }
    }).join(' ');
    parent.postMessage({ slopCode: 'console', level, text }, '*');
  };
  ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
    const orig = console[level];
    console[level] = function () { post(level, [].slice.call(arguments)); if (orig) orig.apply(console, arguments); };
  });
  addEventListener('error', (e) => post('error', [e.message + ' (line ' + e.lineno + ')']));
  addEventListener('unhandledrejection', (e) => post('error', ['Unhandled promise rejection: ' + ((e.reason && e.reason.message) || e.reason)]));
}
const HOOK = '<script>(' + consoleHook.toString() + ')();</script>';
const SAFE = (s) => String(s).replace(/<\/(script|style)/gi, '<\\/$1');

/** A preview page for a JavaScript file. */
export function scriptPreview(js, run) {
  return `<!doctype html>\n<!-- run ${run} -->\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">${HOOK}</head>`
    + `<body><script>\n${SAFE(js)}\n</script></body></html>\n`;
}

/** Local references: plain relative paths, no scheme, not a data: URL, not a fragment. */
const localPath = (u) => {
  if (!u || /^([a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(u.trim())) return null;
  return u.trim().split(/[?#]/)[0].replace(/^\.?\//, '');
};
const blobToDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

/**
 * A preview page for an HTML file. `files` maps relative paths to { text, blob } (open editor text wins).
 * Stylesheets and scripts become inline; images and media become data: URLs. Anything else is left as written,
 * and the CSP keeps it from loading.
 */
export async function htmlPreview(html, files, run) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const get = (u) => { const p = localPath(u); return p && files.get(p); };
  for (const link of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const f = get(link.getAttribute('href'));
    if (!f) continue;
    const style = doc.createElement('style');
    style.textContent = SAFE(await f.text());
    link.replaceWith(style);
  }
  for (const s of doc.querySelectorAll('script[src]')) {
    const f = get(s.getAttribute('src'));
    if (!f) continue;
    s.removeAttribute('src');
    s.textContent = SAFE(await f.text());
  }
  for (const el of doc.querySelectorAll('img[src], source[src], video[poster], audio[src], video[src]')) {
    const attr = el.hasAttribute('src') ? 'src' : 'poster';
    const f = get(el.getAttribute(attr));
    if (f && f.blob) el.setAttribute(attr, await blobToDataUrl(f.blob));
  }
  doc.head.prepend(...parseHead(`<meta http-equiv="Content-Security-Policy" content="${CSP}">${HOOK}`));
  return `<!doctype html>\n<!-- run ${run} -->\n${doc.documentElement.outerHTML}\n`;
}

/** Nodes for the head (the policy first, then the console hook). */
function parseHead(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup;
  return [...tpl.content.childNodes];
}
