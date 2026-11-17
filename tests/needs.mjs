// A test page that is about a feature a brand profile can leave out says so in its head:
//   <meta name="slop-test-needs" content="mascot=builtin">           the built-in buddy engine (shared/buddy)
//   <meta name="slop-test-needs" content="mascot=builtin|overlay">   any mascot; "media=true", "tone=playful", ...
//   <meta name="slop-test-needs" content="support.exportCard=true">  a part brand/brand.json can switch off
// (conditions on the brand facts, tests/brand-facts.js, and brand.json's support flags; several are joined with ";", and
// every one must hold). tests/run.mjs
// runs such a page only in a build whose facts fit, and names the pages it left out and why. A build without the feature
// has a page of its own for the switch's other side (for the mascot: tests/buddy/off.test.html). Node only.
// Tests: tests/node/test-needs.test.mjs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The brand facts of this checkout (tests/brand-facts.js), with brand/brand.json's support flags as support.<part>. */
export function loadFacts(root = ROOT) {
  const g = {};
  vm.runInNewContext(readFileSync(path.join(root, 'tests/brand-facts.js'), 'utf8'), g);
  const support = JSON.parse(readFileSync(path.join(root, 'brand/brand.json'), 'utf8')).support || {};
  return Object.assign({}, g.BRAND_FACTS, Object.fromEntries(Object.entries(support).map(([k, v]) => [`support.${k}`, v])));
}

/** A page's conditions, [{ key, values }], from its slop-test-needs meta (none: []). */
export function needsOf(html) {
  const m = /<meta name="slop-test-needs" content="([^"]*)">/.exec(html);
  if (!m) return [];
  return m[1].split(';').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [key, vals] = c.split('=');
    if (!key || vals === undefined) throw new Error(`slop-test-needs: "${c}" is not key=value`);
    return { key: key.trim(), values: vals.split('|').map((v) => v.trim()) };
  });
}

/** The conditions that do not hold for the facts (an unknown key is an error, so a typo never hides a page). */
export function unmet(needs, facts) {
  return needs.filter(({ key, values }) => {
    if (!Object.prototype.hasOwnProperty.call(facts, key)) throw new Error(`slop-test-needs: no brand fact "${key}"`);
    return !values.includes(String(facts[key]));
  });
}

/** Does tests/run.mjs store English as the visitor's choice before the page loads (tests/english.js)? In a build that
 *  starts in another language, for every page but one about the start language (<meta name="slop-test-lang" content="default">). */
export const englishFirst = (html, facts) => facts.defaultLang !== 'en' && !/<meta name="slop-test-lang" content="default">/.test(html);
