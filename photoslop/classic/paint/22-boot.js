/* Slop Paint, part 22: boot and the window.slopPaint hook.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, ACTIONS, MENUS, PALETTE, S, TOOLS, buildTools, labelMenus, labelTools, onLang, renderOptions, cancelOp, confirmSave, editSwatch, finishPending, initFontbar, main, openBlob, redoStack, renderPalette, run, setCanvasSize, setColor, setTool, status, undoStack, updateTitle, ws } = P;

/* =====================================================================
 * Boot
 * ===================================================================== */
buildTools();
renderPalette();
initFontbar();
setColor(0, S.primary); setColor(2, S.secondary);
{
  // fit the default canvas to small screens (phones), like Paint sizing to the screen
  const fw = ws.clientWidth - 24, fh = ws.clientHeight - 24;
  const w = fw > 60 && fw < 800 ? fw : 800, hh = fh > 60 && fh < 500 ? fh : 500;
  setCanvasSize(w, hh, false, '#ffffff');
}
setTool('pencil');
updateTitle();
status();
// a language change: the words drawn by script again (the marked HTML follows by itself); the picture is kept
onLang(() => { labelMenus(); labelTools(); renderOptions(); renderPalette(); updateTitle(); status(); });
// expose a tiny hook for automated tests / curious slop scientists
window.slopPaint = { state: S, get selection() { return P.st.sel; }, undoDepth: () => undoStack.length, redoDepth: () => redoStack.length, canvas: main,
  // for the Slop Drive integration (hub.js), which runs outside this closure
  drive: { ACTIONS, main, S, openBlob, confirmSave, finishPending, cancelOp, status, updateTitle, opActive: () => !!P.st.op },
  // for the shared command palette (commands.js)
  cmd: { MENUS, TOOLS, run, setTool, setColor, editSwatch, palette: PALETTE, hasClip: () => !!P.st.clip, swapColors: () => { const p = S.primary; setColor(0, S.secondary); setColor(2, p); }, busy: () => P.st.openMenu >= 0 || !$('#startmenu').hidden || !!document.querySelector('.modal-back, .viewbmp') } };
})();
