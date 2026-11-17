/* Slop Drive: face detection for pictures (opt-in, off by default; see shared/faces/). "Find faces" runs the detector on
 * the selected pictures and keeps the result in the shared cache, keyed by the file id and its modified time, so an
 * edited picture is detected again. The details panel and Quick look show the count as a badge (shared/faces/view.js):
 * the boxes are drawn for the photo when its badge is opened, or on every photo in the "Boxes on photos" mode. The
 * Faces and people dialog (shared/faces/panel.js) groups the faces. The first use asks first (SlopFaces.askOptIn).
 * Classic script; adds to window.DR. */
'use strict';
(function (DR) {
  const F = () => window.SlopFaces;

  /** A picture the detector can read: a raster image (not SVG), not a folder, not in the Trash. */
  DR.isFaceable = (r) => !!r && !r.isFolder && !r.trashedAt && DR.kindOf(r) === 'image' && !DR.isSvg(r);
  /** The stamp a result is kept for: the file's modified time (a changed file is detected again). */
  DR.faceStamp = (r) => String(r.modified || r.time || 0);
  /** The stored result for a picture when it is current, else null. */
  DR.facesOf = (r) => (window.SlopFaces ? F().cache.get('drive', r.id, DR.faceStamp(r)) : Promise.resolve(null));
  DR.faceText = (n) => (n === 0 ? DR.t('drive.faces.none') : DR.t('drive.faces.n', { n }));

  /** Runs the detector on the pictures among items and keeps the results. Asks first while the setting is off. */
  DR.findFaces = async function (items) {
    const pics = (items || []).filter(DR.isFaceable);
    if (!pics.length) return DR.toast(DR.t('drive.faces.pick'));
    if (!F()) return DR.toast(DR.t('drive.faces.na'));
    if (!F().enabled() && !(await F().askOptIn('drive'))) return;
    DR.toast(DR.t('drive.faces.finding_n', { n: pics.length }));
    let found = 0, failed = 0, last = null;
    for (const r of pics) {
      const res = await F().analyse('drive', r.id, DR.faceStamp(r), r.blob);
      if (!res) { failed++; continue; }
      found += res.faces.length; last = { r, n: res.faces.length };
    }
    DR.renderInfo(true);
    if (F().panel && F().panel.isOpen()) F().peopleFor('drive', DR.facesAdapter).refresh();
    if (failed === pics.length) return DR.toast(F().lastError() ? DR.t('drive.faces.failed_msg', { msg: F().lastError() }) : DR.t('drive.faces.failed'));
    if (pics.length === 1 && last) return DR.toast(DR.t('drive.faces.in_name', { faces: DR.faceText(last.n), name: last.r.name }));
    DR.toast(DR.t('drive.faces.found', { faces: DR.t('drive.faces.n', { n: found }), pictures: DR.t('drive.faces.pictures_n', { n: pics.length - failed }) }));
  };

  /** The face badge and boxes for a picture on screen (Quick look, the details panel): the handle, or null when the
   * picture has no current result. badgeHost gets the badge (see shared/faces/view.js). */
  DR.attachFaces = async function (host, r, badgeHost) {
    if (!F() || !F().view || !DR.isFaceable(r)) return null;
    const row = await DR.facesOf(r);
    if (!row) return null;
    return F().view.attachPhoto(host, { scope: 'drive', id: r.id, faces: row.faces, badgeHost });
  };

  /** What the Faces and people dialog needs from Drive: the picture's stamp, its blob, its name, and how to open it. */
  DR.facesAdapter = {
    scope: 'drive', get title() { return DR.t('drive.faces.title'); },
    stampOf: (id) => { const r = DR.S.files.get(id); return r && DR.isFaceable(r) ? DR.faceStamp(r) : null; },
    blobOf: async (id) => { const r = DR.S.files.get(id); return (r && r.blob) || null; },
    nameOf: (id) => ((DR.S.files.get(id) || {}).name || ''),
    openPhoto: (id) => { const r = DR.S.files.get(id); if (!r) return; F().panel.close(); DR.quickLook(r); },
  };
  /** Opens the Faces and people dialog, with the groups loaded from the store. */
  DR.openFaces = function () {
    if (!F() || !F().panel) return DR.toast(DR.t('drive.faces.na'));
    const d = F().panel.open(DR.facesAdapter);
    if (d) F().peopleFor('drive', DR.facesAdapter).load();
  };
})(window.DR);
