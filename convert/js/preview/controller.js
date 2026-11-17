/* Keeps a preview block in step with a ConvertTool. Updates are debounced (150 ms) and a stale result is
 * dropped. Copy, Swap and Download run the whole conversion, so the preview's first-part limits never reach
 * the file. Browser only. */
import { tr, onLang } from '../core/i18n.js';
import { conversionById } from '../core/catalog.js';
import { writeZip } from '../io/zip.js';
import { saveBlob } from '../io/files.js';
import { buildPreview, pickInputs } from './model.js';
import { buildRoutePreview, runRouteFull } from './chain.js';   // a route of several conversions
import { createView } from './view.js';
import { acceptsText, REVERSE, DEBOUNCE_MS } from './spec.js';

/** A PNG copy of any picture the browser can draw, for the clipboard (which takes PNG). */
async function toPng(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('convert.pv.no_copy_pic')))), 'image/png'));
}

export class PreviewPanel {
  /** block: the preview element. tool: the ConvertTool. root: the tool's root, which emits 'cv:change'. */
  constructor(block, tool, root) {
    this.tool = tool;
    this.seq = 0;
    this.timer = 0;
    this.model = null;
    this.dirty = true;
    this.conv = null;
    const textOk = !tool.preset || acceptsText(conversionById(String(tool.preset.conv).split(/[>@]/)[0]));   // a route: its first step
    this.view = createView(block, { input: textOk });
    const v = this.view;
    if (v.ta) v.ta.addEventListener('input', () => tool.setText(v.ta.value));
    root.addEventListener('cv:change', () => this.schedule());
    v.copy.addEventListener('click', () => this.copy());
    v.swap.addEventListener('click', () => this.swap());
    v.download.addEventListener('click', () => this.download());
    this.update();
    onLang(() => { this.dirty = true; this.update(); });   // a language change: the notes and labels again in the new language
  }

  schedule() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(), DEBOUNCE_MS);
  }

  /** Keeps the text box in step with the tool: a file is the input when there is one, and cleared typed text
   * stays cleared. */
  syncInput() {
    const ta = this.view.ta;
    if (!ta) return;
    const items = this.tool.items;
    if (!items.some((i) => i.pasted) && ta.value !== '') ta.value = '';
    const fileInput = items.some((i) => !i.pasted);
    ta.disabled = fileInput;
    this.view.taHint.textContent = fileInput ? tr('convert.pv.file_is_input') : tr('convert.pv.type_hint');
  }

  async update() {
    const id = ++this.seq;
    this.dirty = false;
    this.syncInput();
    const { conv, items, opts, steps } = this.tool.previewState();
    this.conv = conv;
    this.route = !!steps;
    if (!conv || !items.length) {
      this.model = null;
      this.view.empty(this.tool.items.length ? tr('convert.pv.no_conv') : tr('convert.pv.add_file'));
      this.setActions(null);
      return;
    }
    this.view.setStatus(tr('convert.pv.updating'));
    const model = steps ? await buildRoutePreview(steps, items) : await buildPreview(conv, items, opts);
    if (id !== this.seq) return;
    this.model = model;
    this.view.render(model);
    this.view.setStatus(tr('convert.pv.up_to_date'));
    this.setActions(model);
  }

  setActions(model) {
    const v = this.view, after = model && model.after;
    const text = !!after && after.kind === 'text';
    const picture = !!after && after.kind === 'image';
    v.copy.disabled = !(text || picture);
    v.swap.hidden = !(text && !this.route && REVERSE[this.conv && this.conv.id]);
    v.download.disabled = !model || !!model.secret;   // a password conversion downloads from Convert, which then forgets the password
  }

  /** The whole conversion of the previewed items, as Download would run it. Reuses the preview when it was whole. */
  async full() {
    if (this.model && this.model.outputs && !this.dirty) return this.model.outputs;
    const { conv, items, opts, steps } = this.tool.previewState();
    if (!conv || !items.length) return [];
    if (steps) return runRouteFull(steps, items);
    return conv.run(pickInputs(conv, items).map(({ name, file, kind }) => ({ name, file, kind })), opts);
  }

  async fullText() {
    const outs = await this.full();
    return outs[0] ? outs[0].blob.text() : '';
  }

  async copy() {
    const after = this.model && this.model.after;
    if (!after) return;
    try {
      if (after.kind === 'text') await navigator.clipboard.writeText(await this.fullText());
      else if (after.kind === 'image') {
        const [out] = await this.full();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': await toPng(out.blob) })]);
      } else return;
      this.view.setStatus(tr('convert.pv.copied'));
    } catch (e) {
      this.view.setStatus(tr('convert.pv.copy_failed', { why: e.message || String(e) }));
    }
  }

  /** Feeds the output back in as the input of the reverse conversion (Base64, URL, JSON and CSV). */
  async swap() {
    const id = this.conv && this.conv.id;
    const rev = conversionById(REVERSE[id]);
    if (!rev) return;
    try {
      const text = await this.fullText();
      this.tool.swapText(text, rev);
      if (this.view.ta) this.view.ta.value = text;
      this.view.setStatus(tr('convert.pv.swapped', { name: rev.label }));
    } catch (e) {
      this.view.setStatus(tr('convert.pv.swap_failed', { why: e.message || String(e) }));
    }
  }

  async download() {
    this.view.setStatus(tr('convert.pv.converting'));
    try {
      const outs = await this.full();
      if (!outs.length) throw new Error(tr('convert.pv.nothing'));
      if (outs.length === 1) saveBlob(outs[0].blob, outs[0].name);
      else saveBlob(await writeZip(outs.map((o) => ({ path: o.name, data: o.blob }))), 'slop-convert.zip');
      this.view.setStatus(tr('convert.pv.started'));
    } catch (e) {
      this.view.setStatus(tr('convert.pv.convert_failed', { why: e.message || String(e) }));
    }
  }
}
