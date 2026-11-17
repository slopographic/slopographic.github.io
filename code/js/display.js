/* Slop Code: display options. They change only how the text is drawn (spaces and tabs shown, the tab width, a ruler line,
 * the text size): the file and the editor's text are never touched. Kept per viewer (slop-code.display). The switch for the
 * helper (Extensions panel) puts everything back to the defaults while it is Off. */
import { Compartment, EditorState } from '@codemirror/state';
import { highlightWhitespace } from '@codemirror/view';
import { readPref, writePref, helperOn } from './prefs.js';

export const TAB_WIDTHS = [2, 3, 4, 8];
export const RULERS = [0, 72, 80, 100, 120];
export const SIZES = [12, 13, 14, 16, 18, 20];
const DEFAULTS = { whitespace: false, tab: 4, ruler: 0, size: 14 };
const pickOf = (list, v, d) => (list.includes(Number(v)) ? Number(v) : d);

const comp = new Compartment();
const opts = { ...DEFAULTS };
{
  const s = readPref('display', {});
  opts.whitespace = s.whitespace === true;
  opts.tab = pickOf(TAB_WIDTHS, s.tab, DEFAULTS.tab);
  opts.ruler = pickOf(RULERS, s.ruler, DEFAULTS.ruler);
  opts.size = pickOf(SIZES, s.size, DEFAULTS.size);
  opts.fmt = s.fmt === true; // the formatted view pane is shown (fmtpane.js)
}

/** The saved options, whatever the helper's switch says (the controls in the Extensions panel show these). */
export const savedDisplay = () => ({ ...opts });
/** The options as they apply now (the defaults while the helper is Off). */
export const getDisplay = () => (helperOn('display') ? { ...opts } : { ...DEFAULTS, fmt: opts.fmt });
const parts = () => { const d = getDisplay(); return [d.whitespace ? highlightWhitespace() : [], EditorState.tabSize.of(d.tab)]; };

/** The extension a new editor state carries, so the options can be changed later without making the state again. */
export const displayExtension = () => comp.of(parts());

/** Apply the options to the shown document: the tab width and the spaces, then the ruler and the text size (CSS on the editor box). */
export function syncDisplay(view) {
  if (!view) return;
  view.dispatch({ effects: comp.reconfigure(parts()) });
  const d = getDisplay(), host = view.dom.closest ? view.dom.closest('.cd-editor') : null, box = host && host.closest('.cd-split');
  if (!host) return;
  (box || host).style.setProperty('--cd-size', d.size + 'px'); // the editor and the formatted view share it
  if (d.ruler) { host.style.setProperty('--cd-ruler', String(d.ruler)); host.dataset.ruler = String(d.ruler); } else { host.style.removeProperty('--cd-ruler'); delete host.dataset.ruler; }
}

/** Change options (whitespace, tab, ruler, size, fmt), keep them, and apply them to the shown document. Unknown values are ignored. */
export function setDisplay(view, patch) {
  if ('whitespace' in patch) opts.whitespace = !!patch.whitespace;
  if ('tab' in patch) opts.tab = pickOf(TAB_WIDTHS, patch.tab, opts.tab);
  if ('ruler' in patch) opts.ruler = pickOf(RULERS, patch.ruler, opts.ruler);
  if ('size' in patch) opts.size = pickOf(SIZES, patch.size, opts.size);
  if ('fmt' in patch) opts.fmt = !!patch.fmt;
  writePref('display', { ...opts });
  syncDisplay(view);
}
