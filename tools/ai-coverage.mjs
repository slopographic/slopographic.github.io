#!/usr/bin/env node
// The AI coverage audit: for every app in shared/apps.js, which SlopCmd commands with arguments (the tools the AI panel,
// Ctrl+K, macros and WebMCP get) it registers, sorted into what the assistant can do there:
//   create   start a new document or project              (new_…, build_…, create_…)
//   add      put content in: text, shapes, rows, slides…  (add_…, insert_…, draw_…, use_tool, brush_…, paste_…)
//   edit     change or style what is there                (everything else that changes the document)
//   export   save or send it out                          (export_…, save_…, download_…)
// plus the operations the app registers in shared/ops (headless, from any app's AI panel and Slop Workflows).
// The commands are read from the app's own scripts (no browser): add('tool', …), ['tool', 'Title', [args…]],
// tool: 'tool', and { id: '…', …, args: … } on one line, in files that hold argument schemas.
//   node tools/ai-coverage.mjs           writes shared/commands/AI-COVERAGE.md and shared/ai/app-skills.js (what the AI panel's
//                                        system prompt says each app can make: its create and add tools, its operations)
//   node tools/ai-coverage.mjs --check   exits 1 when that file is out of date
//   node tools/ai-coverage.mjs --index   reads the files staged for commit (the pre-commit hook), not the working tree
//   node tools/ai-coverage.mjs --baseline  records what every app has now in tests/node/ai-coverage.baseline.json (the
//                                        ratchet); refuses when an app lost something
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'shared/commands/AI-COVERAGE.md';
export const SKILLS = 'shared/ai/app-skills.js';
export const KINDS = ['create', 'add', 'edit', 'export'];
// Apps whose AI commands another branch builds: listed as owned, not as gaps (none now: wip/video-ai is merged).
export const OWNED = {};
// What the assistant reads and sees there: the app's own state or snapshot (SlopCmd.provide), the record apps' shared
// state (shared/data/ai-records.js), or the page's (shared/commands/view.js: any page with SlopCmd). '' when the page has
// no SlopCmd. LEVEL ranks them for the ratchet (tests/node/ai-coverage.test.mjs).
export const LEVEL = { '': 0, page: 1, records: 2, app: 2 };
const PROVIDES = (key) => new RegExp(`provide\\(\\{[^;]{0,400}?\\b${key}\\s*[:,}]`);
const READ = /^(list_|get_|app_state|go_to|undo$|redo$|select_layer$|deselect$|clear_filter$)/;

