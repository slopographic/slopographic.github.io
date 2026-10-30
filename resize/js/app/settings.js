/* Slop Resize: the settings panel. Reads the form into one settings object, writes one back (presets), shows only the
 * controls that suit the chosen mode, turns the settings into what the queue runs, and keeps the form consistent:
 * Keep aspect ratio locks the other side to the first picture's real ratio (only for Fit inside and Stretch: Fit and
 * Cover make exactly the typed or preset box, see size.locksBox), and a format with no transparency (JPEG)
 * turns off the Transparent choice and says what fills the gaps. Classic script; exposes window.SlopResize.settings.
 *   DEFAULTS                 the settings a new session starts with
 *   read() / write(s)        the form <-> settings object (ids rs-*, see index.html)
 *   fromSaved(obj)           a saved settings object, checked and filled in with defaults
 *   toRun(s)                 { spec, image, video } for queue.run
 *   showModes(mode)          hides the rows that do not apply to the mode (data-modes="size bytes" on each row)
 *   alphaUI()                Transparent is off and explained for a format with no alpha (call after the format changes)
 *   setSource(src, name)     the picture the aspect lock uses (src = { w, h }, or null when the list is empty)
 *   wireLock()               the width/height/keep-ratio handlers (once, at start) */
(function (g) {
  'use strict';
  const NS = g.SlopResize, S = (NS.settings = {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  S.DEFAULTS = {
    mode: 'size', w: 1080, h: 1080, keepRatio: true, scale: 50, long: 1920, maxKB: 500,
    fill: 'fit', anchor: 'center', bg: 'transparent', even: true, resample: 'best',
    mime: 'image/jpeg', quality: 85,
    vformat: 'mp4', vquality: 'medium', fps: 30, audio: true,
  };
  const KEYS = Object.keys(S.DEFAULTS);
  const ANCHORS = NS.size.ANCHORS, FILLS = NS.size.FILLS, MODES = NS.size.MODES, RESAMPLE = NS.size.RESAMPLE;

  const val = (id) => { const e = $(id); return e ? e.value : ''; };
  const num = (id) => { const n = parseFloat(val(id)); return Number.isFinite(n) ? n : 0; };
  const chk = (id) => { const e = $(id); return !!(e && e.checked); };
  const setVal = (id, v) => { const e = $(id); if (e) e.value = String(v); };
  const setChk = (id, v) => { const e = $(id); if (e) e.checked = !!v; };

  S.read = function () {
    return {
      mode: val('rs-mode'), w: num('rs-w'), h: num('rs-h'), keepRatio: chk('rs-keep'),
      scale: num('rs-scale'), long: num('rs-long'), maxKB: num('rs-kb'),
      fill: val('rs-fill'), anchor: val('rs-anchor'), resample: val('rs-resample'),
      bg: chk('rs-transparent') ? 'transparent' : val('rs-bg'), even: chk('rs-even'),
      mime: val('rs-mime'), quality: num('rs-quality'),
      vformat: val('rs-vformat'), vquality: val('rs-vquality'), fps: num('rs-fps'), audio: chk('rs-audio'),
    };
  };

  let keptTransparent = true; // the Transparent choice to come back to when a format with alpha is picked again

  S.write = function (s) {
    setVal('rs-mode', s.mode); setVal('rs-w', s.w); setVal('rs-h', s.h); setChk('rs-keep', s.keepRatio);
    setVal('rs-scale', s.scale); setVal('rs-long', s.long); setVal('rs-kb', s.maxKB);
    setVal('rs-fill', s.fill); setVal('rs-anchor', s.anchor); setVal('rs-resample', RESAMPLE.includes(s.resample) ? s.resample : 'best');
    keptTransparent = s.bg === 'transparent';
    setChk('rs-transparent', keptTransparent); if (s.bg !== 'transparent') setVal('rs-bg', s.bg);
    setChk('rs-even', s.even); setVal('rs-mime', s.mime); setVal('rs-quality', s.quality);
    setVal('rs-vformat', s.vformat); setVal('rs-vquality', s.vquality); setVal('rs-fps', s.fps); setChk('rs-audio', s.audio);
    S.alphaUI();
    S.showModes(s.mode);
    S.labels();
    S.ratioNote();
  };

  /** A saved settings object (from Drive or local storage) with only known keys, each of the right type. */
  S.fromSaved = function (o) {
    const out = Object.assign({}, S.DEFAULTS);
    if (!o || typeof o !== 'object') return out;
    for (const k of KEYS) {
      const d = S.DEFAULTS[k], v = o[k];
      if (typeof d === 'number') { if (Number.isFinite(v)) out[k] = v; }
      else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
      else if (typeof v === 'string') out[k] = v;
    }
    if (!MODES.includes(out.mode)) out.mode = S.DEFAULTS.mode;
    if (!FILLS.includes(out.fill)) out.fill = S.DEFAULTS.fill;
    if (!ANCHORS.includes(out.anchor)) out.anchor = S.DEFAULTS.anchor;
    if (!RESAMPLE.includes(out.resample)) out.resample = S.DEFAULTS.resample;
    if (!NS.format.byMime(out.mime)) out.mime = S.DEFAULTS.mime;
    return out;
  };

  /** Settings from a task page's link, for this visit only (nothing is saved): ?w=1080&h=1080 a box, ?kb=100 a file size
   *  limit (the picture keeps its size unless w or h is given too), ?scale=50 a percentage, ?long=1920 the long edge,
   *  ?fill=fit|cover|stretch|within, ?resample=best|nearest, ?format=jpg|png|webp. Unknown or out-of-range values are ignored. */
  S.presetOf = function (search) {
    const q = new URLSearchParams(search || ''), out = {};
    const int = (k, lo, hi) => { const v = q.get(k); return v !== null && /^\d+$/.test(v) && +v >= lo && +v <= hi ? +v : 0; };
    const w = int('w', 1, 16384), h = int('h', 1, 16384), kb = int('kb', 1, 100000), scale = int('scale', 1, 400), long = int('long', 1, 16384);
    if (w || h) Object.assign(out, { mode: 'size', w, h });
    if (kb) Object.assign(out, { mode: 'bytes', maxKB: kb, w, h });
    else if (scale) Object.assign(out, { mode: 'scale', scale });
    else if (long) Object.assign(out, { mode: 'long', long });
    if (FILLS.includes(q.get('fill'))) out.fill = q.get('fill');
    if (RESAMPLE.includes(q.get('resample'))) out.resample = q.get('resample');
    const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[q.get('format')];
    if (mime) out.mime = mime;
    return out;
  };

  /** What the queue runs with: the geometry spec plus the encoder choices. */
  S.toRun = function (s) {
    const spec = NS.size.normalize({ mode: s.mode, w: s.w, h: s.h, keepRatio: s.keepRatio, scale: s.scale, long: s.long, fill: s.fill, anchor: s.anchor, resample: s.resample, bg: s.bg, even: s.even, maxBytes: s.maxKB * 1024 });
    return {
      spec,
      image: { mime: s.mime, quality: Math.min(1, Math.max(0.05, s.quality / 100)) },
      video: { format: s.vformat === 'webm' ? 'webm' : 'mp4', fps: [24, 25, 30, 50, 60].includes(s.fps) ? s.fps : 30, quality: ['low', 'medium', 'high'].includes(s.vquality) ? s.vquality : 'medium', audio: !!s.audio },
    };
  };

  S.showModes = function (mode) {
    for (const row of document.querySelectorAll('[data-modes]')) {
      row.hidden = !row.dataset.modes.split(/\s+/).includes(mode);
    }
  };

  /** Labels that show a value next to its control. */
  S.labels = function () {
    const sc = $('rs-scale'), out = $('rs-scale-out');
    if (sc && out) out.textContent = sc.value + '%';
    const q = $('rs-quality'), qo = $('rs-quality-out');
    if (q && qo) qo.textContent = q.value + '%';
  };

  /** JPEG (no alpha) cannot keep transparency: Transparent is turned off and the note says what fills the gaps. */
  S.alphaUI = function () {
    const f = NS.format.byMime(val('rs-mime')), tr = $('rs-transparent'), note = $('rs-alpha-note');
    if (!f || !tr) return;
    const flat = !f.alpha;
    if (flat) {
      if (!tr.disabled) keptTransparent = tr.checked;
      tr.checked = false; tr.disabled = true;
    } else if (tr.disabled) {
      tr.disabled = false; tr.checked = keptTransparent;
    }
    if (note) {
      note.hidden = !flat;
      note.textContent = flat ? t('resize.panel.no_alpha', { format: f.label }) : '';
    }
  };

  // The aspect lock. ratio is the first picture's width ÷ height (0 when there is none).
  let ratio = 0;
  const locked = () => chk('rs-keep') && ratio > 0 && ['size', 'bytes'].includes(val('rs-mode')) && NS.size.locksBox(val('rs-fill'));

  /** Make the side not typed follow the one that was. from is 'w' or 'h'. Writes the value only, so no event loops. */
  function follow(from) {
    if (!locked()) return;
    const even = chk('rs-even');
    if (from === 'w') { const h = NS.size.lockSide('w', val('rs-w'), ratio, even); if (h) setVal('rs-h', h); }
    else { const w = NS.size.lockSide('h', val('rs-h'), ratio, even); if (w) setVal('rs-w', w); }
  }

  /** The picture the lock uses. Called with the first picture in the list (or null). A new ratio re-derives the other side. */
  S.setSource = function (src, name) {
    const r = src && src.w > 0 && src.h > 0 ? src.w / src.h : 0;
    source = r ? { w: src.w, h: src.h, name: name || '' } : null;
    S.ratioNote();
    if (r === ratio) return;
    ratio = r;
    refollow();
  };
  let source = null;
  const refollow = () => { if (num('rs-w') > 0) follow('w'); else follow('h'); };

  /** The line under Keep aspect ratio: what the lock follows, or that Fit and Cover keep the box. */
  S.ratioNote = function () {
    const note = $('rs-ratio-note');
    if (!note) return;
    if (chk('rs-keep') && !NS.size.locksBox(val('rs-fill'))) {
      note.textContent = t(val('rs-fill') === 'cover' ? 'resize.panel.note_cover' : 'resize.panel.note_fit');
    } else {
      note.textContent = source
        ? (source.name ? t('resize.panel.note_follows_name', { name: source.name, w: String(source.w), h: String(source.h) }) : t('resize.panel.note_follows', { w: String(source.w), h: String(source.h) }))
        : t('resize.panel.note_first');
    }
  };

  S.wireLock = function () {
    $('rs-w').addEventListener('input', () => follow('w'));
    $('rs-h').addEventListener('input', () => follow('h'));
    $('rs-keep').addEventListener('change', () => { refollow(); S.ratioNote(); });
    $('rs-fill').addEventListener('change', () => { refollow(); S.ratioNote(); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
