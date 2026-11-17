/* Slop Paint, part 21: keyboard, window chrome, taskbar and start menu.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, $$, MENUS, S, accKey, cancelCurve, cancelOp, cancelPoly, closeMenus, commitCurve, commitPoly, commitSel, commitText, finishPending, isTyping, lift, menubar, renderFloating, run, setColor, showMenu, updateSelBox, win } = P;

/* =====================================================================
 * Keyboard
 * ===================================================================== */
document.addEventListener('keydown', e => {
  if (document.querySelector('.modal-back, .viewbmp')) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'Escape') {
    if (P.st.openMenu >= 0) { closeMenus(); return; }
    if (!$('#startmenu').hidden) { closeStart(); return; }
    if (P.st.op) { cancelOp(); return; }
    if (P.st.curve) { cancelCurve(); return; }
    if (P.st.poly) { cancelPoly(); return; }
    if (P.st.text) { commitText(); return; }
    if (P.st.sel) { commitSel(); return; }
    return;
  }
  if (e.altKey && !ctrl && k.length === 1) {
    const i = MENUS.findIndex(m => accKey(m.label) === k);
    if (i >= 0) { e.preventDefault(); showMenu(i, true); return; }
  }
  if (e.key === 'F10' && !e.shiftKey) { e.preventDefault(); menubar.children[0].focus(); return; }
  if (isTyping(e.target)) return;
  if (P.st.openMenu >= 0) return;
  // menu actions, tools and colour swap are rebindable commands (commands.js, SlopCmd); these stay contextual:
  if (e.key === 'Enter' && P.st.poly) { e.preventDefault(); commitPoly(); return; }
  if (e.key === 'Enter' && P.st.curve) { e.preventDefault(); commitCurve(); return; }
  if (P.st.sel && P.st.sel.canvas !== undefined && e.key.startsWith('Arrow') && !ctrl) {
    e.preventDefault();
    lift();
    const d = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') P.st.sel.x -= d; if (e.key === 'ArrowRight') P.st.sel.x += d;
    if (e.key === 'ArrowUp') P.st.sel.y -= d; if (e.key === 'ArrowDown') P.st.sel.y += d;
    renderFloating(); updateSelBox();
  }
});

/* =====================================================================
 * Window chrome, taskbar, start menu
 * ===================================================================== */
const startMenu = $('#startmenu'), startBtn = $('#startBtn');
function closeStart() { startMenu.hidden = true; startBtn.setAttribute('aria-expanded', 'false'); }
startBtn.addEventListener('click', () => {
  const open = startMenu.hidden;
  closeMenus();
  startMenu.hidden = !open; startBtn.setAttribute('aria-expanded', String(open));
  if (open) { const f = $('.sm-item', startMenu); if (f) f.focus(); }
});
startMenu.addEventListener('keydown', e => {
  const items = $$('.sm-item', startMenu), i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  if (e.key === 'Escape') { closeStart(); startBtn.focus(); }
});
$$('[data-act]', startMenu).forEach(b => b.addEventListener('click', () => { closeStart(); if (win.hidden) restoreWin(); run(b.dataset.act); }));
function minimizeWin() { finishPending(); win.hidden = true; $('#taskBtn').classList.remove('active'); }
function restoreWin() { win.hidden = false; $('#taskBtn').classList.add('active'); }
$('#btnMin').addEventListener('click', minimizeWin);
$('#btnMax').addEventListener('click', () => win.classList.toggle('max'));
$('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('button')) win.classList.toggle('max'); });
$('#btnClose').addEventListener('click', () => run('exit'));
$('#taskBtn').addEventListener('click', () => (win.hidden ? restoreWin() : minimizeWin()));
$('#dIconPaint').addEventListener('dblclick', restoreWin);
$('#dIconPaint').addEventListener('click', e => { if (e.detail === 0 || matchMedia('(pointer: coarse)').matches) restoreWin(); });
$('#curcolors').addEventListener('click', () => { const p = S.primary; setColor(0, S.secondary); setColor(2, p); });
function tick() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
tick(); setInterval(tick, 20000);

Object.assign(P, { closeStart });
})();
