/* File convert's page layout, the suite rule (shared/frame/HANDOFF.md): the files on the left (the view: the flow picture,
 * the drop zone, the cards and the bulk bar) and a panel on the right with the summary, the converted files and Convert
 * (+ Clear) at its foot (shared/frame: SlopFrame.mount and panel.js footer()). On a phone the panel is a bottom sheet
 * whose closed state still shows Convert; "Results" opens the whole sheet. A compact tool (the Convert dialog of another
 * app) keeps its one column. Convert stays the form's submit button (its `form` attribute), so Enter and the tests that
 * press it work as before.
 *   const fr = frameTool(tool)   after buildTool; fr.paint() after every render and every result */
import { h } from './dom.js';
import { tr } from '../core/i18n.js';
import '../../../shared/ui/sheet.js';          // window.SlopSheet: the phone sheet
import '../../../shared/ui/resize-panel.js';   // window.SlopResizePanel: the panel's edge
import '../../../shared/frame/frame.js';       // window.SlopFrame (styles: shared/frame/frame.css, imported by css/tool.css)
import '../../../shared/frame/panel.js';       // window.SlopFramePanel

export function frameTool(tool) {
  const ui = tool.ui, root = tool.root, id = (s) => `${tool.ns}-${s}`;
  const view = h('div', { class: 'cv-main', id: id('main') });
  const side = h('aside', { class: 'cv-side', id: id('side'), 'aria-label': tr('convert.frame.panel'), 'data-i18n-attr': 'aria-label:convert.frame.panel' });
  const box = h('div', { class: 'cv-frame', id: id('frame') }, view, side);
  // everything above the form is the view; the form, the status and the results go to the panel
  const keep = [...root.children].filter((n) => n !== ui.form && n !== ui.status && n !== ui.results);
  view.append(...keep);
  root.replaceChildren(box);
  ui.run.setAttribute('form', ui.form.id);   // still the form's submit button from the panel's foot
  ui.form.hidden = true;                     // its note shows in the panel; the form stays in the page for Convert
  view.append(ui.form);
  const fr = window.SlopFrame.mount(box, { view, panel: side, panelLabel: 'convert.frame.panel', storageKey: 'convert', phoneButton: false,
    width: 320, min: 260, max: 480, command: false });
  const panel = window.SlopFrame.panel(side, { title: tr('convert.frame.panel') });
  let shape = '', lang = '';

  function paint() {
    const n = tool.items.length, out = tool.outputs.length;
    const key = [n > 0, out].join('/'), now = window.SlopI18n ? window.SlopI18n.get() : '';
    if (out && !shape.endsWith('/' + out) && fr.isPhone()) fr.openSheet();   // a phone: the new results come up in the sheet
    const relang = now !== lang;   // a language change draws the title and the sections again
    if (relang) { lang = now; panel.setTitle(tr('convert.frame.panel')); }
    if (key !== shape || relang) {   // the panel's sections change only when files or results come or go
      shape = key;
      panel.render([
        { key: 'sum', title: tr('convert.frame.files'), note: n ? '' : tr('convert.frame.files_note'), settings: [ui.note, ui.status] },
        out ? { key: 'res', title: tr('convert.frame.converted_n', { n: out }), body: ui.results } : null,
      ]);
    }
    const groups = tool.groups(), files = groups.reduce((s, g) => s + g.items.length, 0);
    panel.footer([
      { el: ui.run, primary: true, label: files > 1 ? tr('convert.frame.convert_n', { n: files }) : tr('convert.tool.convert'), title: tr('convert.frame.convert_tip') },
      { el: ui.clear, disabled: !n },
    ], { more: out ? tr('convert.frame.results') : tr('convert.frame.details') });
  }
  return { frame: fr, panel, paint, view, side };
}
