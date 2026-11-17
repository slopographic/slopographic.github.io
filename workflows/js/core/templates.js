/* Slop Workflows: the ready-made workflows (Templates in the list). Each is a workflow document (shared/ops/flowdoc.js
 * shape) with a short line saying what it is for. Loading one makes a copy: the template itself never changes. */
import { tr } from './text.js';

export const TEMPLATES = [
  { id: 'product-photos', name: 'Product photos', blurb: 'Cut out the product, put it on white, square 1080 px, your watermark, JPG.',   // i18n-ignore: the English source, shown through tplName (workflows.tpl.*)
    steps: [
      { id: 'slopisolate.remove-bg', options: { model: 'fast', background: 'transparent' } },
      { id: 'slopisolate.background', options: { color: '#ffffff' } },
      { id: 'resize.image', options: { mode: 'size', width: 1080, height: 1080, fit: 'fit', background: 'color', bgColor: '#ffffff', format: 'png' } },
      { id: 'watermark.apply', options: { mark: 'text', text: '© Your shop', position: 'br', opacity: 60 } },
      { id: 'to-jpg', options: { quality: 90, background: '#ffffff' } },
    ] },
  { id: 'web-photos', name: 'Photos for the web', blurb: 'Remove the location and camera details, longest side 1600 px, WebP.',   // i18n-ignore: the English source, shown through tplName (workflows.tpl.*)
    steps: [
      { id: 'clean.metadata', options: { remove: 'app' } },
      { id: 'resize.image', options: { mode: 'long', long: 1600, format: 'png' } },
      { id: 'to-webp', options: { quality: 82 } },
    ] },
  { id: 'scans-pdf', name: 'Scans to one PDF', blurb: 'Photos or scans of pages become one A4 PDF, then a smaller file.',   // i18n-ignore: the English source, shown through tplName (workflows.tpl.*)
    steps: [
      { id: 'images-to-pdf', options: { page: 'a4', margin: 18 } },
      { id: 'pdf.compress', options: { mode: 'lossless' } },
    ] },
  { id: 'protect-send', name: 'Protect and send', blurb: 'Several PDFs merged into one, locked with a password.',   // i18n-ignore: the English source, shown through tplName (workflows.tpl.*)
    steps: [
      { id: 'merge-pdf', options: {} },
      { id: 'pdf-protect', options: { allowPrint: true, allowCopy: false, allowEdit: false } },
    ] },
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;
/** The string key of a template's name or blurb (workflows/i18n): workflows.tpl.product_photos, …_blurb. */
export const tplKey = (t, part) => `workflows.tpl.${t.id.replace(/-/g, '_')}${part === 'blurb' ? '_blurb' : ''}`;
/** A template's name and blurb in the page's language (English where the workflows tables are not loaded). */
export const tplName = (t) => tr(tplKey(t, 'name'), t.name);
export const tplBlurb = (t) => tr(tplKey(t, 'blurb'), t.blurb);

/** A workflow document from a template (a fresh copy, with new step ids), named in the page's language. */
export function fromTemplate(t, F) {
  return F.normalize({ kind: 'slopflow', v: 1, name: tplName(t), steps: t.steps.map((s) => ({ kind: 'op', id: s.id, options: { ...s.options } })) }).doc;
}
