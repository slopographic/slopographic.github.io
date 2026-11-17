/* Slop Compare for the assistant (the AI panel, WebMCP, macros): SlopCmd commands with argument schemas. The work is the
 * page's own (window.SlopCompare: setSide, compare, at, export); the settings are the one table (core/compare.js OPTIONS),
 * so the assistant, the panel and the Workflows step mean the same by each. ES module, loaded by SlopCmd.prepare().
 *   diff.ai.new-comparison   new_comparison   (none)                      clears both sides
 *   diff.ai.add-text         add_text         side, text, name?           a text as A or B
 *   diff.ai.add-file         add_file         side, file | url            a Slop Drive file (or a file on this site)
 *   diff.ai.set-options      set_options      the OPTIONS keys            view, ignore whitespace and case, CSV key…
 *   diff.ai.compare          compare          (none)                      runs it; the summary and the first changes
 *   diff.ai.list-changes     list_changes     limit                       read only
 *   diff.ai.go-to-change     go_to_change     index                       scrolls to change n (1-based)
 *   diff.ai.export-report    export_report    format, to                  html | pdf | patch to Slop Drive and/or a download */
import { OPTIONS } from '../core/compare.js';
import { readFile } from './slots.js';
import { setOpts } from './state.js';
import { changes } from '../core/kind.js';
import { show } from '../core/json.js';

const SIDE = { name: 'side', type: 'enum', values: ['a', 'b'], required: true, description: 'a: the original, b: the changed version' };
const OPT_ARGS = OPTIONS.map((o) => {
  const a = { name: o.key, description: o.label + (o.hint ? `. ${o.hint}` : '') };
  if (typeof o.value === 'boolean') a.type = 'boolean';
  else if (typeof o.value === 'number') Object.assign(a, { type: 'number', min: o.min, max: o.max, integer: true });
  else if (o.options) Object.assign(a, { type: 'enum', options: o.options });
  else Object.assign(a, { type: 'string', maxLength: 200 });
  return a;
});

/** The first changes in words the model can read. */
function described(app, limit = 20) {
  const r = app.S.result, out = [];
  if (!r) return out;
  if (r.kind === 'json') for (const e of r.json.entries.slice(0, limit)) out.push(`${e.kind} ${e.path}${e.kind !== 'added' ? ` was ${show(e.a)}` : ''}${e.kind !== 'removed' ? ` is ${show(e.b)}` : ''}`);
  else if (r.kind === 'csv') for (const x of r.csv.rows.filter((y) => y.t !== 'eq').slice(0, limit)) out.push(`line ${x.at} ${x.t === 'mod' ? `changed: ${x.changed.map((c) => `${c} ${x.a.cells[c]} → ${x.b.cells[c]}`).join(', ')}` : x.t === 'ins' ? 'added' : 'removed'}`);
  else if (r.kind === 'image') for (const b of r.image.boxes.slice(0, limit)) out.push(`area ${b.w}×${b.h} px at ${b.x},${b.y}`);
  else if (r.kind === 'pdf' && r.view === 'visual') for (const p of r.pdf.visual.filter((v) => v.count).slice(0, limit)) out.push(`page ${p.page}: ${p.boxes.length} changed areas`);
  else {
    const t = r.text;
    for (const b of t.blocks.slice(0, limit)) {
      const rows = t.rows.slice(b.start, b.end);
      const del = rows.filter((x) => x.a >= 0).map((x) => t.a[x.a]), ins = rows.filter((x) => x.b >= 0).map((x) => t.b[x.b]);
      const at = rows[0].a >= 0 ? `A line ${rows[0].a + 1}` : `B line ${rows[0].b + 1}`;
      out.push(`${at}: ${del.length ? `removed ${JSON.stringify(del.join('\n').slice(0, 300))}` : ''}${del.length && ins.length ? ', ' : ''}${ins.length ? `added ${JSON.stringify(ins.join('\n').slice(0, 300))}` : ''}`);
    }
  }
  return out;
}

async function fileOf(a) {
  const src = window.SlopCmdSources;
  if (a.file) { const r = await src.driveFile(a.file); return new File([r.blob], r.name, { type: r.type || r.blob.type || '' }); }
  if (a.url) { const r = await src.siteFile(a.url); return new File([r.blob], r.name, { type: r.blob.type || '' }); }
  throw new Error('Give file (a Slop Drive name or id) or url (a file on this site)');
}

