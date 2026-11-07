/* SlopCut: opens a reel made in Slop Gallery. The launch record (?drive=<id>) is a manifest of type
   application/x-slop-reel+json (format and fields: gallery/HANDOFF.md). Its photos are imported in the listed order
   into a new project, and the random edit (SE.random.plan and build) lays them out with the chosen template, length,
   pace and aspect. Cut-out PNGs (manifest.overlays) go on a track above the slots, over the next photo's beat.
   Uses SE.random, SE.layout and SE.templates from the random edit; without them the photos are appended in order. */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, A = SE.app;
  const R = SE.reel = SE.reel || {};
  const TYPE = 'application/x-slop-reel+json';
  /** Gallery template ids to SlopCut's. random = the random edit with one slot. */
  R.TPL = { random: null, single: 'single', split: 'split-h', grid: 'grid2', reel: 'reel' };

  R.isManifest = (rec) => !!rec && (rec.type === TYPE || /\.reel\.json$/i.test(rec.name || ''));
  R.read = async function (rec) {
    const m = JSON.parse(await rec.blob.text());
    if (!m || m.format !== 'slop-reel' || !Array.isArray(m.files)) throw new Error('This is not a reel from Slop Gallery');
    return m;
  };
  /** Imports Slop Drive records one at a time, so the bin lists them in the order given. Returns Map(driveId -> meta). */
  async function importAll(ids) {
    const out = new Map();
    for (const id of ids) {
      const rec = await SlopHub.get(id).catch(() => null);
      if (!rec || !rec.blob) continue;
      const got = await SE.media.importFiles([new File([rec.blob], rec.name, { type: rec.type })], { from: 'drive' });
      if (got[0]) out.set(id, got[0]);
    }
    return out;
  }
  /** Cut-outs on the track above the slots. Each sits over the beat after its photo's (its own beat for the last photo). */
  function overlayClips(p, plan, links, tpl) {
    const beats = plan.cuts;
    for (const { photo, overlay } of links) {
      let k = -1, it = null;
      beats.forEach((beat, bi) => { const f = beat.find((x) => x.media === photo.id); if (f && k < 0) { k = bi; it = f; } });
      if (!it) continue;
      const next = beats[k + 1] || beats[k];
      const target = next.find((x) => x.slot === it.slot) || next[0];
      const track = SE.layout.ensureTrack(p, 'video', plan.slots).id;
      const c = M.newClip({ kind: 'image', media: overlay.id, track, start: target.start, dur: target.dur, in: 0 });
      if (tpl) Object.assign(c, SE.layout.fit(p, c, tpl.slots[it.slot]));
      p.clips.push(c);
    }
  }
  /** Lays the photos out with the random edit. Returns a summary string for the status line. */
  function place(m, photos, links) {
    if (m.remix) { // a Reel Remix project: the same options, so the same seed gives the same edit (shared/video plan)
      const plan = SE.random.plan(m.remix, photos);
      if (!plan) { A.appendToTimeline(photos); return SE.util.t('slopedit.io.added_in_order'); }
      SE.change(SE.util.t('slopedit.io.make_reel'), (p) => { SE.random.build(p, plan); });
      return 'Reel Remix, ' + Math.round(plan.total) + ' s'; // i18n-ignore: the app's name and seconds
    }
    const tplId = Object.prototype.hasOwnProperty.call(R.TPL, m.template) ? R.TPL[m.template] : null;
    const tpl = tplId && SE.templates ? SE.templates.get(tplId) : null;
    const plan = SE.random && SE.random.plan({ target: m.length, pace: m.pace, aspect: m.aspect, tpl: tpl ? tpl.id : null }, photos);
    if (!plan) { A.appendToTimeline(photos); return SE.util.t('slopedit.io.added_in_order'); }
    SE.change(SE.util.t('slopedit.io.make_reel'), (p) => { SE.random.build(p, plan); overlayClips(p, plan, links, tpl); });
    return (tpl ? tpl.name : SE.util.t('slopedit.io.random_edit')) + ', ' + Math.round(plan.total) + ' s';
  }

  /** Opened from Slop Gallery with ?drive=<manifest id>. Replaces the open project (after a question, when there is one). */
  R.launch = async function (rec) {
    let m;
    try { m = await R.read(rec); } catch (e) { SlopUI.toast(SE.util.t('slopedit.io.reel_failed', { error: e.message })); return true; }
    if (SE.doc.clips.length || SE.doc.media.length) {
      const ok = await SlopUI.confirm(SE.util.t('slopedit.io.make_reel'), SE.util.t('slopedit.io.replace_the_open_project_with'), SE.util.t('slopedit.io.replace'), { danger: true });
      if (!ok) return true;
    }
    await SE.session.newProject(false);
    A.status(SE.util.t('slopedit.io.making_your_reel'));
    const photos = await importAll(m.files);
    const overlays = await importAll((m.overlays || []).map((o) => o.id));
    const ordered = m.files.map((id) => photos.get(id)).filter(Boolean);
    const links = (m.overlays || []).filter((o) => photos.get(o.of) && overlays.get(o.id))
      .map((o) => ({ photo: photos.get(o.of), overlay: overlays.get(o.id) }));
    if (ordered.length < 2) { A.status(SE.util.t('slopedit.io.reel_two', { n: ordered.length })); return true; }
    const summary = place(m, ordered, links);
    A.status(SE.util.t('slopedit.io.reel', { n: ordered.length }) + (links.length ? ', ' + SE.util.t('slopedit.io.cutouts', { n: links.length }) : '') + ', ' + summary);
    return true;
  };
})();