/** Where the files are read from: the working tree under root, or git's index (staged files). */
export function source(root = ROOT, index = false) {
  if (!index) return { read: (f) => readFileSync(path.join(root, f), 'utf8'), list: (dir) => files(path.join(root, dir)).map((p) => path.relative(root, p)) };
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const all = git('ls-files', '--cached').split('\n').filter(Boolean);
  return { read: (f) => git('show', ':' + f), list: (dir) => all.filter((f) => f.startsWith(dir.replace(/\/?$/, '/')) && /\.m?js$/.test(f) && !/\.min\.js$/.test(f) && !/\/(node_modules|vendor|fonts|assets|classic)\//.test('/' + f.slice(dir.length))) };
}
export function apps(src = source()) {
  const ctx = { window: {} };
  vm.runInNewContext(src.read('shared/apps.js'), ctx);
  return ctx.window.SLOP_APPS.filter((a) => a.kind === 'app' && a.path && !/^https?:/.test(a.path));
}
function files(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) { if (!/^(node_modules|vendor|fonts|assets|classic)$/.test(n)) files(p, out); }
    else if (/\.m?js$/.test(n) && !/\.min\.js$/.test(n)) out.push(p);
  }
  return out;
}
/** The tool names of the commands with arguments in one script's text. */
export function toolsIn(text) {
  if (!/type:\s*'(number|string|enum|boolean|color|array|object)'|\bargs\s*:/.test(text)) return [];
  const out = new Set();
  for (const m of text.matchAll(/\badd\(\s*'([a-z][a-z0-9_]*)'\s*,\s*'/g)) out.add(m[1]);
  for (const m of text.matchAll(/\[\s*'([a-z][a-z0-9_]*)'\s*,\s*'[^'\n]*'\s*,\s*\[/g)) out.add(m[1]);
  for (const m of text.matchAll(/\btool:\s*'([a-z][a-z0-9_]*)'/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bid:\s*'([\w-]+)\.([\w.-]+)'[^\n]*?\bargs\s*:/g)) if (!/\btool:/.test(m[0])) out.add(m[2].split('.').pop().replace(/-/g, '_'));
  return [...out];
}
/** Where a record app's commands live: shared/data/ai-records.js (the same for every app) and its block in ai-records-apps.js. */
const RECORDS = ['describe_records', 'list_records', 'create_record', 'update_record', 'delete_record', 'export_records'];
export function recordTools(src) {
  let text = '';
  try { text = src.read('shared/data/ai-records-apps.js'); } catch (e) { return {}; }
  const out = {}, parts = text.split(/\n {4}(?=[a-z]+: \{ label:)/).slice(1);
  for (const p of parts) {
    const app = /^([a-z]+):/.exec(p)[1], t = new Set(RECORDS);
    for (const m of p.matchAll(/\badd\(\s*'([a-z_]+)'/g)) t.add(m[1]);
    for (const m of p.matchAll(/docCommand\(add, '\w+', '(\w+)'/g)) t.add(`create_${m[1]}`);
    for (const m of p.matchAll(/pdfCommand\(add, '\w+', '\w+', '(\w+)'\)/g)) t.add(`export_${m[1]}_pdf`);
    out[app] = [...t];
  }
  return out;
}
/** A record is both a new item (create) and the app's content (add). */
export const kindsOf = (tool) => (tool === 'create_record' ? ['create', 'add'] : [kindOf(tool)].filter(Boolean));
export function kindOf(tool) {
  if (tool === 'create_record') return 'create';
  if (READ.test(tool)) return null;
  if (/^(add_noise|add_grain)$/.test(tool)) return 'edit';
  if (/^(new|build|create)_(?!layer|slide|column|row|step|page)|_from_outline$/.test(tool)) return 'create';
  if (/^new_/.test(tool)) return 'add';
  if (/^(export|save|download)(_|$)/.test(tool)) return 'export';
  if (/^(add|insert|draw|use_tool|click_tool|brush|paste|append|import|place)(_|$)/.test(tool)) return 'add';
  return 'edit';
}
/** The operations registered per app (shared/ops/*.js register([...], { app })). */
export function opsByApp(src = source()) {
  const out = {};
  for (const f of src.list('shared/ops')) {
    for (const part of src.read(f).split(/\bregister\(\[/).slice(1)) {
      const m = /\],\s*\{\s*app:\s*'([\w-]+)'/.exec(part);
      if (!m) continue;
      // a step: { id: '…', … } (its label is in the tables, shared/ops/i18n.js), or op('…', …) (shared/ops/retouch.js)
      for (const o of part.slice(0, m.index).matchAll(/(?:\{\s*id:\s*|\bop\(\s*)'([\w.:-]+)',/g)) (out[m[1]] = out[m[1]] || []).push(o[1]);
    }
  }
  return out;
}

/** What the assistant reads and sees in an app, and whether its commands reach an assistant in another app (the Slop AI
 * workspace frames it, an AI panel arriving by open_in_app, an agent): the page loads SlopCmd and its commands with
 * arguments are registered at boot or by SlopCmd.provide({ prepare }) (which SlopCmd.prepare() runs, also when asked
 * before the app booted). */
export function reachOf(src, a, records, count) {
  let page = '';
  try { page = src.read(path.posix.join(a.path, 'index.html')); } catch (e) { page = ''; }
  const cmd = /shared\/commands\/commands\.js/.test(page);
  const list = src.list(a.path), texts = list.map((f) => src.read(f));
  const code = texts.map((t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "''"));   // no comments or texts
  const any = (re) => code.some((t) => re.test(t));
  const state = any(PROVIDES('state')) ? 'app' : records ? 'records' : cmd ? 'page' : '';
  const snapshot = any(PROVIDES('snapshot')) ? 'app' : cmd ? 'page' : '';
  // the scripts the page runs: those it names, then those they import or load by name, until nothing new
  const reached = new Set(list.filter((f) => page.includes(path.posix.relative(a.path, f))));
  for (let grew = true; grew;) {
    grew = false;
    for (const f of list) if (!reached.has(f) && [...reached].some((r) => texts[list.indexOf(r)].includes(path.posix.basename(f)))) { reached.add(f); grew = true; }
  }
  const booted = list.some((f, i) => reached.has(f) && toolsIn(texts[i]).length);
  return { state, snapshot, driven: cmd && count > 0 && (records || booted) };
}

export function scan(src = source()) {
  const ops = opsByApp(src), recs = recordTools(src);
  return apps(src).map((a) => {
    const tools = new Set(recs[a.id] || []);
    for (const f of src.list(a.path)) for (const t of toolsIn(src.read(f))) tools.add(t);
    const by = Object.fromEntries(KINDS.map((k) => [k, []]));
    for (const t of [...tools].sort()) for (const k of kindsOf(t)) by[k].push(t);
    const ownOps = ops[a.id] || [];
    const covered = KINDS.every((k) => by[k].length > 0);
    const reach = reachOf(src, a, !!recs[a.id], tools.size);
    const full = covered && !!reach.state && !!reach.snapshot && reach.driven;
    return { id: a.id, name: a.name, path: a.path, by, ops: ownOps, covered, count: tools.size, owner: OWNED[a.id] || null, ...reach, full };
  });
}

export function render(rows) {
  const yes = (l) => (l.length ? `✓ ${l.length}` : '✗');
  const lines = ['# AI coverage', '',
    'Generated by `node tools/ai-coverage.mjs` from each app\'s own SlopCmd commands with arguments (the tools of the AI panel,',
    'Ctrl+K, macros and WebMCP) and its operations in `shared/ops`. Do not edit by hand; `tests/node/ai-coverage.test.mjs` checks',
    'that this file is up to date and that no covered app loses a create, add or export command.', '',
    '**Covered** means the assistant can create, add content, edit and export there. **State** is what app_state reads',
    '(`own`: the app\'s, `records`: the record apps\' shared one, `page`: the page\'s summary, shared/commands/view.js), **Snapshot**',
    'the picture look_at_canvas and app_snapshot take (`own` or `page`), **Driven** whether those commands reach an assistant',
    'in another app (the Slop AI workspace, open_in_app, agents). **Full** is all of it. ✗ marks a gap.', '',
    `Covered: ${rows.filter((r) => r.covered).length} of ${rows.length} apps. Full suite: ${rows.filter((r) => r.full).length} of ${rows.length} apps.`, '',
    '| App | Create | Add | Edit | Export | Operations | State | Snapshot | Driven | Covered | Full |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const lvl = (v) => (v === 'app' ? '✓ own' : v ? `✓ ${v}` : '✗');
  for (const r of rows) lines.push(`| ${r.name} (\`${r.id}\`) | ${yes(r.by.create)} | ${yes(r.by.add)} | ${yes(r.by.edit)} | ${yes(r.by.export)} | ${r.ops.length || ''} | ${lvl(r.state)} | ${lvl(r.snapshot)} | ${r.driven ? '✓' : '✗'} | ${r.covered ? 'yes' : r.owner || 'no'} | ${r.full ? 'yes' : 'no'} |`);
  lines.push('', '## Commands per app', '');
  for (const r of rows.filter((x) => x.count)) {
    lines.push(`### ${r.name}`, '');
    for (const k of KINDS) if (r.by[k].length) lines.push(`- ${k}: ${r.by[k].map((t) => '`' + t + '`').join(', ')}`);
    if (r.ops.length) lines.push(`- operations: ${r.ops.map((t) => '`' + t + '`').join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** The runtime list for the AI panel (shared/ai/app-skills.js, SlopAIKit.appSkills): per app, the tools that make
 * something (create, at most 8 that add content) and its operations. One line per app, so it stays small. */
export function skills(rows) {
  const lines = ['/* Generated by node tools/ai-coverage.mjs from the apps\' own commands (the same scan as shared/commands/AI-COVERAGE.md).',
    ' * Do not edit. SlopAIKit.appSkills[appId] = { create: [tools], add: [tools, at most 8], ops: [operation ids] }: what the',
    ' * AI panel\'s system prompt says each app can make (shared/ai/apptools.js catalog). */', '(function () {', "  'use strict';",
    '  const K = (window.SlopAIKit = window.SlopAIKit || {});', '  K.appSkills = {'];
  for (const r of rows) {
    if (!r.by.create.length && !r.by.add.length && !r.ops.length) continue;
    lines.push(`    ${JSON.stringify(r.id)}: ${JSON.stringify({ create: r.by.create, add: r.by.add.slice(0, 8), ops: r.ops })},`);
  }
  lines.push('  };', '})();', '');
  return lines.join('\n');
}

/** The ratchet's record (tests/node/ai-coverage.baseline.json): per app what it has; an app may only gain. */
export const BASELINE = 'tests/node/ai-coverage.baseline.json';
export const levels = (r) => ({ create: r.by.create.length > 0, add: r.by.add.length > 0, edit: r.by.edit.length > 0, export: r.by.export.length > 0, state: r.state, snapshot: r.snapshot, driven: !!r.driven });
/** What an app lost against its baseline entry: ['export', 'state own → page', …]. */
export function losses(now, was) {
  const out = [];
  for (const k of ['create', 'add', 'edit', 'export', 'driven']) if (was[k] && !now[k]) out.push(k);
  for (const k of ['state', 'snapshot']) if (LEVEL[now[k] || ''] < LEVEL[was[k] || '']) out.push(`${k} ${was[k]} → ${now[k] || 'none'}`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv.includes('--root') ? path.resolve(process.argv[process.argv.indexOf('--root') + 1]) : ROOT;
  const rows = scan(source(root, process.argv.includes('--index')));
  const outs = [[OUT, render(rows)], [SKILLS, skills(rows)]];
  if (process.argv.includes('--check')) {
    for (const [rel, text] of outs) {
      const file = path.join(root, rel), old = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (old !== text) { console.error(`${rel} is out of date: run node tools/ai-coverage.mjs`); process.exit(1); }
    }
  } else if (process.argv.includes('--baseline')) {   // raise the ratchet to what the apps have now; never lowers it
    const file = path.join(root, BASELINE), old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    const bad = rows.filter((r) => old[r.id] && losses(levels(r), old[r.id]).length);
    if (bad.length) { console.error('Not lowering the baseline: ' + bad.map((r) => `${r.id} lost ${losses(levels(r), old[r.id]).join(', ')}`).join('; ')); process.exit(1); }
    writeFileSync(file, JSON.stringify(Object.fromEntries(rows.map((r) => [r.id, levels(r)])), null, 1) + '\n');
  } else if (process.argv.includes('--print')) process.stdout.write(outs[0][1]);
  else for (const [rel, text] of outs) writeFileSync(path.join(root, rel), text);
}
