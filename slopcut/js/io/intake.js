/* SlopCut: the one way files come in (shared/intake, spec 'slopedit'). Import media (Ctrl+I, the bin's buttons), Open
   project (Ctrl+O), Import from Slop Drive, a drop on the window or the strip over the monitor (and its Choose files), a
   drop on a timeline lane (the batch goes where it is dropped), a paste, ?drive=<id> (another app's Send to…, a reel from
   Slop Gallery, a matte pair from SlopIsolate), SlopIsolate's 'cutout-result' message, a PWA launch and the sample
   project all call SlopIntake.take and reach one reader, which reads the whole batch at once:
     data.cutout   a matte pair from SlopIsolate: placed above its clip (io/cutout.js)
     data.sample   the sample project's media: imported, then laid out by io/sample.js
     a reel        (a Slop Drive manifest from Slop Gallery): io/reel.js makes the project
     a matte pair  sent with ?drive= (the record's meta.matteId): io/cutout.js
     data.tl       a drop on a timeline lane: imported and placed there (timeline/menu.js)
     otherwise     SE.app.importFiles: a .slopedit opens (a Drive one stays linked), media go to the bin (and the
                   timeline when the project is empty). */
(function () {
  'use strict';
  const SE = window.SE, SI = window.SlopIntake;
  const IN = SE.intake = {};
  const REEL = 'application/x-slop-reel+json', PROJECT = /\.slopedit$/i;
  IN.RULES = {
    types: ['video/*', 'audio/*', 'image/*', 'application/x-slopedit', 'application/zip', REEL, 'application/json'],
    exts: ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.slopedit'],
    noun: 'slopedit.io.a_video_audio_picture_or',
  };
  const DRIVE = ['video/*', 'audio/*', 'image/*', 'application/x-slopedit', 'application/zip'];
  const names = (files) => files.map((f) => f.name);

  async function read(files, ctx) {
    const d = ctx.data || {}, rec = files.length === 1 && ctx.drive ? ctx.drive.record : null;
    if (d.cutout) { if (!(await SE.cutout.place(files, d.cutout))) throw new Error('could not be placed'); return names(files); }
    if (d.sample) { const metas = await SE.media.importFiles(files, { from: 'sample' }); return files.map((f) => metas.find((m) => m.name === f.name) || null); }
    if (rec && SE.reel && SE.reel.isManifest(rec)) { await SE.reel.launch(rec); return names(files); }
    if (rec && rec.meta && rec.meta.matteId) { // the colour file came in; its matte is the record's partner in Slop Drive
      const m = window.SlopHub && (await SlopHub.get(rec.meta.matteId));
      if (!m) throw new Error('came without its matte (it is no longer in Slop Drive)');
      if (!(await SE.cutout.place([files[0], new File([m.blob], m.name, { type: m.type })], { clipId: rec.meta.clipId || null }))) throw new Error('could not be placed');
      return names(files);
    }
    const from = ctx.source === 'drive' || ctx.source === 'launch' ? 'drive' : 'file';
    if (d.tl && SE.timeline) { const metas = await SE.timeline.dropFiles(files, d.tl); if (!metas.length) throw new Error('could not be imported'); return names(files); }
    const hasProject = files.some((f) => PROJECT.test(f.name));
    const metas = await SE.app.importFiles(files, { from });
    if (!hasProject && !metas.length) throw new Error('could not be imported');
    return names(files);
  }
  SI.register({ id: 'slopedit', accept: IN.RULES, driveAccept: DRIVE, processAll: read });

  /** Import media… (Ctrl+I): many files, into the bin. */
  IN.importMedia = () => SI.pick({ to: 'slopedit', accept: SE.app.ACCEPT + ',.slopedit' });
  /** Open project (.slopedit)… (Ctrl+O). */
  IN.openProject = () => SI.pick({ to: 'slopedit', multiple: false, accept: '.slopedit,application/zip,' + SE.project.MIME });
  IN.fromDrive = () => SI.fromDrive({ to: 'slopedit', title: SE.util.t('slopedit.bin.import_from_slop_drive') });
  /** What the page was opened with (?drive=<id>, a PWA launch). Resolves true when something came in. */
  IN.launch = async () => { const r = await SI.launch({ to: 'slopedit' }); return !!(r && r.added && r.added.length); };
  /** Files (or Slop Drive records) another app handed over while SlopCut is open, with what they are for (data). */
  IN.handed = (items, data) => SI.take(items, { to: 'slopedit', source: 'launch', data });
  /** The sample project's media (io/sample.js); resolves their metas in order. */
  IN.sample = async (files) => { const r = await SI.sample(files, { to: 'slopedit', data: { sample: true } }); return r.added.map((a) => a.value).filter(Boolean); };
  /** The drop places: a timeline lane (the batch lands where it is dropped) and the strip over the monitor (the window). */
  IN.attachDrops = function (zone) {
    SI.dropTarget(document.getElementById('timeline'), { to: 'slopedit', data: (e) => ({ tl: SE.timeline ? SE.timeline.dropTarget(e) : null }) });
    SlopDrop.attach(zone, { intake: 'slopedit', compact: true, targets: [document.getElementById('app')] });
  };
})();
