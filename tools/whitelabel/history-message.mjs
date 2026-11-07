// Commit messages of a mapped history (history.mjs): a source commit's message with its trailers stripped and its names
// mapped the way the build maps the site (links, plain names, the rename map). A part that still holds a forbidden word,
// talks about how the copy is made (TALK) or about how the work was done (PROCESS), or still holds the rename map's
// target stem (a name the plain names did not cover), is left out; when too little is left, the message is a neutral
// one made from the areas of the site the commit changed ("Image Editor and Tests: updates"). App names are matched in
// any case and spelling first (PhotoSLOP, Slop PDF, SlopVector: the plain name), and an identifier made of the stem and
// a word keeps the word (SlopUI: UI). Messages of commits that were folded into the next one are listed in its body.
// Node only. Tests: tests/node/whitelabel-history.test.mjs.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { profileText } from './transform.mjs';
import { tokens } from './rename.mjs';
import { findTerms } from './scan.mjs';

/** Words about the making of a copy: never in a mapped message. */
export const TALK = /mirror|white[\s-]?label|brand[\s-]?(?:profile|build)|profile[\s-]?marker|rename[\s-]?map|sample[\s-]?(?:brand|profile)|\bacme\b|\bsilos?\b/i;
/** Words about how the work was done (agents, unfinished work, session notes): never in a mapped message. */
export const PROCESS = /\bagents?\b|\bagents'|AI[\s-]generated|\bWIP\b|not yet tested|untested|work in progress|in progress\b|check-?point|hand-?offs?\b|\bsession\b|auto-?save\)|\bpending work\b/i;
/** A parenthesis that only says the work is unfinished: "(WIP, not yet tested)". */
const NOTE = /\s*\((?:[^()]*?\b(?:WIP|not yet tested|work in progress|in progress|untested)\b[^()]*)\)/gi;
/** Trailer lines and tool footers. */
const TRAILER = /^\s*(?:[A-Z][\w-]*-by|Change-Id|Signed-off-by|Co-authored-by)\s*:|generated with \[|^\s*🤖/i;

/** The message without trailers, tool footers and signature blocks, spaces tidied. */
export function cleanMessage(raw) {
  const lines = String(raw).replace(/\r/g, '').split('\n').filter((l) => !TRAILER.test(l) && !/^-----(BEGIN|END)/.test(l));
  return lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Readable names for the top folders of the site: the app registry's plain names, then a few fixed ones. */
const FIXED = { shared: 'Shared components', tests: 'Tests', tools: 'Tools', vendor: 'Libraries', home: 'Homepage', shell: 'App shell',
  style: 'Styles', brand: 'Brand', assets: 'Assets', '.github': 'CI', '.githooks': 'Hooks', docs: 'Docs', package: 'Package' };
export function areaNames(root) {
  const names = new Map(Object.entries(FIXED));
  try {
    const win = {};
    vm.runInNewContext(readFileSync(path.join(root, 'shared', 'apps.js'), 'utf8'), { window: win });
    for (const a of win.SLOP_APPS || []) {
      const dir = String(a.path || a.id || '').replace(/^\.?\//, '').split('/')[0];
      if (dir && a.plain && !names.has(dir)) names.set(dir, a.plain);
    }
  } catch (e) { /* the fixed names only */ }
  return names;
}

/** The areas a list of source paths falls in, most touched first (root files: "Site"). fix: what an unnamed folder's
 * name goes through (the rename map), so no source word reaches a message. */
export function areas(paths, names, fix = (s) => s) {
  const n = new Map();
  for (const p of paths) {
    const top = p.includes('/') ? p.split('/')[0] : '';
    const a = top ? names.get(top) || fix(top).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Site';
    n.set(a, (n.get(a) || 0) + 1);
  }
  return [...n.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([a]) => a);
}

/** "A: updates", "A and B: updates", "A, B and 3 more areas: updates". */
export function neutral(list) {
  if (!list.length) return 'Updates';
  if (list.length === 1) return `${list[0]}: updates`;
  if (list.length === 2) return `${list[0]} and ${list[1]}: updates`;
  if (list.length === 3) return `${list[0]}, ${list[1]} and ${list[2]}: updates`;
  return `${list[0]}, ${list[1]} and ${list.length - 2} more areas: updates`;
}

/** A checker for mapped text: true when it holds no forbidden term, no TALK or PROCESS word and not the stem target. */
export function checker(terms, account, stem) {
  const st = stem ? new RegExp(stem.replace(/[^\w]/g, ''), 'i') : null;
  return (s) => !TALK.test(s) && !PROCESS.test(s) && !(st && st.test(s)) && findTerms(s, terms, { account }).length === 0;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The app names of the copy layer that hold the source stem, matched in any case and with or without the space. */
function nameRules(ctx) {
  if (ctx._names) return ctx._names;
  const stem = ctx.map.stem[0], out = [];
  for (const [from, to] of ctx.pairs) {
    if (!from.toLowerCase().includes(stem) || !/^[\w ]+$/.test(from) || !to) continue;
    for (const f of new Set([from, from.replace(/ /g, '')])) out.push([new RegExp(`(?<![\\w/.-])${esc(f)}(?![\\w-])`, 'gi'), to]);
  }
  ctx._names = out.sort((a, b) => b[0].source.length - a[0].source.length);
  return ctx._names;
}
/** Names mapped like the build does, app names in any spelling first; the stem's identifiers keep their word. */
export function mapText(s, ctx) {
  for (const [re, to] of nameRules(ctx)) s = s.replace(re, to);
  const t = tokens(profileText(s, ctx), ctx.tokenRules), stem = ctx.map.stem[1];
  return t.replace(new RegExp(`\\b${stem}(?=[A-Z])`, 'gi'), (m) => (m === m.toUpperCase() || m[0] === m[0].toUpperCase() ? '' : m))
    .replace(new RegExp(`\\b${stem.toUpperCase()}_(?=[A-Z])`, 'g'), '');
}

/** The subject without the parts that fail: "Milestone 4: a, b; c" keeps its prefix and the clauses that pass. */
function pruneSubject(subject, ok) {
  if (ok(subject)) return subject;
  subject = subject.replace(/\s*\(([^()]*)\)/g, (all, inner) => (ok(inner) ? all : ''));   // a failing aside goes whole
  if (ok(subject)) return subject;
  const m = /^([^:]{1,40}:\s+)([\s\S]*)$/.exec(subject), head = m ? m[1] : '', body = m ? m[2] : subject;
  if (!ok(head)) return '';
  const parts = [];                                           // clauses at ", " and "; " outside parentheses
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (!depth && (ch === ',' || ch === ';') && body[i + 1] === ' ') { parts.push(cur); cur = ''; i++; continue; }
    cur += ch;
  }
  parts.push(cur);
  const kept = parts.filter((p) => p.trim() && ok(p));
  if (!kept.length || kept.length * 2 < parts.length) return '';   // more than half gone: say less, not nonsense
  return head + kept.join(', ').replace(/^and /, '');
}

/** One source message, mapped; '' when nothing usable is left. drop: source words (regular expressions) whose parts go
 * before the names are mapped. */
export function mapMessage(raw, ctx, ok, drop = []) {
  let src = cleanMessage(raw);
  if (drop.some((re) => re.test(src))) {
    const okSrc = (x) => !drop.some((re) => re.test(x));
    const [first, ...more] = src.split('\n');
    src = [pruneSubject(first, okSrc)].concat(more.filter(okSrc)).join('\n');
    if (!src.split('\n')[0].trim()) return '';
  }
  const text = mapText(src, ctx).replace(NOTE, '');
  if (/^Merge (?:branch|remote-tracking|pull request|wip\/|[\w/.-]+ into )/.test(text)) return '';   // a merge: the areas say more
  const [subject, ...rest] = text.split('\n');
  const s = pruneSubject(subject.trim(), ok);
  if (!s) return '';
  const body = rest.filter((l) => ok(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return body ? `${s}\n\n${body}` : s;
}

/** The message of one mapped commit: its own (or a neutral one), and when earlier commits were folded into it, their
 * subjects (at most 40). items: [{ message (already mapped, may be ''), areas }], oldest first; the last is the commit. */
export function combine(items, ok) {
  const last = items[items.length - 1];
  let own = last.message || neutral(last.areas);
  if (!ok(own)) own = 'Updates';
  if (items.length === 1) return own + '\n';
  const folded = items.slice(0, -1).map((it) => (it.message || neutral(it.areas)).split('\n')[0]);
  const list = folded.slice(-40).map((s) => `- ${s}`);
  if (folded.length > 40) list.unshift(`- (and ${folded.length - 40} earlier changes)`);
  const msg = `${own}\n\nAlso in this commit:\n${list.join('\n')}\n`;
  return ok(msg) ? msg : own + '\n';
}
