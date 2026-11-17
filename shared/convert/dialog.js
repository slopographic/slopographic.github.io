/* The Convert dialog: File convert's whole tool (convert/js/ui/mount-tool.js, the one converter UI) in a SlopUI dialog,
 * from any page. Wide screens get a large dialog; phones get the whole screen. Files dropped anywhere on it are added.
 *   const ctl = SlopConvert.open({ file, files, target, onPdf, ask, drive })
 *     file / files  File (or Blob with a name) to start with
 *     target        a conversion id to preselect for the files that can take it ('pdf-to-png' and 'pdf-to-jpg' are PDF to
 *                   images with that format)
 *     onPdf(outputs, names)  the app takes the PDF the files make: each file starts on the conversion that makes a PDF of
 *                   it, the files that cannot become one are named, and once Convert has made the PDFs the dialog closes and
 *                   hands them over
 *     ask           with no files given (the default then), the page's app is asked for what it has open (provided.js);
 *                   the dialog says where those came from, with Remove
 *     drive         kept for older callers: every result can be saved to Slop Drive or opened in another app (results.js)
 *   ctl.ready (resolves once the dialog is up with its files), ctl.done (when it closes), ctl.element, ctl.close(),
 *   ctl.results() -> [{ name, blob }], ctl.targets() -> the conversion ids every file can take, ctl.run(), ctl.tool
 * Nothing is uploaded. The header's Convert… button (shell/header.js) imports this module on its first click. */
import { mountTool } from '../../convert/js/ui/mount-tool.js';
import { conversionById, outKind } from '../../convert/js/core/catalog.js';
import { ownTargets } from '../../convert/js/ui/targets.js';
import { valuesOf, setValues } from '../../convert/js/ui/file-opts.js';
import { deps } from './load.js';
import { ask as askApp } from './provided.js';
import { addActions } from './results.js';

/** Targets the old dialog named on their own: PDF to PNG and PDF to JPG are PDF to images with the format fixed. */
const ALIAS = { 'pdf-to-png': ['pdf-to-images', { format: 'png' }], 'pdf-to-jpg': ['pdf-to-images', { format: 'jpg' }] };

/** The conversion that makes a PDF of one file of this kind (Images to PDF, Picture PDF, Text to PDF…), or ''. */
export function pdfMaker(kind) {
  const c = ownTargets(kind).find((x) => outKind(x) === 'pdf' && !x.from.includes('pdf') && !x.from.includes('*'));
  return c ? c.id : '';
}

const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const toast = (m) => { if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(m); };
/** The words (shared/i18n/ui/<code>/ai2.js). */
const T = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

class ConvertDialog {
  constructor(opts) {
    this.opts = opts;
    this.tool = null; this.box = null; this.provided = new Set();
    this.done = new Promise((r) => { this.resolveDone = r; });
    this.ready = this.start().catch((e) => { console.warn(e); toast(T('ui.convert.could_not_open', { error: String((e && e.message) || e) })); this.resolveDone(); });
  }

  async start() {
    const o = this.opts;
    await deps();
    let files = [...(o.files || []), ...(o.file ? [o.file] : [])].map((f) => (f instanceof File ? f : new File([f], f.name || 'file', { type: f.type || '' })));
    let from = null;
    if (!files.length && o.ask !== false) {
      from = await askApp();
      files = from.files;
      for (const f of files) this.provided.add(f);
    }
    const wrap = h('div', 'sl-cvt');
    this.fromBox = h('div', 'sl-cvt-from');
    this.pdfBox = h('p', 'sl-cvt-note sl-cvt-err');
    this.host = h('div', 'sl-cvt-tool');
    this.notes = h('div', 'sl-cvt-notes');
    wrap.append(this.fromBox, this.pdfBox, this.host, this.notes, h('p', 'sl-cvt-foot', T('ui.convert.foot')));
    this.dlg = window.SlopUI.dialog({ title: T('ui.convert.title'), body: wrap, cls: 'sl-cvt-dlg', onClose: () => this.closed() });
    this.box = this.dlg.box;
    const back = this.box.parentElement;
    // The dialog takes every file drop over it; the page under it sees none of them.
    for (const t of ['dragenter', 'dragover', 'dragleave', 'drop']) back.addEventListener(t, (e) => e.stopPropagation());
    this.tool = mountTool(this.host, { compact: true, files, onResults: (outs) => this.results(outs),
      drop: { window: false, targets: [back], paste: false } });
    this.host.addEventListener('cv:change', () => this.paintNotes());
    await this.tool.ready;
    this.preselect();
    this.paintFrom(from);
    const first = this.host.querySelector('.cv-to:not([disabled])') || this.host.querySelector('.cv-drop button');
    if (first) first.setAttribute('autofocus', '');
  }

