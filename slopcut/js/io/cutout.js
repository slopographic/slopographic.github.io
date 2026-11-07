/* SlopCut: Remove background (send to SlopIsolate). A video clip's media goes to Slop Drive and SlopIsolate opens on it
   (?drive=). Isolate sends the result back as a matte pair: the colour video and its matte video, both in Drive.
   The result is a NEW clip on the video track above the source clip, starting at the same time, with the matte
   (clip.matteMedia) as its alpha. The source clip stays. Results come in over the Slop Hub bus ('cutout-result') when
   Cut is open, or with ?drive= when Cut was opened for them; both come in through the intake (io/intake.js), whose reader
   calls SE.cutout.place. SE.cutout.send(clip), SE.cutout.receive(p), SE.cutout.place(files, p). */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, E = SE.edit, A = SE.app;
  const CU = SE.cutout = {};
  const toast = (m) => window.SlopUI && SlopUI.toast(m);

  /** Send a clip's media to SlopIsolate (Drive record carries the clip id so the result can go back above it). */
  CU.send = async function (clip) {
    const h = window.SlopHub, it = SE.media.get(clip.media);
    if (!h || SE.offline) return toast(SE.util.t('slopedit.io.slop_drive_is_not_available'));
    if (!it || !it.blob) return toast(SE.util.t('slopedit.io.the_media_is_not_loaded'));
    try {
      const id = await h.put(it.blob, { name: it.meta.name, from: 'slopedit', meta: { clipId: clip.id } });
      window.open(h.urlOf(h.appById('cutout'), { drive: id }), '_blank');
      toast(SE.util.t('slopedit.io.opened_in_slopisolate'));
    } catch (e) { toast(SE.util.t('slopedit.io.send_failed', { error: e.message || String(e) })); }
  };

  /** A matte pair from SlopIsolate: its two Slop Drive records go through the intake. payload: { id, matteId, name, clipId }. */
  CU.receive = async function (payload) {
    const h = window.SlopHub;
    if (!h || !A) return false;
    const cRec = await h.get(payload.id), mRec = await h.get(payload.matteId);
    if (!cRec || !mRec) { toast(SE.util.t('slopedit.io.the_cut_out_is_no')); return false; }
    const r = await SE.intake.handed([cRec, mRec], { cutout: payload });
    return !!(r && r.added.length);
  };
  /** The intake's reader for a matte pair (the colour file, then the matte): a new clip above payload.clipId (or on a new
   *  top track), with the matte as its alpha. */
  CU.place = async function (files, payload) {
    const metas = (await A.importFiles(files, { from: 'cutout' })) || [];
    const cm = metas.find((m) => m.name === files[0].name), mm = metas.find((m) => m.name === files[1].name);
    if (!cm || !mm) { toast(SE.util.t('slopedit.io.could_not_place_the_cut')); return false; }
    let ids = [];
    SE.change(SE.util.t('slopedit.io.add_background_cut_out'), (p) => {
      const src = payload.clipId ? M.clip(p, payload.clipId) : null;
      const vt = M.videoTracks(p);
      let tk, start = 0;
      if (src) { const i = vt.findIndex((t) => t.id === src.track); tk = vt[i + 1] || M.addTrack(p, 'video'); start = src.start; }
      else tk = M.addTrack(p, 'video');
      ids = E.addMedia(p, cm, tk.id, start);
      for (const id of ids) { const c = M.clip(p, id); if (c && c.kind === 'video') c.matteMedia = mm.id; }
      return ids.length ? ids : false;
    });
    if (ids.length) A.select(ids);
    toast(SE.util.t('slopedit.io.added_the_cut_out_above'));
    return true;
  };

  if (window.SlopHub && typeof SlopHub.on === 'function') SlopHub.on('cutout-result', (d) => { // intake-ok: a message with two Drive ids; receive() hands the files to the intake
    CU.receive(d).catch((e) => toast(SE.util.t('slopedit.io.cutout_failed', { error: e.message || String(e) }))); });
})();
