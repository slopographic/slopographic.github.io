/* Slop Paint Classic: Slop Drive integration. Open from Slop Drive, Save writes the PNG back to the
 * linked Drive file (the first save asks for a folder), and ?drive=<id> opens a file another app sent.
 * Loaded after paint.js; overrides ACTIONS.save and adds ACTIONS.openDrive. Without the hub, nothing changes. */
(function () {
  'use strict';
  const H = window.SlopHub;
  if (!H || !window.slopPaint || !window.slopPaint.drive) return;
  const P = window.slopPaint.drive, { ACTIONS, main, S, openBlob, confirmSave, finishPending, cancelOp, status, updateTitle } = P;
  let driveId = null; // the Slop Drive record this picture was opened from or saved to
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const baseOf = (n) => (String(n || 'untitled').replace(/\.[^.]+$/, '') || 'untitled').slice(0, 60);

  /** The intake's reader opened a Slop Drive file: Save writes back to it when the picture is still that file. */
  window.SlopPaint.linkDrive = (id, name) => { driveId = S.fileName === baseOf(name) ? id : null; };
  ACTIONS.openDrive = async function () {
    if (P.opActive()) cancelOp();
    finishPending();
    if (!(await confirmSave())) return;
    await window.SlopIntake.fromDrive({ to: 'paint-classic', mode: 'open', title: t('paint-classic.drive.open_title') }); // the one way in (paint/17-files.js)
  };
  ACTIONS.save = async function () {
    if (P.opActive()) cancelOp();
    finishPending();
    const blob = await new Promise((res) => main.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = S.fileName.replace(/\.png$/i, '') + '.png';
    if (!driveId) { const id = await H.saveToDrive(blob, name, { from: 'paint-classic' }); if (!id) return; driveId = id; }
    else if (!(await H.update(driveId, { blob, name, type: blob.type }))) await H.put(blob, { id: driveId, name, from: 'paint-classic' });
    S.dirty = false; updateTitle(); status(t('paint-classic.status.saved_drive', { name }));
  };

  try { H.register('paint-classic'); } catch (e) { /* bus unavailable */ }
  window.SlopIntake.launch({ to: 'paint-classic', mode: 'open' }).catch((e) => console.warn('Slop Paint: could not open the Drive file', e));
})();
