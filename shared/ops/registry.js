/* The operation registry: one list of every file operation on the site, files in → files out, with one option schema.
 * File convert's catalog (convert/js/core/catalog.js) registers its conversions here (app 'convert'); apps register their
 * own headless operations (shared/ops/*.js: SlopIsolate's background removal, Watermark, Resize…). File convert shows
 * only its own entries (CONVERSIONS); Slop Workflows shows them all, grouped by app. Runs are done by the one runner,
 * convert/js/core/chain-run.js. Pure: no DOM, so Node tests import it.
 *
 * An operation (the catalog's entry shape, plus app fields):
 *   { id, label, group, app, kind: 'op' | 'macro', from: [kinds] ('*' = any), ext (the kind it makes; none = the input's),
 *     out?(inKind, opts) → kind, mode: 'each' | 'combine', options: [option], run(files, opts, { signal, progress }) →
 *     [{ name, blob, kind? }], notice?, engine?, secret?, keywords?, description?, check?(opts) → problem text,
 *     fromApp?(settings) → options (the app's "Add to a workflow…" hook) }
 *   option: { key, type: number | range | select | checkbox | color | text | password | image | watermark (a spec, as JSON), label, value, min, max,
 *             step, options: [[value, label]], hint, placeholder }
 *   kind 'macro': an app's recorded macro, run by an app host adapter (provide()): its run() opens the app headlessly,
 *   replays the macro and hands the files back. Its options come from the macro definition. See workflows/HANDOFF.md.
 *
 *   register(list, { app })        add or replace operations (an id is unique across apps)
 *   provide(app, { label, list })  an app host adapter: list() → its operations (macros), asked each time the list is read
 *   all({ app })                   every operation, or one app's (File convert: all({ app: 'convert' }))
 *   byId(id)                       one operation, or null
 *   apps()                         [{ app, label, ops }] in registration order: the step menu's groups
 *   accepts(op, kind)              the operation takes that kind
 *   outOf(op, inKind, opts)        the kind it makes from inKind with these option values
 *   defaultsOf(op)                 { key: default value }
 *   argsOf(op)                     the option schema as SlopCmd arguments (shared/commands/args.js): the AI's view
 *   validateOptions(op, raw)       { ok, options, errors, notes }: through SlopCmdArgs.validate, so a typed "1080px"
 *                                  becomes 1080, a number is clamped, an unknown key is dropped with a note */
import '../commands/args.js';
import { stepWords } from './i18n.js';

const OPS = [];
const BY = new Map();
const PROVIDERS = new Map();
const LABELS = new Map([['convert', 'File convert']]);
const ORDER = ['convert'];

export const STEP_KINDS = ['op', 'macro'];

/** The app's label for the step menu ('slopisolate' → 'SlopIsolate'), as given when it registered (a function: read now). */
export const appLabel = (app) => { const l = LABELS.get(app); return (typeof l === 'function' ? l() : l) || app; };

export function register(list, { app = 'convert', label } = {}) {
  if (label) LABELS.set(app, label);
  if (!ORDER.includes(app)) ORDER.push(app);
  for (const op of list) {
    op.app = op.app || app;
    op.kind = op.kind || 'op';
    op.options = op.options || [];
    op.mode = op.mode || 'each';
    stepWords(op);   // label and description from the step's id (shared/ops/i18n.js) unless it names its own
    if (BY.has(op.id)) OPS.splice(OPS.indexOf(BY.get(op.id)), 1, op); else OPS.push(op);
    BY.set(op.id, op);
  }
  return list;
}

export function provide(app, adapter) {
  if (adapter && adapter.label) LABELS.set(app, adapter.label);
  if (!ORDER.includes(app)) ORDER.push(app);
  PROVIDERS.set(app, adapter);
}

function provided() {
  const out = [];
  for (const [app, p] of PROVIDERS) {
    let list = [];
    try { list = (p.list && p.list()) || []; } catch (e) { list = []; }
    for (const op of list) out.push(Object.assign({ app, kind: 'macro', mode: 'each', options: [] }, op));
  }
  return out;
}

export function all({ app } = {}) {
  const list = OPS.concat(provided());
  return app ? list.filter((o) => o.app === app) : list;
}

export const byId = (id) => BY.get(id) || provided().find((o) => o.id === id) || null;

export function apps() {
  const list = all();
  return ORDER.map((app) => ({ app, label: appLabel(app), ops: list.filter((o) => o.app === app) })).filter((g) => g.ops.length);
}

export const accepts = (op, kind) => !!op && (op.from.includes('*') || op.from.includes(kind) || (op.with || []).includes(kind));

export function outOf(op, inKind, opts = {}) {
  if (!op) return '';
  if (typeof op.out === 'function') return op.out(inKind, opts || {}) || inKind;
  const f = (op.options || []).find((o) => o.key === 'format' && o.type === 'select');
  if (f) { const v = opts && opts.format !== undefined && opts.format !== '' ? opts.format : f.value; if (typeof v === 'string' && v) return v; }
  return op.ext || inKind || 'file';
}

export function defaultsOf(op) {
  const out = {};
  for (const o of (op && op.options) || []) if (o.value !== undefined) out[o.key] = o.value;
  return out;
}

/** One catalog option as a SlopCmd argument. */
function argOf(o) {
  const a = { name: o.key, description: o.label + (o.hint ? `. ${o.hint}` : '') };
  if (o.type === 'number' || o.type === 'range') Object.assign(a, { type: 'number', min: o.min, max: o.max, step: o.step });
  else if (o.type === 'select') Object.assign(a, { type: 'enum', options: o.options });
  else if (o.type === 'checkbox') a.type = 'boolean';
  else if (o.type === 'color') a.type = 'color';
  else Object.assign(a, { type: 'string', maxLength: o.type === 'image' || o.type === 'watermark' ? 4e6 : 2000 });
  if (o.value !== undefined && o.value !== '') a.default = o.value;
  return a;
}
export const argsOf = (op) => ((op && op.options) || []).map(argOf);

export function validateOptions(op, raw = {}) {
  const A = globalThis.SlopCmdArgs;
  const given = {};
  for (const [k, v] of Object.entries(raw || {})) if (v !== undefined) given[k] = v;   // a blank number field is "not set"
  const r = A.validate(argsOf(op), given);
  // a select's value keeps the catalog's own type (2, not '2'): the runners compare with ===
  for (const o of op.options) if (o.type === 'select' && r.args[o.key] !== undefined) {
    const hit = o.options.find(([v]) => String(v) === String(r.args[o.key]));
    if (hit) r.args[o.key] = hit[0];
  }
  return { ok: r.ok, options: r.args, errors: r.errors, notes: r.notes };
}
