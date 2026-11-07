/* SlopCut: .slopedit project files. A store-only zip with project.json and every media file under
   media/<id>.<ext>, so a project moves between browsers and machines with its footage. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const PJ = SE.project = {};
  PJ.MIME = 'application/x-slopedit';

  PJ.toBlob = async function (p = SE.doc) {
    const doc = M.snapshot(p);
    const entries = [{ name: 'project.json', data: new TextEncoder().encode(JSON.stringify({ app: 'slopedit', version: 1, saved: new Date().toISOString(), project: doc }, null, 1)) }];
    for (const m of p.media) {
      const it = SE.media.get(m.id);
      if (it && it.blob && it.blob.size) entries.push({ name: 'media/' + m.id + '.' + (U.ext(m.name) || 'bin'), data: it.blob });
    }
    return new Blob([await SE.zip.write(entries)], { type: PJ.MIME });
  };
  PJ.fileName = () => (U.baseName(SE.doc.name).replace(/[\\/:*?"<>|]+/g, '-') || 'project') + '.slopedit';
  /** Load a .slopedit Blob/File as the current project. */
  PJ.load = async function (blob) {
    const files = await SE.zip.read(blob);
    const j = files.get('project.json');
    if (!j) throw new Error('This file has no project.json');
    const data = JSON.parse(await j.text());
    if (!data || data.app !== 'slopedit' || !data.project) throw new Error('Not a SlopCut project');
    const doc = M.normalize(data.project);
    for (const m of doc.media) if (m.kind === 'image' && m.dur == null) m.dur = Infinity;
    const blobs = new Map();
    for (const [name, b] of files) {
      const mm = /^media\/([^.]+)\./.exec(name);
      if (mm) { const meta = doc.media.find((x) => x.id === mm[1]); blobs.set(mm[1], new File([b], meta ? meta.name : name, { type: meta ? meta.type : '' })); }
    }
    if (SE.player) SE.player.pause();
    SE.media.clear();
    SE.setDoc(doc);
    // Titles that use a font the app does not have: asked about once per opened project (the Fonts panel stays available).
    if (window.SlopFonts) { const names = [...new Set(doc.clips.filter((c) => c.kind === 'title').map((c) => c.text.font))]; SlopFonts.ready().then(() => SlopFonts.askOnce({}, names, { standard: M.FONTS })).catch(() => {}); }
    await SE.media.restore(doc.media, blobs);
    SE.app.select([]);
    SE.emit('change', { label: U.t('slopedit.io.open_project'), history: true });
    SE.emit('settings', {});
    await SE.session.save();
    return doc;
  };
  // PJ.driveId: the Slop Drive record the open project came from (or was saved to). Save writes back to it.
  PJ.driveId = null;
  PJ.openFile = async function (file, driveId) {
    if (SE.doc.clips.length && !(await SlopUI.confirm(U.t('slopedit.io.open_project'), U.t('slopedit.io.replace_with', { name: file.name }), U.t('slopedit.io.open')))) return;
    const dlg = SE.progress.open(U.t('slopedit.io.opening', { name: file.name }), { cancel: false });
    try { await PJ.load(file); PJ.driveId = driveId || null; SE.app.status(U.t('slopedit.io.opened', { name: file.name })); }
    catch (e) { console.error(e); SlopUI.alert(U.t('slopedit.io.open_project'), U.t('slopedit.io.open_failed', { error: e.message })); }
    finally { dlg.close(); }
  };
  SE.act.openProject = () => SE.intake.openProject(); // a source of the one intake (io/intake.js)
  SE.act.downloadProject = async function () {
    const dlg = SE.progress.open(U.t('slopedit.io.saving_project'), { cancel: false });
    try { dlg.set(0.3, U.t('slopedit.io.packing_media')); SlopUI.download(await PJ.toBlob(), PJ.fileName()); SE.app.status(U.t('slopedit.io.saved', { name: PJ.fileName() })); }
    catch (e) { SlopUI.alert(U.t('slopedit.io.save_project'), U.t('slopedit.io.save_failed', { error: e.message })); }
    finally { dlg.close(); }
  };
  // File ▸ Save: writes back to the linked Drive project (first time: asks for a folder); a download without Drive.
  SE.act.saveProject = async function () {
    if (!window.SlopHub || SE.offline) return SE.act.downloadProject();
    const dlg = SE.progress.open(U.t('slopedit.io.saving_project_to_slop_drive'), { cancel: false });
    try {
      dlg.set(0.3, U.t('slopedit.io.packing_media'));
      const blob = await PJ.toBlob(), name = PJ.fileName();
      if (!PJ.driveId) { const id = await SlopHub.saveToDrive(blob, name, { from: 'slopedit' }); if (id) PJ.driveId = id; return; }
      if (!(await SlopHub.update(PJ.driveId, { blob, name, type: blob.type }))) await SlopHub.put(blob, { id: PJ.driveId, name, from: 'slopedit' });
      SE.app.status(U.t('slopedit.io.saved_drive', { name }));
    } catch (e) { SlopUI.alert(U.t('slopedit.io.save_project'), U.t('slopedit.io.save_failed', { error: e.message })); }
    finally { dlg.close(); }
  };
  // File ▸ Save project to Slop Drive…: a new Drive file in a folder of your choice, which Save then keeps writing to.
  SE.act.saveProjectDrive = async function () {
    if (!window.SlopHub) return;
    try { const id = await SlopHub.saveToDrive(await PJ.toBlob(), PJ.fileName(), { from: 'slopedit' }); if (id) PJ.driveId = id; } catch (e) { SlopUI.toast(U.t('slopedit.io.save_failed', { error: e.message })); }
  };
})();
