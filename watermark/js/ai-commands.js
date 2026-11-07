/* Slop Watermark for the assistant: SlopCmd commands with argument schemas. The watermark's options and their mapping to
 * the watermark spec are the Workflows operation's (shared/ops/watermark.js WATERMARK_OPTIONS = SlopWatermarkSpec.OPTIONS,
 * fromOptions / toOptions in shared/watermark/spec-convert.js; the schema through the registry's argsOf), so the
 * assistant, the page and Slop Workflows mean the same by each one. The work is the page's own: WMItems.add,
 * WMSettings.spec / set, WMApp.applyAll. ES module, imported by commands.js.
 *   wm.ai.new-batch          new_batch          (none)                destructive: drops results not saved
 *   wm.ai.add-pictures       add_pictures       files[], urls[]       pictures, videos and PDFs
 *   wm.ai.set-watermark      set_watermark      the operation's options (mark text | logo, text, font, colour, size…)
 *   wm.ai.set-logo           set_logo           file | url
 *   wm.ai.apply-watermark    apply_watermark    (none) writes every picture and waits
 *   wm.ai.save-results       save_results       to drive | download | both */
import { argsOf } from '../../shared/ops/registry.js';
import { WATERMARK_OPS } from '../../shared/ops/watermark.js';

const C = window.SlopCmd, A = window.WMApp, I = window.WMItems, S = window.WMSettings, SP = window.SlopWatermarkSpec;
const OP = WATERMARK_OPS[0];
const notBusy = () => { if (A.busy()) throw new Error('Apply to all is running; wait for it first'); };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// the operation's options, without their defaults (a command changes only what it is given), without the logo picture
// (set_logo) and without a whole saved watermark (spec)
const ARGS = argsOf(OP).filter((a) => a.name !== 'logo' && a.name !== 'spec').map((a) => {
  const o = Object.assign({}, a); delete o.default;
  if (o.name === 'mark') o.options = o.options.filter(([v]) => v !== 'both');
  return o;
});

async function filesOf(a) {
  const src = window.SlopCmdSources, out = [];
  for (const q of a.files || []) { const r = await src.driveFile(q); out.push(new File([r.blob], r.name, { type: r.type || r.blob.type || '' })); }
  for (const u of a.urls || []) { const r = await src.siteFile(u); out.push(new File([r.blob], r.name, { type: r.blob.type || '' })); }
  if (!out.length) throw new Error('Give files (Slop Drive names or ids) or urls (files on this site)');
  return out;
}
async function addPictures(a) {
  notBusy();
  const ok = [], bad = [];
  for (const f of await filesOf(a)) { try { await I.add(f); ok.push(f.name); } catch (e) { bad.push(`${f.name}: ${e.message}`); } }
  A.refresh();
  if (!ok.length) throw new Error('No file could be added (' + bad.join('; ') + ')');
  return `Added ${plural(ok.length, 'picture', 'pictures')} (${I.count()} in the list).` + (bad.length ? ` Not added: ${bad.join('; ')}.` : '');
}
const logoLayer = (spec) => spec.layers.find((L) => L.kind === 'logo') || null;
const mainLayer = (spec) => spec.layers.find((L) => L.show) || spec.layers[0] || null;
/** The flat options of the watermark now: a saved watermark with several layers starts from the defaults. */
function flatNow() {
  const o = SP.toOptions(S.spec());
  return o.spec ? {} : o;
}
function said() {
  const L = mainLayer(S.spec());
  if (!L) return 'The watermark is empty.';
  return `The watermark is ${L.kind === 'logo' ? 'the logo' : `“${L.text}”`}, ${Math.round(L.opacity * 100)}% opaque, at ${L.position}${L.tile ? ', tiled' : ''}${L.rotate ? `, turned ${L.rotate}°` : ''}.`
    + (L.kind === 'logo' && !L.logo ? ' Set the logo with set_logo.' : '');
}
function setWatermark(a) {
  notBusy();
  if (!Object.keys(a).length) throw new Error('Nothing to change: give text, size, opacity, position…');
  const cur = flatNow(), mark = a.mark || cur.mark || 'text', logo = logoLayer(S.spec());
  const want = Object.assign(cur, a, { mark, logo: logo ? logo.logo : '' });
  if (a.size != null && mark === 'logo' && a.logoSize == null) want.logoSize = a.size;
  let spec = SP.fromOptions(want);
  const nl = logoLayer(spec);
  if (nl && logo) spec = SP.updateLayer(spec, nl.id, { logoName: logo.logoName, logoW: logo.logoW, logoH: logo.logoH });
  S.set(spec);
  return said();
}
async function setLogo(a) {
  notBusy();
  const p = await window.SlopCmdSources.picture({ file: a.file, url: a.url });
  const patch = { logo: p.dataUrl, logoName: p.name, logoW: p.w, logoH: p.h }, cur = logoLayer(S.spec());
  if (cur) S.set(SP.updateLayer(S.spec(), cur.id, patch));
  else { const sp = SP.fromOptions(Object.assign(flatNow(), { mark: 'logo', logo: p.dataUrl })); S.set(SP.updateLayer(sp, logoLayer(sp).id, patch)); }
  return `The logo is ${p.name} (${p.w} × ${p.h} px).`;
}
async function apply() {
  notBusy();
  if (!I.count()) throw new Error('The list is empty: add_pictures first');
  const problem = SP.check(S.spec());
  if (problem) throw new Error(problem + ' (set_watermark, or set_logo for a logo)');
  await A.applyAll();
  const done = I.all().filter((x) => x.out), failed = I.all().filter((x) => x.error);
  if (!done.length) throw new Error('Nothing was written' + (failed.length ? ': ' + failed[0].error : ''));
  return `Watermarked ${plural(done.length, 'picture', 'pictures')}: ${done.slice(0, 5).map((x) => x.out.name).join(', ')}${done.length > 5 ? ', …' : ''}.` + (failed.length ? ` ${failed.length} failed.` : '');
}
async function saveResults(a) {
  notBusy();
  const done = I.all().filter((x) => x.out);
  if (!done.length) throw new Error('Nothing is watermarked yet: run apply_watermark first');
  const out = [];
  if (a.to !== 'download') {
    const ids = [];
    for (const x of done) ids.push(await window.SlopCmdSources.put(x.out.blob, x.out.name, 'watermark'));
    out.push(`Saved ${plural(ids.length, 'picture', 'pictures')} to Slop Drive (${done.slice(0, 5).map((x, i) => `${x.out.name}, id ${ids[i]}`).join('; ')})`);
  }
  if (a.to !== 'drive') { await A.downloadZip(); out.push(`downloaded ${window.WMExport.ZIP_NAME}`); }
  return out.join(' and ') + '.';
}
function state() {
  const sp = S.spec(), o = SP.toOptions(sp), logo = logoLayer(sp);
  if (o.logo) o.logo = '(set)';
  return { app: 'Slop Watermark', busy: A.busy(), setup: o.spec ? { layers: sp.layers.map((L) => SP.label(L)) } : o, logo: logo && logo.logo ? logo.logoName || '(set)' : null,
    pictures: I.all().slice(0, 40).map((x) => ({ name: x.name, kind: x.media, width: x.w, height: x.h, output: x.out ? x.out.name : null, error: x.error || null })), count: I.count() };
}
function checkpoint() {
  const snap = S.spec();   // set() makes a new spec each time: this one stays as it is
  return () => { if (A.busy()) return false; S.set(snap); return true; };
}