  /** The target asked for (o.target), or with onPdf the conversion that makes each file a PDF. */
  preselect() {
    const t = this.tool, o = this.opts;
    if (o.onPdf) {
      for (const it of t.items) { const id = pdfMaker(it.kind); if (id) it.target = id; }
    } else if (o.target) {
      const [id, fixed] = ALIAS[o.target] || [o.target, null];
      const conv = conversionById(id);
      if (conv) {
        t.setDefaultTarget(id);
        for (const it of t.items) {
          if (!ownTargets(it.kind).some((c) => c.id === id)) continue;
          it.target = id;
          if (fixed) setValues([it], conv, { ...valuesOf(it, conv), ...fixed });
        }
      }
    }
    t.render();
  }

  /** "From Slop Sheets: Budget.xlsx", with Remove: the files the app handed over. */
  paintFrom(from) {
    const left = this.tool ? this.tool.items.filter((i) => this.provided.has(i.file)) : [];
    this.fromBox.replaceChildren();
    this.fromBox.hidden = !left.length;
    if (!left.length || !from) return;
    const rm = h('button', 'cv-btn cv-small sl-cvt-from-rm', T('ui.remove'));
    rm.type = 'button';
    rm.setAttribute('aria-label', T('ui.convert.remove_from', { app: from.app }));
    rm.addEventListener('click', () => {
      this.tool.items = this.tool.items.filter((i) => !this.provided.has(i.file));
      this.provided.clear();
      this.tool.render();
      this.paintFrom(from);
      const b = this.host.querySelector('.cv-drop button');
      if (b) b.focus();
    });
    this.fromBox.append(h('span', 'sl-cvt-from-txt', T('ui.convert.from', { app: from.app, files: left.map((i) => i.name).join(', ') })), rm);
  }

  /** The notes of the conversions in use (how faithful each one is), and with onPdf the files that cannot become a PDF. */
  paintNotes() {
    const t = this.tool;
    if (!t) return;
    const seen = new Set(), list = [];
    for (const g of t.groups()) if (g.conv.note && !seen.has(g.conv.note)) { seen.add(g.conv.note); list.push(h('p', 'sl-cvt-note', `${g.conv.label}: ${g.conv.note}`)); }
    this.notes.replaceChildren(...list);
    const bad = this.opts.onPdf ? t.items.filter((i) => !pdfMaker(i.kind)) : [];
    this.pdfBox.hidden = !bad.length;
    this.pdfBox.textContent = bad.length ? T('ui.convert.no_pdf', { files: bad.map((i) => '“' + i.name + '”').join(', ') }) : '';
    if (this.provided.size && !t.items.some((i) => this.provided.has(i.file))) { this.provided.clear(); this.fromBox.hidden = true; }
  }

  /** After Convert: with onPdf and every file made into a PDF, they go to the app; otherwise each result gets its actions. */
  results(outs) {
    const t = this.tool, o = this.opts;
    if (o.onPdf && outs.length && !t.items.some((i) => i.error) && t.groups().every((g) => outKind(g.conv, t.valuesOf(g.items[0], g.conv)) === 'pdf')) {
      const names = t.items.map((i) => i.name), files = outs.map((x) => ({ name: x.name, blob: x.blob }));
      this.close();
      o.onPdf(files, names);
      return;
    }
    const app = window.SlopShell && window.SlopShell.currentApp;
    addActions(t.ui.outList, outs, { from: (app && app.id) || 'convert' });
  }

  close() { if (this.dlg) this.dlg.close(false); }
  closed() {
    if (this.tool) { try { this.tool.destroy(); this.tool.clearOutputs(); } catch (e) { /* already gone */ } }
    this.resolveDone();
  }

  api() {
    const self = this;
    return {
      ready: this.ready, done: this.done,
      get element() { return self.box; },
      get tool() { return self.tool; },
      close: () => this.close(),
      results: () => (this.tool ? this.tool.outputs.map((x) => ({ name: x.name, blob: x.blob })) : []),
      targets: () => (this.tool ? this.tool.targets() : []),
      run: () => (this.tool ? this.tool.run() : Promise.resolve()),
    };
  }
}

/** Opens the dialog. Returns the controller (see the top of this file). */
export function open(opts = {}) {
  return new ConvertDialog(opts).api();
}

window.SlopConvert = Object.assign(window.SlopConvert || {}, { open });
