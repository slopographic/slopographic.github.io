/* Slop Tables — ui/view-state: coming back to Slop Tables reopens the workbook you left (its draft, or the Slop Drive
 * file) with the open sheet, the active cell and the scroll position. The tabs and their unsaved values come back from
 * the strip (ui/tabs.js); the place itself is kept in SlopSession. Restored only for the same file (same Drive id, or both untitled). */
import { S, $, on } from './state.js';

const APP = 'tables';
let ready = false; // nothing is saved until the saved place has been applied
const vp = () => $('vp');
const place = () => ({
  driveId: S.file.driveId || null, si: S.si, sel: S.sel,
  scroll: { top: vp() ? vp().scrollTop : 0, left: vp() ? vp().scrollLeft : 0 },
});
const auto = window.SlopSession.autosave(APP, 'place', place, { delay: 400 });
const touch = () => { if (ready && S.wb) auto.touch(); };
on('change', touch);
on('saved', touch);
['pointerup', 'keyup', 'click'].forEach((t) => document.addEventListener(t, touch, true));
if (vp()) vp().addEventListener('scroll', touch, { passive: true });

const inRange = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
/** Apply the saved place to the workbook that launch() just opened. */
export async function restorePlace() {
  const p = await window.SlopSession.load(APP, 'place', null).catch(() => null);
  if (p && typeof p === 'object' && S.wb && (p.driveId || null) === (S.file.driveId || null)) {
    if (inRange(p.si, S.wb.sheets.length)) S.si = p.si;
    const s = p.sel;
    if (s && [s.r, s.er].every((n) => inRange(n, 1048576)) && [s.c, s.ec].every((n) => inRange(n, 16384))) S.sel = { r: s.r, c: s.c, er: s.er, ec: s.ec };
    if (vp() && p.scroll) { vp().scrollTop = p.scroll.top || 0; vp().scrollLeft = p.scroll.left || 0; }
  }
  ready = true;
}
