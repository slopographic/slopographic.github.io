/* Slop Gallery: the reel spec and manifest, as plain data (no DOM, no storage, so tests and the dialog share it).
 * A reel is the selected photos, in an order, with a template, a target length, a pace and an aspect. Its manifest
 * is one Slop Drive record (type application/x-slop-reel+json) that SlopCut reads on launch (?drive=<manifest id>).
 * Exposes window.SlopGallery.reelCore. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const TEMPLATES = [
    { id: 'random', label: 'Random edit' }, { id: 'single', label: 'Single photo' }, { id: 'split', label: 'Split screen' },   // i18n-ignore: shown as gallery.reel.<area>_<id> (ui/reel.js)
    { id: 'grid', label: 'Grid' }, { id: 'reel', label: '9:16 reel' },   // i18n-ignore: shown as gallery.reel.<area>_<id> (ui/reel.js)
  ];
  const PACES = [{ id: 'slow', label: 'Slow' }, { id: 'medium', label: 'Medium' }, { id: 'fast', label: 'Fast' }];   // i18n-ignore: shown as gallery.reel.<area>_<id> (ui/reel.js)
  const ASPECTS = [{ id: '16:9', label: '16:9 landscape' }, { id: '9:16', label: '9:16 vertical' }, { id: '1:1', label: '1:1 square' }];   // i18n-ignore: shown as gallery.reel.<area>_<id> (ui/reel.js)
  const ORDERS = [{ id: 'oldest', label: 'Oldest first' }, { id: 'newest', label: 'Newest first' }, { id: 'selection', label: 'Selection order' }];   // i18n-ignore: shown as gallery.reel.<area>_<id> (ui/reel.js)
  const MIN_FILES = 2, MIN_LENGTH = 5, MAX_LENGTH = 600;
  const MANIFEST_TYPE = 'application/x-slop-reel+json', FORMAT = 'slop-reel', VERSION = 1;
  const has = (list, id) => list.some((x) => x.id === id);
  const pad = (n) => String(n).padStart(2, '0');
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // the dialog's messages (gallery/i18n)

  /** The errors for a spec and a number of selected photos. An empty array means the reel can be made. */
  function validate(spec, count) {
    const errs = [];
    if (count < MIN_FILES) errs.push(t('gallery.reel.err_count', { min: MIN_FILES, n: count }));
    const len = Number(spec.length);
    if (spec.length === '' || spec.length == null || !isFinite(len)) errs.push(t('gallery.reel.err_length'));
    else if (len < MIN_LENGTH) errs.push(t('gallery.reel.err_short', { min: MIN_LENGTH }));
    else if (len > MAX_LENGTH) errs.push(t('gallery.reel.err_long', { max: MAX_LENGTH / 60 }));
    if (!has(TEMPLATES, spec.template)) errs.push(t('gallery.reel.err_template'));
    if (!has(PACES, spec.pace)) errs.push(t('gallery.reel.err_pace'));
    if (!has(ASPECTS, spec.aspect)) errs.push(t('gallery.reel.err_aspect'));
    if (!has(ORDERS, spec.order)) errs.push(t('gallery.reel.err_order'));
    return errs;
  }

  /** Photos (library records) in the order the reel plays them. Ties keep the selection order. */
  function orderPhotos(photos, order) {
    const list = photos.slice();
    if (order === 'selection') return list;
    const sign = order === 'newest' ? -1 : 1;
    return list.map((p, i) => ({ p, i })).sort((a, b) => sign * ((a.p.takenAt || 0) - (b.p.takenAt || 0)) || a.i - b.i).map((x) => x.p);
  }

  /** The Slop Drive folder name for a reel made at date: "Reel 2026-10-11 14.05". */
  function folderName(date) {
    return `Reel ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}`;
  }
  /** "IMG_1.jpg" becomes "IMG_1 (cutout).png" when stored with a cut-out. */
  const cutoutName = (name) => (String(name || 'photo').replace(/\.[^./\\]+$/, '') || 'photo') + ' (cutout).png';

  /** The manifest: what SlopCut needs to build the reel. files are Drive ids in play order; overlays are cut-out PNGs. */
  function buildManifest({ spec, fileIds, overlays = [], now = new Date() }) {
    return {
      format: FORMAT, version: VERSION, created: now.toISOString(), from: 'gallery',
      template: spec.template, length: Number(spec.length), pace: spec.pace, aspect: spec.aspect, order: spec.order,
      files: fileIds.slice(),
      overlays: overlays.map((o) => ({ id: o.id, of: o.of })),
    };
  }

  G.reelCore = {
    TEMPLATES, PACES, ASPECTS, ORDERS, MIN_FILES, MIN_LENGTH, MAX_LENGTH, MANIFEST_TYPE, FORMAT, VERSION,
    validate, orderPhotos, folderName, cutoutName, buildManifest,
    /** The spec the dialog starts from (a 9:16 template turns the aspect vertical; see the dialog). */
    defaults: () => ({ template: 'random', length: 30, pace: 'medium', aspect: '16:9', order: 'oldest', cutout: false }),
  };
})();
