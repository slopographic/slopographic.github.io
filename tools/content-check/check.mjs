#!/usr/bin/env node
// The content check: everything in a git repository, not only the checked-out files, searched for words it must never
// carry. Every object (git cat-file --batch-all-objects: every version of every file, every folder, commit and tag,
// reachable or not) and every ref name. The words are not in the code: they come from the CONTENT_RULES environment
// variable (a repository secret), JSON:
//   { "terms": ["word", ...], "keep": ["allowed whole word", ...], "allow": ["<git blob id>", ...] }
// A term counts wherever it occurs, inside a longer word too, unless that whole word is in keep; both are compared without
// regard to case (words.mjs, the same rule as the white-label leak scan). Commits and tags are read as text (author,
// committer, tagger, message; ids and signatures left out), trees by their entry names (file and folder names), blobs like
// the leak scan reads files (unpack.mjs): text as UTF-8; a binary as Latin-1 and UTF-16 at both byte alignments, and the
// contents of a WOFF2 font or a zip the same way, a PNG's compressed text and a PDF's text (a PDF that cannot be read
// counts as found); a text file also through the views of spelled.mjs (a word spelled so a plain search misses it).
// allow: blobs whose exact bytes may hold a term (a third-party binary that spells one by chance, an encrypted test
// file); each one met is reported as allowed. No rules, or no terms: the check fails.
// The output is safe for a public log: first a GitHub Actions mask (::add-mask::) for every term and keep word, then only
// the kind of each object that holds a term, its id, its path (blobs and trees, every term in it shown as ***) and a count
// (with how many of them were spelled, and whether it is an unreadable PDF).
//   CONTENT_RULES='{"terms":["acme"]}' node tools/content-check/check.mjs [<repo dir>]   exit 0 only when nothing is found
// A mirror runs it on every push (.github/workflows/content.yml, written by the white-label build). Node only, no packages.
// Tests: tests/node/content-check.test.mjs, tests/node/content-check-unpack.test.mjs.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findWords } from './words.mjs';
import { unpack, isText, readings } from './unpack.mjs';
import { spelledMatches } from './spelled.mjs';
import { refNames, objectPaths, treeNames, objectTexts, eachObject } from './git.mjs';

export const NO_RULES = 'no rules: this check cannot pass without its secret (CONTENT_RULES)';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (v) => [...new Set((Array.isArray(v) ? v : []).filter((w) => typeof w === 'string').map((w) => w.trim().toLowerCase()).filter(Boolean))];

/** The rules from CONTENT_RULES' text: { terms, keep, allow } (lower case), or null when there are none or no terms. */
export function parseRules(text) {
  let r;
  try { r = JSON.parse(text || ''); } catch (e) { return null; }
  if (!r || typeof r !== 'object') return null;
  const terms = words(r.terms);
  return terms.length ? { terms, keep: words(r.keep), allow: words(r.allow) } : null;
}

/** The mask lines: every term and keep word, as written in lower case, capitalised and upper case. */
export function masks(rules) {
  const all = new Set();
  for (const w of rules.terms.concat(rules.keep)) for (const v of [w, w[0].toUpperCase() + w.slice(1), w.toUpperCase()]) all.add(v);
  return [...all].map((v) => `::add-mask::${v}`);
}

/** A name with every term and keep word replaced by ***. */
export function redactor(rules) {
  const re = new RegExp(rules.terms.concat(rules.keep).sort((a, b) => b.length - a.length).map(esc).join('|'), 'gi');
  return (s) => s.replace(re, '***');
}

/** The matches in a string. A quick case-insensitive test first (it finds every place findWords could). */
function finder(rules) {
  const quick = new RegExp(rules.terms.map(esc).join('|'), 'i');
  return (s) => (quick.test(s) ? findWords(s, rules.terms, rules.keep) : []);
}

/** { count, spelled, unreadable } for one blob: text as UTF-8 and its spelled views; a binary in its three readings;
 * and what it holds besides its bytes (unpack.mjs). */
function blobHits(data, file, find) {
  const r = { count: 0, spelled: 0, unreadable: 0 }, parts = unpack(file || '', data);
  if (isText(data)) {
    const text = data.toString('utf8');
    r.count = find(text).length;
    r.spelled = spelledMatches(text, find).length;
  } else parts.unshift({ data });
  for (const part of parts) {
    if (part.unreadable) r.unreadable++;
    else for (const s of readings(part)) r.count += find(s).length;
  }
  return r;
}

const ORDER = ['ref', 'commit', 'tag', 'tree', 'blob'];
/** Checks the repository. Returns { found: [{ kind, id, path?, count }], allowed: [blob id], objects, refs }. */
export async function check(repo, rules) {
  const find = finder(rules), count = (s) => find(s).length, hide = redactor(rules), allow = new Set(rules.allow);
  const found = [], allowed = [];
  const refs = refNames(repo);
  for (const ref of refs) { const n = count(ref); if (n) found.push({ kind: 'ref', id: hide(ref), count: n }); }
  const paths = objectPaths(repo);
  const where = (id) => (paths.has(id) ? hide(paths.get(id)) || '/' : '(unreachable)');
  const objects = await eachObject(repo, ({ id, type, data }) => {
    let r = { count: 0 };
    if (type === 'blob') {
      if (allow.has(id)) { allowed.push(id); return; }
      r = blobHits(data, paths.get(id), find);
    } else if (type === 'tree') {
      for (const name of treeNames(data, id.length / 2)) r.count += count(name);
    } else {
      r.count = Math.max(...objectTexts(data).map(count));
    }
    const n = r.count + (r.spelled || 0) + (r.unreadable || 0);
    if (!n) return;
    const f = { kind: type, id, count: n, spelled: r.spelled || 0, unreadable: r.unreadable || 0 };
    if (type === 'blob' || type === 'tree') f.path = where(id);
    found.push(f);
  });
  found.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || String(a.path).localeCompare(String(b.path)));
  return { found, allowed: allowed.sort(), objects, refs: refs.length };
}

/** The lines to print: what was checked, each allowed blob, each finding (at most max), the verdict. */
export function report(res, max = 200) {
  const lines = [`checked ${res.objects} objects and ${res.refs} refs`];
  for (const id of res.allowed) lines.push(`allowed: blob ${id}`);
  for (const f of res.found.slice(0, max)) {
    const notes = [f.count].concat(f.spelled ? [`${f.spelled} spelled`] : [], f.unreadable ? ['unreadable PDF'] : []);
    lines.push(`found: ${f.kind} ${f.id}${f.path === undefined ? '' : ' ' + f.path} (${notes.join(', ')})`);
  }
  if (res.found.length > max) lines.push(`... and ${res.found.length - max} more`);
  lines.push(res.found.length ? `failed: ${res.found.length} object(s) or ref(s) hold a forbidden word` : 'passed: nothing found');
  return lines;
}

async function main() {
  const rules = parseRules(process.env.CONTENT_RULES);
  if (!rules) { console.log(NO_RULES); return 1; }
  for (const line of masks(rules)) console.log(line);
  const t0 = Date.now();
  try {
    const res = await check(path.resolve(process.argv[2] || '.'), rules);
    for (const line of report(res)) console.log(line);
    console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return res.found.length ? 1 : 0;
  } catch (e) {
    console.log(`the check could not run: ${redactor(rules)(String((e && e.message) || e))}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().then((code) => { process.exitCode = code; });
