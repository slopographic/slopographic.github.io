/* PhotoSlop — app/view-state: where you were in each open tab (zoom and pan) and whether the panels are hidden are kept
 * in SlopSession, so leaving PhotoSlop (back link, Slop Drive, another app) and coming back restores them. The tabs and
 * their pixels are already autosaved (io/save.js), and the tool, tool options and collapsed panels are in store. */
'use strict';
const VIEW_APP = 'photoslop';
let viewReady = false; // nothing is saved before the saved view is applied, so boot cannot overwrite it
const viewAuto = window.SlopSession.autosave(VIEW_APP, 'view', viewSnapshot, { delay: 300 });

function viewSnapshot() {
  const zooms = {};
  for (const rec of DOCS) {
    const s = rec === CUR ? { zoom: V.zoom, ox: V.ox, oy: V.oy } : rec.state;
    if (s && s.zoom > 0 && isFinite(s.ox) && isFinite(s.oy)) zooms[String(rec.id)] = { zoom: s.zoom, ox: s.ox, oy: s.oy };
  }
  return { zooms, noPanels: document.body.classList.contains('no-panels') };
}
const viewTouch = () => { if (viewReady) viewAuto.touch(); };
// Zoom and pan change without a render, so listen for the input that causes them as well as the zoom events.
document.addEventListener('pointerup', viewTouch, true);
document.addEventListener('keyup', viewTouch, true);
document.addEventListener('wheel', viewTouch, { capture: true, passive: true });
listeners.add((w) => { if (w === 'zoom' || w === 'doc' || w === 'tool') viewTouch(); });

/** Boot, after the tabs are in place. `tabsRestored` is true only when the open tabs came back from autosave. */
async function restoreView(tabsRestored) {
  const v = await window.SlopSession.load(VIEW_APP, 'view', null).catch(() => null);
  if (v && typeof v === 'object') {
    if (v.noPanels) document.body.classList.add('no-panels');
    const zooms = v.zooms && typeof v.zooms === 'object' ? v.zooms : {};
    for (const rec of DOCS) {
      const z = zooms[String(rec.id)];
      if (!z || !(z.zoom > 0) || rec === CUR || !rec.state) continue;
      Object.assign(rec.state, { zoom: z.zoom, ox: z.ox, oy: z.oy });
    }
    const z = CUR && zooms[String(CUR.id)];
    if (tabsRestored && z && z.zoom > 0) { V.zoom = z.zoom; V.ox = z.ox; V.oy = z.oy; emit('zoom'); dirty(); }
  }
  viewReady = true;
}
