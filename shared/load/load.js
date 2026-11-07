/* SlopLoad: the one loader for scripts and stylesheets an app page needs later, not for its first view. Classic script,
 * no dependencies; load it before the app's own scripts. See shared/load/HANDOFF.md for the page pattern.
 *
 * A page puts what its first view does not need inside a <template>: the browser does not run or fetch anything in a
 * template, crawlers and archives still see the HTML, and the service worker's precache list and the offline build read
 * the tags as they read any other (tools/pwa-precache.mjs, shared/offline/build.js).
 *   <template id="pdf-later" data-load="paint"> <script src="js/x.js"></script> <link rel="stylesheet" href="x.css"> </template>
 * data-load="paint": loaded right after the first paint. "idle": once the page has loaded and the browser is idle.
 * No data-load: only when the page asks, with SlopLoad.group(id).
 *
 * window.SlopLoad:
 *   script(src, { module }) -> Promise   one script, once. A relative src is a site-root path ('vendor/x.js'); a script
 *                                        the page already has (same URL) counts as loaded
 *   scripts(list) -> Promise             several, fetched side by side and run in list order, each once
 *   css(href) -> Promise                 a stylesheet, once (site-root path when relative)
 *   group(id) -> Promise                 the template's scripts, stylesheets and inline scripts, in their order, once
 *   ready(id) -> Promise                 the same promise, without starting the load (it starts at its data-load time)
 *   loaded(id) -> boolean                the group has finished
 *   url(path) -> string                  an absolute URL: a relative path is read from the site root
 *   root                                 the site root (from this script's own URL)
 * A failed script rejects its promise and can be asked for again; the rest of a group still runs. */
(function (root) {
  'use strict';
  if (root.SlopLoad) return;
  const doc = root.document;
  const SELF = (doc.currentScript && doc.currentScript.src) || '';
  // the site root; a page with no usable base (an offline copy run from a blob: or file: URL) reads paths from the page
  const ROOT = (() => { try { return SELF ? new URL('../../', SELF).href : new URL('/', root.location.href).href; } catch (e) { return doc.baseURI; } })();
  const files = new Map(), groups = new Map(), done = new Set();

  const url = (p) => { try { return new URL(p, ROOT).href; } catch (e) { return p; } };
  const inPage = (sel, prop, abs) => Array.from(doc.querySelectorAll(sel)).some((el) => el[prop] === abs);

  /** Adds one element and resolves when it has loaded. abs is already absolute. */
  function add(abs, make) {
    if (!files.has(abs)) {
      const p = new Promise((res, rej) => {
        const el = make();
        el.onload = () => res(el);
        el.onerror = () => { files.delete(abs); el.remove(); rej(new Error('Could not load ' + abs)); };   // gone, so it can be asked for again
        doc.head.append(el);
      });
      p.catch(() => {});
      files.set(abs, p);
    }
    return files.get(abs);
  }
  function scriptAbs(abs, opts) {
    if (!files.has(abs) && inPage('script[src]', 'src', abs)) files.set(abs, Promise.resolve());
    return add(abs, () => {
      const s = doc.createElement('script');
      if (opts && opts.module) s.type = 'module'; else s.async = false;   // classic scripts run in the order they were added
      s.src = abs;
      return s;
    });
  }
  function cssAbs(abs) {
    if (!files.has(abs) && inPage('link[rel="stylesheet"]', 'href', abs)) files.set(abs, Promise.resolve());
    return add(abs, () => { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = abs; return l; });
  }
  const script = (src, opts) => scriptAbs(url(src), opts);
  const scripts = (list) => Promise.all(list.map((s) => script(s)));
  const css = (href) => cssAbs(url(href));

  /** Runs a template's contents in order: script and stylesheet files are fetched side by side, scripts run in order,
   *  an inline script runs once every script before it has. */
  async function run(tpl) {
    const base = doc.baseURI, waits = [];
    let before = [];
    for (const el of Array.from(tpl.content.children)) {
      const tag = el.tagName;
      if (tag === 'SCRIPT' && el.getAttribute('src')) {
        const p = scriptAbs(new URL(el.getAttribute('src'), base).href, { module: el.type === 'module' });
        if (el.type !== 'module') before.push(p);
        waits.push(p);
      } else if (tag === 'SCRIPT') {
        await Promise.allSettled(before); before = [];
        const s = doc.createElement('script'); s.textContent = el.textContent; doc.head.append(s);
      } else if (tag === 'LINK' && /\bstylesheet\b/.test(el.rel)) {
        waits.push(cssAbs(new URL(el.getAttribute('href'), base).href));
      } else if (tag === 'STYLE') doc.head.append(el.cloneNode(true));   // the offline build inlines stylesheets
    }
    const r = await Promise.allSettled(waits), bad = r.find((x) => x.status === 'rejected');
    if (bad) console.warn('SlopLoad:', bad.reason && bad.reason.message);
  }
  function entry(id) {
    if (!groups.has(id)) {
      let start;
      const p = new Promise((res) => { start = res; }).then(() => {
        const tpl = doc.getElementById(id);
        return tpl && tpl.content ? run(tpl) : undefined;
      }).then(() => { done.add(id); });
      groups.set(id, { p, start, started: false });
    }
    return groups.get(id);
  }
  function group(id) {
    const g = entry(id);
    if (!g.started) { g.started = true; g.start(); }
    return g.p;
  }
  const ready = (id) => entry(id).p;

  /* data-load times: "paint" once the browser reports its first paint (the Paint Timing entry), "idle" after load, when
     idle. Where paint entries are missing, a frame and then a task; a hidden tab paints nothing, so it waits for load. */
  function afterPaint(fn) {
    let ran = false;
    const go = () => { if (!ran) { ran = true; setTimeout(fn, 0); } };
    const painted = () => root.performance && performance.getEntriesByType && performance.getEntriesByType('paint').length > 0;
    if (painted()) return go();
    try {
      const po = new PerformanceObserver(() => { po.disconnect(); go(); });
      po.observe({ type: 'paint', buffered: true });
      if (!(PerformanceObserver.supportedEntryTypes || []).includes('paint')) throw new Error('no paint entries');
    } catch (e) {
      if (root.requestAnimationFrame) root.requestAnimationFrame(() => setTimeout(go, 0));
    }
    // a hidden tab (or a frame that is not shown) paints nothing: it goes once the page has loaded
    const late = () => setTimeout(go, doc.visibilityState === 'hidden' ? 0 : 500);
    if (doc.readyState === 'complete') late(); else root.addEventListener('load', late, { once: true });
  }
  function whenIdle(fn) {
    const idle = () => (root.requestIdleCallback ? root.requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
    if (doc.readyState === 'complete') idle(); else root.addEventListener('load', idle, { once: true });
  }
  function schedule() {
    for (const t of Array.from(doc.querySelectorAll('template[data-load]'))) {
      if (!t.id) continue;
      const when = t.dataset.load;
      if (when === 'paint') afterPaint(() => group(t.id));
      else if (when === 'idle') whenIdle(() => group(t.id));
    }
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', schedule, { once: true }); else schedule();

  root.SlopLoad = { script, scripts, css, group, ready, loaded: (id) => done.has(id), url, root: ROOT };
})(window);
