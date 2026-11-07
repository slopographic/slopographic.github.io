/* Slop Paint, part 17: files: open, save PNG, clear image.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, S, cancelOp, finishPending, h, isTyping, loadBlobImage, main, mctx, pasteBlob, pasteCanvas, pushUndo, setCanvasSize, status, updateTitle, win } = P;

/* =====================================================================
 * Files
 * ===================================================================== */
/* The one way pictures come in (shared/intake, spec 'paint-classic'): File ▸ Open and Paste From (the intake's picker,
   mode 'open' or 'paste'), a drop on the window, a pasted picture (unless the app's own copy is newer), Open from Slop
   Drive and ?drive=<id> (hub.js). Mode 'paste' pastes it in; otherwise it opens (a Drive file stays linked: P.linkDrive). */
const SI = window.SlopIntake;
SI.register({
  id: 'paint-classic', limit: 1, toast: false, accept: { types: ['image/*'], noun: 'paint-classic.app.noun_picture' },
  except: () => !!(P.st.clipInternalNewer && P.st.clip), // the app's own copy is newer: its paste uses that
  process: async (f, ctx) => {
    if (ctx.mode === 'paste' || ctx.source === 'paste') { await pasteBlob(f); return f.name; }
    await openBlob(f, f.name);
    if (ctx.drive && P.linkDrive) P.linkDrive(ctx.drive.id, f.name);
    return f.name;
  },
});
const fileInput = { click: () => SI.pick({ to: 'paint-classic', multiple: false, mode: P.st.fileMode === 'paste' ? 'paste' : 'open', accept: 'image/*' }) };
async function openBlob(blob, name = 'untitled') {
  let img;
  try { img = await loadBlobImage(blob); }
  catch (_) { P.msgBox(P.t('paint-classic.msg.cannot_read'), ['OK'], 'warn'); return; }
  if (P.st.op) cancelOp();
  finishPending();
  let w = img.naturalWidth, hh = img.naturalHeight;
  const k = Math.min(1, 4096 / Math.max(w, hh));
  w = Math.max(1, Math.round(w * k)); hh = Math.max(1, Math.round(hh * k));
  pushUndo();
  setCanvasSize(w, hh, false, '#ffffff');
  mctx.imageSmoothingEnabled = k < 1;
  mctx.drawImage(img, 0, 0, w, hh);
  mctx.imageSmoothingEnabled = false;
  S.fileName = (name.replace(/\.[^.]+$/, '') || 'untitled').slice(0, 60);
  updateTitle(); S.dirty = false;
  status(P.t('paint-classic.status.opened', { name, w: String(w), h: String(hh) }));
}
function savePNG(name = S.fileName) {
  if (P.st.op) cancelOp();
  finishPending();
  return new Promise(res => {
    main.toBlob(b => {
      if (!b) { res(false); return; }
      const a = h('a', { href: URL.createObjectURL(b), download: name.replace(/\.png$/i, '') + '.png' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      S.dirty = false; S.fileName = name.replace(/\.png$/i, ''); updateTitle();
      status(P.t('paint-classic.status.saved', { name: S.fileName }));
      res(true);
    }, 'image/png');
  });
}
async function confirmSave() {
  if (!S.dirty) return true;
  const r = await P.msgBox(P.t('paint-classic.msg.save_changes', { name: S.fileName === 'untitled' ? P.t('paint-classic.app.untitled') : S.fileName }), ['Yes', 'No', 'Cancel'], 'warn');
  if (r === 'Yes') { await savePNG(); return true; }
  return r === 'No';
}
// a picture dropped on the app opens (the intake's drop target)
SI.dropTarget(win, { to: 'paint-classic', mode: () => 'open' });
// A pasted picture is the intake's (it takes it first); this is the app's own copy.
document.addEventListener('paste', e => { // intake-ok: the app's own clipboard copy
  if (e.defaultPrevented || document.querySelector('.modal-back') || isTyping(e.target)) return;
  e.preventDefault();
  if (P.st.clip) pasteCanvas(P.st.clip);
  else status(P.t('paint-classic.status.clip_no_picture'));
});
window.addEventListener('blur', () => { P.st.clipInternalNewer = false; });

Object.assign(P, { confirmSave, fileInput, openBlob, savePNG });
})();
