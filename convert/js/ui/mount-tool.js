/* mountTool: the whole converter in any element, for File convert's own pages and for a "Convert…" dialog in another app.
 *   const tool = mountTool(host, { files, preset, fixedTarget, compact, onResults, drop })
 *     host         the element to fill; it gets the tool's root class (.cv-tool), whose styles (css/tool.css) are scoped to
 *                  it and are added to the page when it has not loaded them
 *     files        File objects to start with (optional)
 *     preset       { conv, from, defaults, note, accept }: a converter page (one conversion, those input kinds)
 *     fixedTarget  a conversion id: the same as preset { conv: fixedTarget } with any input the conversion takes
 *     compact      a strip of a drop zone and no first-visit picture, for a dialog
 *     onResults    called with [{ name, blob, url }] after each Convert
 *     drop         with compact: SlopDrop options, e.g. { window: false, targets: [dialog] } so only the dialog takes drops
 *   Returns the ConvertTool (also host.convertTool). Ids are made per tool (cv-…, cv2-…), so several can share a page. */
import { ConvertTool } from './tool.js';

const CSS = new URL('../../css/tool.css', import.meta.url).href;

/** Adds css/tool.css unless the page has it (File convert's pages import it from convert.css): the --cv-tool token tells. */
function ensureStyles(host) {
  if (getComputedStyle(host).getPropertyValue('--cv-tool').trim()) return;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === CSS)) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: CSS }));
}

export function mountTool(host, { files = null, preset = null, fixedTarget = null, compact = false, onResults = null, drop = null } = {}) {
  if (!host) throw new TypeError('mountTool needs a host element');
  host.classList.add('cv-tool');
  host.classList.toggle('cv-compact', !!compact);
  ensureStyles(host);
  const p = preset || (fixedTarget ? { conv: fixedTarget, from: null, defaults: {}, note: '', accept: '' } : null);
  const tool = new ConvertTool(host, p, { compact: !!compact, onResults, drop });
  host.convertTool = tool;
  if (files && files.length) tool.ready = tool.addFiles(files, 'convert');
  else tool.ready = Promise.resolve();
  return tool;
}
