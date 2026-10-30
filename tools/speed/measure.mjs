// One Lighthouse run of one page, and the numbers the speed check keeps from its report. Lighthouse runs through its Node
// API in a headless Chrome kept open for the series, performance only, with simulated throttling (Lighthouse's default "lantern", which
// models the network and CPU instead of slowing the machine, so the numbers mostly do not depend on the machine).
//   mobile:  Lighthouse's default, a mid-range phone on slow 4G
//   desktop: --preset=desktop
// Chrome: CHROME_PATH, or Playwright's Chromium. metricsOf() is pure; tests/node/speed-budget.test.mjs checks it.
import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PRESETS = ['mobile', 'desktop'];
/** The kept numbers: score 0-100, times in ms, CLS unitless, bytes transferred, requests made. */
export const METRICS = ['score', 'fcp', 'lcp', 'cls', 'tbt', 'si', 'bytes', 'requests'];
/** The audits Lighthouse runs: the five that make the performance score, and the two the bytes and requests come from. */
export const AUDITS = ['first-contentful-paint', 'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'speed-index', 'total-byte-weight', 'network-requests'];

const num = (a) => (a && Number.isFinite(a.numericValue) ? a.numericValue : null);
/** The kept numbers of a Lighthouse result (LHR). A metric Lighthouse could not compute is null. */
export function metricsOf(lhr) {
  const a = lhr.audits || {};
  const score = lhr.categories?.performance?.score;
  const items = a['network-requests']?.details?.items;
  const r = (v, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    score: score == null ? null : Math.round(score * 100),
    fcp: r(num(a['first-contentful-paint'])),
    lcp: r(num(a['largest-contentful-paint'])),
    cls: r(num(a['cumulative-layout-shift']), 3),
    tbt: r(num(a['total-blocking-time'])),
    si: r(num(a['speed-index'])),
    bytes: r(num(a['total-byte-weight'])),
    requests: Array.isArray(items) ? items.length : null,
  };
}

/** Playwright's newest Chromium in its cache, or null. */
export function playwrightChrome(home = os.homedir()) {
  const dir = path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(home, '.cache/ms-playwright'));
  if (!existsSync(dir)) return null;
  const builds = readdirSync(dir).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const b of builds) for (const sub of ['chrome-linux64', 'chrome-linux']) {
    const p = path.join(dir, b, sub, 'chrome');
    if (existsSync(p)) return p;
  }
  return null;
}

/** Lighthouse's flags for a run: performance only, the audits above, JSON out, errors only in the log. */
export function lighthouseFlags(port) {
  return { port, output: 'json', logLevel: 'error', onlyCategories: ['performance'], onlyAudits: AUDITS, maxWaitForLoad: 60000 };
}
export const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

/** Opens one headless Chrome for a series of runs (a run takes about half as long as starting Chrome for each one; Lighthouse
 * clears the cache and storage before each). Resolves { run(url, preset) -> numbers, close() }; run throws with Lighthouse's
 * error, and the next run after an error gets a new Chrome. */
export async function openLighthouse({ chromePath = process.env.CHROME_PATH || playwrightChrome() } = {}) {
  const [{ default: lighthouse }, { default: desktop }, launcher] = await Promise.all([
    import('lighthouse'), import('lighthouse/core/config/desktop-config.js'), import('chrome-launcher')]);
  let chrome = null;
  const start = async () => (chrome ||= await launcher.launch({ chromePath, chromeFlags: CHROME_FLAGS, logLevel: 'silent' }));
  const stop = async () => { const c = chrome; chrome = null; if (c) await Promise.resolve(c.kill()).catch(() => {}); };
  return {
    async run(url, preset) {
      if (!PRESETS.includes(preset)) throw new Error(`unknown preset ${preset}`);
      try {
        const c = await start();
        const result = await lighthouse(url, lighthouseFlags(c.port), preset === 'desktop' ? desktop : undefined);
        const lhr = result?.lhr;
        if (!lhr) throw new Error('no result');
        if (lhr.runtimeError) throw new Error(`${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
        return metricsOf(lhr);
      } catch (e) {
        await stop();
        throw new Error(`lighthouse ${url} ${preset}: ${e.message}`);
      }
    },
    close: stop,
  };
}
