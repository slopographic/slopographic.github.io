/* Builds the converter's markup inside a container and returns the elements the controller needs.
 * Used by the hub and by every converter page, so they all behave the same. */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import { conversionById, outKind } from '../core/catalog.js';
import { isRoute, stepsOf } from '../core/chain.js';
import '../../../shared/ui/flow.js';   // window.SlopFlow: the "PDF → DOCX" picture at the top of the tool
import '../../../shared/raw/tiff.js';
import '../../../shared/raw/detect.js';   // camera RAW extensions for the file picker (often no MIME type)

/** ns: the id prefix of this tool ('cv' for the first on a page, 'cv2' and on for more), so two tools can share a page. */
export function buildTool(root, preset, { ns = 'cv', compact = false } = {}) {
  const id = (s) => `${ns}-${s}`;
  // The drop zone's content (message, Choose files button, progress) is drawn by SlopDrop (shared/drop) in tool.js.
  const drop = h('div', { class: 'cv-drop', id: id('drop') });
  const input = h('input', { type: 'file', multiple: true, id: id('input'), class: 'cv-sr', tabindex: -1, 'aria-hidden': 'true', accept: preset && preset.accept ? preset.accept : 'image/*,video/*,audio/*,application/pdf,.heic,.heif,.csv,.tsv,.vcf,.vcard,.xlsx,.ods,.json,.yaml,.yml,.toml,.srt,.vtt,.md,.markdown,.txt,.html,.htm,text/csv,application/json,text/markdown,text/plain,text/html,.se,.si,.sie,.ofx,.qfx,.qif,.sta,.mt940,.940,.xml,.eml,.ics,.zip,.opus,.flac,.m4a,' + globalThis.SlopRawDetect.ACCEPT }); // intake-ok: the drop zone's own Choose files input (SlopDrop.attach input, through the intake)
  const list = h('ul', { class: 'cv-files', id: id('list'), 'aria-label': tr('convert.tool.files_to_convert'), 'data-i18n-attr': 'aria-label:convert.tool.files_to_convert' });
  // Select all, and for the selected rows: "N selected · Convert to [..] · Remove" (bulk.js).
  const bulk = h('div', { class: 'cv-bulk', id: id('bulk'), role: 'group', 'aria-label': tr('convert.bulk.selected_files'), 'data-i18n-attr': 'aria-label:convert.bulk.selected_files', hidden: true });
  // Each file has its own target and its own options (file-row.js, file-opts.js); the bulk bar sets several at once.
  const note = h('p', { class: 'cv-note', id: id('note'), 'aria-live': 'polite' });
  const run = h('button', { type: 'submit', class: 'cv-btn cv-primary', id: id('run'), disabled: true }, tr('convert.tool.convert'));
  const clear = h('button', { type: 'button', class: 'cv-btn', id: id('clear'), 'data-i18n': 'convert.tool.clear' }, tr('convert.tool.clear'));
  const form = h('form', { class: 'cv-form', id: id('form'), 'aria-label': tr('convert.tool.settings'), 'data-i18n-attr': 'aria-label:convert.tool.settings' },
    note,
    h('div', { class: 'cv-actions' }, run, clear));
  const status = h('p', { class: 'cv-status', id: id('status'), role: 'status' });
  const zip = h('button', { type: 'button', class: 'cv-btn', id: id('zip'), hidden: true, 'data-i18n': 'convert.tool.zip_all' }, tr('convert.tool.zip_all'));
  const outList = h('ul', { class: 'cv-out', id: id('out'), 'aria-label': tr('convert.tool.converted_files'), 'data-i18n-attr': 'aria-label:convert.tool.converted_files' });
  const results = h('section', { class: 'cv-results', 'aria-labelledby': id('res-h'), hidden: true },
    h('div', { class: 'cv-res-head' }, h('h2', { id: id('res-h'), 'data-i18n': 'convert.tool.converted' }, tr('convert.tool.converted')), zip), outList);
  const picked = preset ? h('p', { class: 'cv-page-note' }, preset.note || '') : null;
  const flow = window.SlopFlow.create({ size: compact ? 'md' : 'lg' });
  const flowBox = h('div', { class: 'cv-flow' }, flow.el);
  // replaceChildren turns null into the text "null", so an absent note is left out.
  root.replaceChildren(
    flowBox,
    ...(picked ? [picked] : []),
    drop, input,
    h('section', { class: 'cv-section', 'aria-label': tr('convert.tool.files'), 'data-i18n-attr': 'aria-label:convert.tool.files' }, bulk, list),
    form, status, results);
  return { drop, input, list, bulk, note, run, clear, form, status, zip, outList, results, flow, flowBox };
}

/** What an empty page shows in the drop zone (SlopDrop's preview): the hub shows a CSV becoming an XLSX and offers a
 *  sample price list (shared/samples/docs.js); a converter page has its pair drawn above, so it shows the steps. */
export function firstVisit(tool) {
  const p = tool.preset, tag = (k) => window.SlopFlow.tag(k);
  if (p) {
    const conv = conversionById(p.conv) || (isRoute(p.conv) ? stepsOf(p.conv).pop().conv : null), to = conv ? tag(outKind(conv, p.defaults)) : '';
    const drop = p.from ? tr('convert.tool.step_drop_kinds', { kinds: p.from.map(tag).join(tr('convert.tool.or')) }) : tr('convert.tool.step_drop_your');
    const get = to ? tr('convert.tool.step_get_kind', { kind: to }) : tr('convert.tool.step_get_new');
    return { preview: { steps: [drop, tr('convert.tool.step_check'), get] } };
  }
  const S = window.SlopSamples;
  return {
    preview: { picture: { flow: { from: 'csv', to: 'xlsx' } }, steps: [tr('convert.tool.hub_step_drop'), tr('convert.tool.hub_step_pick'), tr('convert.tool.hub_step_get')] },
    sample: S && S.docs ? { label: tr('convert.tool.sample'), files: () => { tool.wantTarget = 'csv-to-xlsx'; return [S.docs.csv()]; } } : undefined,
  };
}

/** After a language change: the drop zone's hint, first-visit steps and sample button, and Convert in a compact tool
 *  (the frame's panel relabels its own Convert). The rest is drawn again by render(). */
export function relabelTool(tool) {
  const ui = tool.ui, msg = ui.drop.querySelector('.sd-msg'), hint = msg && msg.nextElementSibling;
  if (hint && hint.tagName === 'P') hint.textContent = tr('convert.tool.drop_hint');
  const fv = tool.opts.compact ? null : firstVisit(tool);
  const lis = ui.drop.querySelectorAll('.sd-steps li');
  if (fv) fv.preview.steps.forEach((t, i) => { if (lis[i]) lis[i].textContent = t; });
  const sample = ui.drop.querySelector('.sd-sample');
  if (sample && fv && fv.sample) sample.textContent = fv.sample.label;
  if (!tool.side) ui.run.textContent = tr('convert.tool.convert');
}