export function register(app) {
  const C = window.SlopCmd;
  if (!C || C.get('diff.ai.compare')) return;
  const add = (tool, title, args, run, extra) => Object.assign({ id: 'diff.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, args,
    run: (a) => run(a || window.SlopCmdArgs.defaults(args)) }, extra);
  C.register([
    add('new_comparison', 'Start a new comparison', [], () => { app.clearAll(); return 'Both sides are empty. Add a text or a file to each.'; },
      { destructive: true, description: 'Clears A and B (and the result) to start again.' }),
    add('add_text', 'Set a side to a text', [SIDE, { name: 'text', type: 'string', required: true, maxLength: 2000000 }, { name: 'name', type: 'string', maxLength: 200, description: 'a file name, e.g. notes.md or data.json (sets how it is compared)' }],
      (a) => { app.setSide(a.side, { name: a.name || '', type: '', text: a.text }); return `${a.side.toUpperCase()} is the text (${a.text.split('\n').length} lines).`; }, { destructive: false }),
    add('add_file', 'Open a file as a side', [SIDE, { name: 'file', type: 'string', maxLength: 300, description: 'Slop Drive name or id' }, { name: 'url', type: 'string', maxLength: 500, description: 'a file on this site' }],
      async (a) => { const f = await fileOf(a); app.setSide(a.side, await readFile(f)); return `${a.side.toUpperCase()} is ${f.name}.`; }, { destructive: false }),
    add('set_options', 'Change the comparison settings', OPT_ARGS, (a) => {
      const patch = Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      if (!Object.keys(patch).length) throw new Error('Nothing to change: give view, ignoreWs, ignoreCase, context, key…');
      setOpts(patch);
      return `Settings now: ${OPTIONS.map((o) => `${o.key} ${JSON.stringify(app.S.opts[o.key])}`).join(', ')}.`;
    }, { destructive: false, description: 'Compare as text, JSON or CSV; side by side or unified; ignore whitespace or case; context lines; the CSV key column; the picture threshold and views.' }),
    add('compare', 'Compare A and B', [], async () => {
      const r = await app.compare();
      if (!r) throw new Error(app.S.error || 'Both sides need a text or a file');
      return { summary: document.getElementById('df-sum').textContent, changes: changes(r), first: described(app, 10) };
    }, { destructive: false }),
    add('list_changes', 'List the changes', [{ name: 'limit', type: 'number', min: 1, max: 200, default: 50, integer: true }],
      (a) => { if (!app.S.result) throw new Error('Compare first'); return { count: changes(app.S.result), changes: described(app, a.limit) }; }, { readOnly: true }),
    add('go_to_change', 'Show a change', [{ name: 'index', type: 'number', min: 1, max: 100000, required: true, integer: true, description: '1 is the first change' }],
      (a) => { const n = app.at(a.index - 1); if (!n) throw new Error('There are no changes to show'); return `Showing change ${n} of ${app.count()}.`; }),
    add('export_report', 'Save or download the report', [{ name: 'format', type: 'enum', values: ['html', 'pdf', 'patch'], default: 'html' }, { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
      async (a) => {
        const out = [];
        if (a.to !== 'download') out.push(`saved to Slop Drive (id ${await app.export.saveToDrive(a.format)})`);
        if (a.to !== 'drive') out.push(`downloaded ${await app.export.download(a.format)}`);
        return `The ${a.format === 'patch' ? '.patch' : a.format.toUpperCase() + ' report'} was ${out.join(' and ')}.`;
      }, { destructive: false }),
  ]);
  C.provide({
    state: () => {
      const s = app.S, side = (k) => ({ name: s.sides[k].name, kind: s.sides[k].file || s.sides[k].text ? app.sideKind(s.sides[k]) : null, lines: s.sides[k].file ? null : s.sides[k].text.split('\n').length });
      return { app: 'Slop Compare', a: side('a'), b: side('b'), options: s.opts, result: s.result ? { kind: s.result.kind, changes: changes(s.result), summary: document.getElementById('df-sum').textContent, current: s.cur + 1 } : null, error: s.error || null };
    },
    checkpoint: () => { const keep = { a: { ...app.S.sides.a }, b: { ...app.S.sides.b } }; return () => { app.setSide('a', keep.a); app.setSide('b', keep.b); return true; }; },
  });
}