const base = { group: 'AI', hidden: true };
const FILES = [{ name: 'files', type: 'array', maxItems: 500, items: { type: 'string' }, description: 'Slop Drive file names or ids' },
  { name: 'urls', type: 'array', maxItems: 50, items: { type: 'string' }, description: 'or addresses of files on this site' }];
C.register([
  Object.assign({ id: 'wm.ai.new-batch', tool: 'new_batch', title: 'Start a new batch', destructive: true, args: [],
    run: () => { notBusy(); const n = I.count(); A.clearAll(); return `Emptied the list (${plural(n, 'picture', 'pictures')} removed; the setup stays).`; },
    description: 'Empty the list of files to start a new batch (results not saved are dropped).' }, base),
  Object.assign({ id: 'wm.ai.add-pictures', tool: 'add_pictures', title: 'Add files', destructive: false, args: FILES, run: addPictures,
    description: 'Add pictures, videos or PDFs from Slop Drive to the list.' }, base),
  Object.assign({ id: 'wm.ai.set-watermark', tool: 'set_watermark', title: 'Set the watermark', destructive: false, args: ARGS, run: setWatermark,
    description: OP.description + ' Only the options given change.' }, base),
  Object.assign({ id: 'wm.ai.set-logo', tool: 'set_logo', title: 'Set the logo', destructive: false,
    args: [{ name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive picture (PNG with a see-through background looks best)' }, { name: 'url', type: 'string', maxLength: 500, description: 'or a picture on this site' }],
    run: setLogo, description: 'Use a picture as the watermark logo.' }, base),
  Object.assign({ id: 'wm.ai.apply-watermark', tool: 'apply_watermark', title: 'Apply to all', destructive: false, args: [], run: apply,
    description: 'Watermark every file in the list (pictures, videos, PDFs) and wait until it is done.' }, base),
  Object.assign({ id: 'wm.ai.save-results', tool: 'save_results', title: 'Save the results', destructive: false,
    args: [{ name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a ZIP download'], ['both', 'both']], default: 'drive' }], run: saveResults,
    description: 'Save the watermarked files to Slop Drive and/or download them as a ZIP.' }, base),
]);
C.provide({ state, checkpoint });
