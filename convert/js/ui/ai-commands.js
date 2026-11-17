/* File convert for the assistant: SlopCmd commands with arguments (shared/commands/args.js), imported on demand by
 * SlopCmd.prepare() (mount.js). They drive the page's ConvertTool (tool.js) the way its controls do:
 *   new_conversion   clear the list and the results; optionally the format new files start on (like ?to=)
 *   add_files        Slop Drive files, files on this site, or a text, through the tool's intake (as a drop)
 *   list_targets     what the files can become, with each conversion's options
 *   set_target       the format (a conversion id, a kind like png, or a route) and its options, for all files or some
 *   run_conversion   Convert: every file with its own target and options
 *   export_results   the converted files to Slop Drive and/or a download (one file or a zip); converts first if needed
 * state() lists the files, their targets and the results; the checkpoint puts the files and their choices back. */
import { conversionById } from '../core/catalog.js';
import { KIND_LABEL } from '../core/detect.js';
import { targetFor, WITH } from './targets.js';
import { valuesOf, setValues } from './file-opts.js';
import { isRoute, stepsOf } from '../core/chain.js';
import { writeZip } from '../io/zip.js';
import { saveBlob } from '../io/files.js';

const C = window.SlopCmd;
const tool = () => { const r = document.querySelector('[data-convert-root]'); if (!r || !r.convertTool) throw new Error('The converter is not on this page'); return r.convertTool; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const convOf = (t) => (isRoute(t) ? stepsOf(t).pop().conv : conversionById(t));
const labelOf = (t) => { const c = convOf(t); return t === WITH ? 'goes with its model' : c ? (isRoute(t) ? `${c.label} (by way of ${stepsOf(t).length} steps)` : c.label) : 'none'; };   // i18n-ignore: for the assistant (API)
const notBusy = (t) => { if (t.busy) throw new Error('A conversion is running; wait for it to finish'); return t; };

/** The files a command works on: those named (a name or a part of it), else every file. */
function pick(t, names) {
  if (!names || !names.length) return t.active();
  return names.map((q) => {
    const s = String(q).toLowerCase(), it = t.items.find((i) => i.name.toLowerCase() === s) || t.items.find((i) => i.name.toLowerCase().includes(s));
    if (!it) throw new Error(`No file “${q}” in the list. The list has: ${t.items.map((i) => i.name).join(', ') || 'nothing'}.`);
    return it;
  });
}
/** Option values from the assistant, checked against the conversion's own options (catalog.js). */
function optionValues(conv, given) {
  const out = {};
  for (const [k, v] of Object.entries(given || {})) {
    const o = conv.options.find((x) => x.key === k);
    if (!o) throw new Error(`${conv.label} has no option “${k}”. Its options: ${conv.options.map((x) => x.key).join(', ') || 'none'}`);
    if (o.type === 'select' && !o.options.some(([x]) => String(x) === String(v))) throw new Error(`${k} must be one of ${o.options.map(([x]) => x).join(', ')}`);
    out[k] = o.type === 'checkbox' ? !!v && v !== 'false' : o.type === 'number' || o.type === 'range' ? Number(v) : v;
    if ((o.type === 'number' || o.type === 'range') && !Number.isFinite(out[k])) throw new Error(`${k} must be a number`);
  }
  return out;
}
const optionInfo = (conv) => conv.options.filter((o) => o.type !== 'image' && o.type !== 'watermark').map((o) => ({ key: o.key, type: o.type, label: o.label, default: o.type === 'password' ? undefined : o.value,
  choices: o.options ? o.options.map(([v]) => v) : undefined, min: o.min, max: o.max }));

/** What the results were made from: the files, their targets and options. */
const sig = (t) => JSON.stringify(t.active().map((i) => [i.id, t.targetOf(i), i.opts || null]));
async function convert(t) { await t.run(); t.outputs.sig = sig(t); }   // after the run: it forgets passwords

const list = [];
const add = C.aiAdder('cv', list);   // shared/commands/commands.js

add('new_conversion', 'Start a new conversion', [{ name: 'to', type: 'string', maxLength: 120, description: 'optional: the format files added next start on (a kind like png, pdf, csv, or a conversion id)' }], (a) => {   // i18n-ignore: for the assistant (API)
  const t = notBusy(tool()), n = t.items.length;
  t.clear();
  if (a.to) t.setDefaultTarget(a.to);
  return `Cleared the list (${plural(n, 'file')} and the results removed)${a.to ? `; new files start on ${a.to} where they can` : ''}. Use add_files next.`;   // i18n-ignore: for the assistant (API)
}, { destructive: true, description: 'Clear the file list and the results to start a new conversion. Results not exported are dropped.' });   // i18n-ignore: for the assistant (API)

add('add_files', 'Add files', [   // i18n-ignore: hidden assistant command (API)
  { name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'Slop Drive file names or ids' },   // i18n-ignore: for the assistant (API)
  { name: 'urls', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'or addresses of files on this site' },   // i18n-ignore: for the assistant (API)
  { name: 'text', type: 'string', maxLength: 500000, description: 'or a text to convert (CSV, JSON, Markdown, YAML…)' },   // i18n-ignore: for the assistant (API)
  { name: 'name', type: 'string', maxLength: 200, default: 'pasted.txt', description: 'the text\'s file name; its extension says what it is (data.csv)' },
], async (a) => {
  const t = notBusy(tool()), S = window.SlopCmdSources, files = [];
  for (const q of a.files || []) files.push(await S.driveFile(q));   // a Drive record: the intake makes it a File
  for (const u of a.urls || []) { const r = await S.siteFile(u); files.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
  if (a.text) files.push(new File([a.text], a.name || 'pasted.txt', { type: 'text/plain' }));
  if (!files.length) throw new Error('Give files (Slop Drive names or ids), urls (files on this site) or text');
  const before = t.items.length;
  await t.addFiles(files, 'drive');
  const added = t.items.slice(before);
  if (!added.length) throw new Error('No file was added');
  return `Added ${added.map((i) => `${i.name} (${KIND_LABEL[i.kind] || i.kind} → ${labelOf(t.targetOf(i))})`).join(', ')}. Use set_target to change the format, then export_results.`;   // i18n-ignore: for the assistant (API)
}, { description: 'Add files from Slop Drive (or this site, or a text) to the list. Each starts on its usual format; set_target changes it.' });   // i18n-ignore: for the assistant (API)

add('list_targets', 'List the formats', [{ name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'only these files (names); default all' }], (a) => {   // i18n-ignore: hidden assistant command (API)
  const t = tool(), items = pick(t, a.files);
  if (!items.length) throw new Error('The list is empty: add_files first');
  const kinds = [...new Set(items.map((i) => i.kind))];
  const byKind = kinds.map((k) => ({ kind: k, targets: candidatesOf(t, items.find((i) => i.kind === k)) }));
  return { files: items.map((i) => ({ name: i.name, kind: i.kind, target: t.targetOf(i) })), byKind };
}, { macro: false, description: 'List the formats the files can become (conversion ids, labels, output kinds and options).' });   // i18n-ignore: for the assistant (API)
/** One file's choices: the single conversions and the routes ("More formats") the tool offers it. */
function candidatesOf(t, it) {
  const sel = t.items.map((i) => i.selected);
  t.items.forEach((i) => { i.selected = i === it; });
  try { return t.candidates().map((c) => ({ id: c.id, label: c.label, makes: c.ext || 'file', route: !!c.route, options: c.route ? undefined : optionInfo(c) })); }
  finally { t.items.forEach((i, n) => { i.selected = sel[n]; }); }
}

add('set_target', 'Choose the format', [   // i18n-ignore: hidden assistant command (API)
  { name: 'to', type: 'string', required: true, maxLength: 200, description: 'a kind (png, jpg, pdf, csv, json, mp3…), a conversion id (to-png) or a route from list_targets' },   // i18n-ignore: for the assistant (API)
  { name: 'files', type: 'array', maxItems: 200, items: { type: 'string' }, description: 'only these files (names); default all, and the files added later' },
  { name: 'options', type: 'json', maxLength: 4000, description: 'option values for that conversion, like {"quality": 80, "width": 800} (list_targets shows them)' },
], (a) => {
  const t = notBusy(tool()), items = pick(t, a.files);
  if (!items.length) throw new Error('The list is empty: add_files first');
  const set = [], skipped = [];
  for (const it of items) {
    const key = targetFor(it.kind, String(a.to).trim().toLowerCase(), t.only) || targetFor(it.kind, String(a.to).trim(), t.only);
    if (!key) { skipped.push(it.name); continue; }
    it.target = key; set.push(it);
  }
  if (!set.length) throw new Error(`None of these files can become ${a.to}. Use list_targets to see what they can become.`);
  if (!a.files || !a.files.length) t.defaultTarget = set[0].target;
  if (a.options && typeof a.options === 'object') {
    for (const it of set) { const conv = convOf(it.target); setValues([it], conv, { ...valuesOf(it, conv), ...optionValues(conv, a.options) }); }
  }
  t.render();
  return `${set.map((i) => i.name).join(', ')} → ${labelOf(set[0].target)}` + (a.options ? ` with ${JSON.stringify(a.options)}` : '') + (skipped.length ? `. ${skipped.join(', ')} cannot become ${a.to} and kept their format` : '') + '.';
}, { description: 'Choose what the files become, and that conversion\'s options. A format no single conversion makes goes by a route of several.' });   // i18n-ignore: for the assistant (API)

add('run_conversion', 'Convert', [], async () => {   // i18n-ignore: hidden assistant command (API)
  const t = notBusy(tool());
  if (!t.groups().length) throw new Error('Nothing to convert: add_files first');
  await convert(t);
  const bad = t.items.filter((i) => i.error);
  if (!t.outputs.length) throw new Error(bad.length ? `${bad[0].name}: ${bad[0].error}` : 'Nothing was converted');   // i18n-ignore: for the assistant (API)
  return `${plural(t.outputs.length, 'file')} ready: ${t.outputs.slice(0, 10).map((o) => `${o.name} (${o.blob.size} bytes)`).join(', ')}` + (bad.length ? `. ${bad.length} could not be converted (${bad[0].name}: ${bad[0].error})` : '') + '. Use export_results to keep them.';
}, { description: 'Convert every file with its own format and options. The results stay on the page until exported.' });   // i18n-ignore: for the assistant (API)

add('export_results', 'Export the results', [   // i18n-ignore: hidden assistant command (API)
  { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },   // i18n-ignore: for the assistant (API)
  { name: 'zip', type: 'boolean', default: false, description: 'one zip of all the results instead of separate files' },   // i18n-ignore: for the assistant (API)
], async (a) => {
  const t = notBusy(tool());
  if (t.groups().length && t.outputs.sig !== sig(t)) await convert(t);   // the results are for other files or choices: convert again
  const outs = t.outputs.filter((o) => !o.mid);
  if (!outs.length) throw new Error('Nothing is converted yet: add_files, then run_conversion');
  const files = a.zip && outs.length > 1 ? [{ name: 'slop-convert.zip', blob: await writeZip(outs.map((o) => ({ path: o.name, data: o.blob }))) }] : outs;
  const done = [];
  if (a.to !== 'download') {
    const H = window.SlopHub;
    if (!H) throw new Error('Slop Drive is not available here');
    for (const f of files) await H.put(f.blob, { name: f.name, from: 'convert' });
    done.push(`saved ${files.map((f) => f.name).slice(0, 10).join(', ')} to the File convert folder in Slop Drive`);
  }
  if (a.to !== 'drive') { for (const f of files) saveBlob(f.blob, f.name); done.push(`downloaded ${plural(files.length, 'file')}`); }
  return done.join(' and ').replace(/^./, (c) => c.toUpperCase()) + '.';
}, { description: 'Save the converted files to Slop Drive (other apps can open them there) and/or download them. Converts first when needed.' });   // i18n-ignore: for the assistant (API)

/** Option values without passwords or pictures (never in the state). */
const shown = (conv, v) => Object.fromEntries(Object.entries(v).filter(([k]) => { const o = conv.options.find((x) => x.key === k); return !o || !/^(password|image|watermark)$/.test(o.type); }));
function state() {
  const t = tool();
  return {
    app: 'File convert', busy: t.busy, page: t.only || 'all conversions', startsOn: t.defaultTarget || null,   // i18n-ignore: for the assistant (API)
    files: t.items.slice(0, 60).map((i) => {
      const key = t.targetOf(i), conv = convOf(key);
      return { name: i.name, kind: i.kind, bytes: i.size, target: key || null, makes: conv ? conv.ext || 'file' : null, options: conv ? shown(conv, valuesOf(i, conv)) : undefined, error: i.error || undefined };
    }),
    total: t.items.length,
    results: t.outputs.slice(0, 60).map((o) => ({ name: o.name, bytes: o.blob.size })),
  };
}
/** The files, their choices and the default as they are now: the rollback puts them back (the results are cleared). */
function checkpoint() {
  const t = tool(), items = t.items.map((i) => ({ i, target: i.target, opts: JSON.parse(JSON.stringify(i.opts || {})) })), def = t.defaultTarget;
  return () => {
    if (t.busy) return false;
    t.items = items.map((x) => Object.assign(x.i, { target: x.target, opts: x.opts }));
    t.defaultTarget = def; t.clearOutputs(); t.render();
    return true;
  };
}
if (C && !C.get('cv.ai.set-target')) {
  C.register(list); C.provide({ state, checkpoint });
}
