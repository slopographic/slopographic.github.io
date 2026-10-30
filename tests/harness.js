/* Slopographic test harness: a tiny describe/it/expect that runs in the browser.
 * Each tests/<app>.test.html loads the app's code plus this file, registers tests,
 * then calls SlopTest.run(). tests/run.mjs opens every page in headless Chromium,
 * reads window.__SLOPTEST__ and prints a report. Open a test page in any browser to
 * see the results on screen too. It also loads the brand facts beside it (tests/brand-facts.js: window.BRAND_FACTS, the
 * build's profile switches), before the page's own scripts, so every page can read them; and in a build that starts in
 * another language it opens the apps in English, as a visitor who chose English (SlopTest.english), so the checks read the
 * copy they were written against (tests/english.js; tests/run.mjs stores it before the page loads). A page about the start
 * language says <meta name="slop-test-lang" content="default">. */
(function () {
  const me = document.currentScript, at = (f) => me && me.src.replace(/harness\.js(\?.*)?$/, f), facts = at('brand-facts.js');
  const lang = '<script>if (!document.querySelector(\'meta[name="slop-test-lang"][content="default"]\')) SlopTest.english();<\/script>';
  if (facts && !window.BRAND_FACTS && document.readyState === 'loading') document.write(`<script src="${facts}"><\/script><script src="${at('english.js')}"><\/script>${lang}`);
})();
(function () {
  'use strict';
  const suites = [];
  let current = null;
  // Pages that run side by side (tests/run.mjs --jobs) are slower: the runner sets window.__SLOPTEST_SCALE__ = N before the
  // page loads (not in the URL, which some tests read) and every timeout grows N times.
  const SCALE = Math.max(1, Number(window.__SLOPTEST_SCALE__) || 1);
  function describe(name, fn) { const s = { name, tests: [], before: [], after: [] }; suites.push(s); const prev = current; current = s; try { fn(); } finally { current = prev; } }
  function it(name, fn, { timeout = 15000 } = {}) { (current || describe('(root)', () => {}) || suites[suites.length - 1]).tests.push({ name, fn, timeout }); }
  function beforeEach(fn) { current.before.push(fn); }
  function afterEach(fn) { current.after.push(fn); }
  const fmt = (v) => { try { return typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x) ? String(x) : x)); } catch (e) { return String(v); } };
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  class AssertionError extends Error {}
  function expect(actual) {
    const fail = (msg) => { throw new AssertionError(msg); };
    const api = {
      toBe: (e) => { if (actual !== e) fail(`expected ${fmt(actual)} to be ${fmt(e)}`); },
      toEqual: (e) => { if (!deepEqual(actual, e)) fail(`expected ${fmt(actual)} to equal ${fmt(e)}`); },
      toBeTruthy: () => { if (!actual) fail(`expected ${fmt(actual)} to be truthy`); },
      toBeFalsy: () => { if (actual) fail(`expected ${fmt(actual)} to be falsy`); },
      toBeCloseTo: (e, eps = 1e-6) => { if (Math.abs(actual - e) > eps) fail(`expected ${actual} to be within ${eps} of ${e}`); },
      toBeGreaterThan: (e) => { if (!(actual > e)) fail(`expected ${actual} > ${e}`); },
      toBeGreaterThanOrEqual: (e) => { if (!(actual >= e)) fail(`expected ${actual} >= ${e}`); },
      toBeLessThan: (e) => { if (!(actual < e)) fail(`expected ${actual} < ${e}`); },
      toBeLessThanOrEqual: (e) => { if (!(actual <= e)) fail(`expected ${actual} <= ${e}`); },
      toContain: (e) => { if (!(actual && actual.includes && actual.includes(e))) fail(`expected ${fmt(actual)} to contain ${fmt(e)}`); },
      toMatch: (re) => { if (!re.test(String(actual))) fail(`expected ${fmt(actual)} to match ${re}`); },
      toHaveLength: (n) => { if (!actual || actual.length !== n) fail(`expected length ${n}, got ${actual && actual.length}`); },
      toBeInstanceOf: (C) => { if (!(actual instanceof C)) fail(`expected instance of ${C.name}`); },
      toThrow: (re) => { let threw = false; try { actual(); } catch (err) { threw = true; if (re && !re.test(err.message)) fail(`threw "${err.message}", expected ${re}`); } if (!threw) fail('expected function to throw'); },
      async rejects(re) { let threw = false; try { await actual; } catch (err) { threw = true; if (re && !re.test(err.message)) fail(`rejected with "${err.message}", expected ${re}`); } if (!threw) fail('expected promise to reject'); },
    };
    api.not = {};
    for (const k of Object.keys(api)) if (k !== 'not' && k !== 'rejects') api.not[k] = (...a) => { let ok = false; try { api[k](...a); } catch (e) { ok = true; } if (!ok) fail(`expected not.${k}(${a.map(fmt).join(', ')}) for ${fmt(actual)}`); };
    return api;
  }
  /** Pixel helper: [r,g,b,a] at (x, y) of a canvas. */
  function pixel(canvas, x, y) { return [...canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data]; }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(pred, { timeout = 10000, step = 30 } = {}) { const t0 = performance.now(); for (;;) { const v = await pred(); if (v) return v; if (performance.now() - t0 > timeout * SCALE) throw new AssertionError('waitFor timed out'); await sleep(step); } }

  async function run({ name = document.title } = {}) {
    window.__SLOPTEST_STARTED__ = true;   // tests/run.mjs: a page that errors before this point is reported, not waited on
    const results = [];
    const errors = [];
    addEventListener('error', (e) => errors.push(String(e.message)));
    addEventListener('unhandledrejection', (e) => errors.push(String(e.reason && e.reason.message || e.reason)));
    window.__SLOPTEST_DONE__ = results;   // tests/run.mjs prints these, and __SLOPTEST_NOW__, when a page never finishes
    for (const s of suites) for (const t of s.tests) {
      const t0 = performance.now();
      let status = 'pass', message = '';
      window.__SLOPTEST_NOW__ = s.name + ' › ' + t.name;
      window.__SLOPTEST_DEADLINE__ = performance.now() + t.timeout * SCALE;   // tests/run.mjs: past this, the harness itself is stuck
      // each test starts as a new device would, with Slop AI closed (shared/ai/panel.js remembers it for the next app)
      try { localStorage.removeItem('slop-ai.open'); } catch (e) { /* storage blocked */ }
      try {
        // the test with its beforeEach and afterEach steps, all inside the test's time limit (a hook can hang too)
        const steps = async () => { for (const b of s.before) await b(); await t.fn(); for (const a of s.after) await a(); };
        await Promise.race([steps(), new Promise((_, rej) => setTimeout(() => rej(new AssertionError(`timed out after ${t.timeout * SCALE}ms`)), t.timeout * SCALE))]);
      } catch (e) { status = 'fail'; message = (e && e.message) || String(e); if (!(e instanceof AssertionError) && e && e.stack) message += '\n' + e.stack.split('\n').slice(1, 3).join('\n'); }
      results.push({ suite: s.name, test: t.name, status, message, ms: Math.round(performance.now() - t0) });
    }
    const report = { name, passed: results.filter((r) => r.status === 'pass').length, failed: results.filter((r) => r.status === 'fail').length, results, errors };
    window.__SLOPTEST__ = report;
    render(report);
    return report;
  }
  function render(r) {
    const box = document.createElement('div');
    box.id = 'sloptest-report';
    box.style.cssText = 'position:fixed;inset:auto 0 0 0;max-height:60vh;overflow:auto;z-index:2147483647;background:#0a0a0a;color:#f1ede4;font:12px/1.5 ui-monospace,Menlo,monospace;padding:12px 16px;border-top:2px solid ' + (r.failed ? '#ff4f6e' : '#d4ff3a');
    box.innerHTML = `<b>${r.name}</b> — <span style="color:#d4ff3a">${r.passed} passed</span>${r.failed ? `, <span style="color:#ff4f6e">${r.failed} failed</span>` : ''}<br>` +
      r.results.map((x) => `<div style="color:${x.status === 'pass' ? '#9fd640' : '#ff4f6e'}">${x.status === 'pass' ? '✓' : '✗'} ${x.suite} › ${x.test} <span style="opacity:.5">${x.ms}ms</span>${x.message ? `<pre style="margin:2px 0 6px 16px;white-space:pre-wrap;color:#ffb3c0">${x.message.replace(/</g, '&lt;')}</pre>` : ''}</div>`).join('');
    document.body.append(box);
  }
  /** The open SlopUI dialog on top in a document (a closing one, .sui-out, is skipped), or null. Use it rather than the first
   *  .sui-dlg: under load a dialog that is closing is still in the page, and a test would act on it. */
  const topDialog = (d = document) => [...d.querySelectorAll('.sui-back:not(.sui-out) .sui-dlg')].pop() || null;
  // WCAG contrast of two CSS colours as the browser computes them (rgb(), rgba() or color(srgb ...)).
  function rgbOf(c) {
    const m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(c);
    if (m) return m.slice(1, 4).map((v) => Number(v) * 255);
    return (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  }
  function contrast(a, b) {
    const L = (c) => { const [r, g, bl] = rgbOf(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
    const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  /** The text a page shows for an i18n key: the English text when the page is in English (the build's start language may
   *  be another: tests/brand-facts.js defaultLang), else that language's string. win: the page's window. */
  const said = (win, key, english) => (win.SlopI18n && win.SlopI18n.get() !== 'en' ? win.SlopI18n.t(key) : english);
  /** A preview picture of this site's screenshots (assets/shots): img shows src; a build without media
   *  (tests/brand-facts.js) shows none. */
  const shot = (img, src) => { if (window.BRAND_FACTS.media) expect(img && img.getAttribute('src')).toBe(src); else expect(img).toBe(null); };
  /** For a page whose test reads its English copy: in a build that starts in another language, English is stored as the
   *  visitor's choice (tests/english.js) before the page opens; a build that starts in English stores nothing. */
  const english = () => { if (window.BRAND_FACTS.defaultLang !== 'en' && window.SlopTestEnglish) window.SlopTestEnglish(); };
  window.SlopTest = { describe, it, beforeEach, afterEach, expect, run, pixel, sleep, waitFor, topDialog, contrast, said, shot, english };
})();
