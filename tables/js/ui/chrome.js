/* The parts around the grid: toolbar state, name box, formula bar, status bar and the file name. */
import { S, $, range, redraw, toast, changed } from './state.js';
import { canUndo, canRedo } from './history.js';
import { activeStyle, stats } from './actions.js';
import { syncBar } from './editor.js';
import { moveTo } from './nav.js';
import { parseRange, addr } from '../engine/refs.js';
import { NUMBER_FORMATS, nfLabel } from './numfmt.js';
import { t, onLang } from '../i18n.js';
import * as Sheets from './sheets.js';
import { fileName } from './storage.js';

export function init() {
  const nb = $('namebox');
  nb.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const p = parseRange(nb.value.trim());
    if (!p) { toast(t('tables.toast.namebox')); return; }
    moveTo(p.r1, p.c1);
    S.sel.er = p.r2; S.sel.ec = p.c2;
    nb.blur(); redraw();
  });
  const nf = $('nf');
  const fill = () => { const v = nf.value; nf.replaceChildren(...NUMBER_FORMATS.map(([id, code]) => new Option(nfLabel(id), code))); if (v) nf.value = v; };
  fill();
  onLang(() => { fill(); render(); }); // the formats, the status bar and the save state in the new language
  const title = $('fileName');
  title.addEventListener('change', () => { S.file.name = title.value.trim() || t('tables.app.untitled'); changed(); }); // the tab takes the new name
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
}

export function render() {
  $('btnUndo').disabled = !canUndo();
  $('btnRedo').disabled = !canRedo();
  const st = activeStyle();
  $('btnBold').setAttribute('aria-pressed', String(!!st.b));
  $('btnBold').classList.toggle('on', !!st.b);
  $('btnItalic').setAttribute('aria-pressed', String(!!st.i));
  $('btnItalic').classList.toggle('on', !!st.i);
  const nf = $('nf'), code = st.nf || 'General';
  if (![...nf.options].some((o) => o.value === code)) nf.append(new Option(t('tables.nf.custom', { code }), code));
  if (nf.value !== code) nf.value = code;
  const nb = $('namebox');
  if (document.activeElement !== nb) {
    const g = range();
    nb.value = addr(g.r1, g.c1) + (g.r1 === g.r2 && g.c1 === g.c2 ? '' : ':' + addr(g.r2, g.c2));
  }
  syncBar();
  const s = stats();
  $('status').textContent = s && s.count ? t('tables.status.count', { n: String(s.count) }) + (s.nums ? '   ' + t('tables.status.sum_avg', { sum: fmtNum(s.sum), avg: fmtNum(s.avg) }) : '') : '';
  const title = $('fileName');
  if (document.activeElement !== title) title.value = S.file.name;
  $('saveState').textContent = t(S.file.dirty ? 'tables.status.unsaved' : S.file.driveId ? 'tables.status.saved' : 'tables.status.not_saved');
  $('saveState').classList.toggle('dirty', !!S.file.dirty);
  document.title = (S.file.dirty ? '• ' : '') + fileName() + ' — ' + (window.slopAppName ? slopAppName('tables') : 'Slop Tables');   // the app list's name
  Sheets.render();
}

const fmtNum = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 1e6) / 1e6).toLocaleString());
