/* SlopIsolate video — the limits and what this browser can do. CO.video.limits:
 *   MAX_SEC (30 s), MAX_PHONE_SEC (10 s), MAX_LONG / MAX_SHORT (1280 × 720 frames), MASK_LONG (384 px mask), MAX_FPS (30).
 *   support() → { decode: 'webcodecs'|'element'|null, encode, alphaWebm, mp4, phone, notes[] } (cached).
 *   check(meta) → { ok, msg, limited } for a file's duration and size. Messages are shown in the panel as they are. */
(function () {
  'use strict';
  const CO = window.CO, V = CO.video || (CO.video = {});
  const L = V.limits = {
    MAX_SEC: 30, MAX_PHONE_SEC: 10, MAX_LONG: 1280, MAX_SHORT: 720, MASK_LONG: 384, MAX_FPS: 30,
  };
  let cached = null;

  /** Phones (or small coarse-pointer screens) get a shorter limit: the matte runs on the device's own CPU. */
  L.isPhone = function () {
    try {
      const uad = navigator.userAgentData;
      if (uad && typeof uad.mobile === 'boolean') return uad.mobile;
      return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 700);
    } catch (e) { return false; }
  };
  L.maxSec = () => (L.isPhone() ? L.MAX_PHONE_SEC : L.MAX_SEC);

  /** What this browser can do. Cached for the page. */
  L.support = function () {
    if (cached) return cached;
    const s = { decode: null, encode: false, alphaWebm: false, mp4: false, phone: L.isPhone(), notes: [] };
    if (typeof VideoDecoder === 'function' && typeof VideoFrame === 'function' && typeof EncodedVideoChunk === 'function') s.decode = 'webcodecs';
    else s.decode = 'element';
    if (typeof VideoEncoder === 'function') s.encode = true;
    cached = s;
    if (!s.encode) s.notes.push(CO.util.t('cutout.video.no_encoder'));
    if (s.decode === 'element') s.notes.push(CO.util.t('cutout.video.no_webcodecs'));
    return s;
  };
  /** Async probes (run once after the first check): WebM alpha and MP4 colour encode. */
  L.probe = async function () {
    const s = L.support();
    if (!s.encode || s.probed) return s;
    s.probed = true;
    const ok = async (cfg) => { try { return !!(await VideoEncoder.isConfigSupported(cfg)).supported; } catch (e) { return false; } };
    s.alphaWebm = await ok({ codec: 'vp09.00.10.08', width: 320, height: 240, alpha: 'keep' });
    s.mp4Codec = (await ok({ codec: 'avc1.42001f', width: 320, height: 240 })) ? 'avc1.42001f' : ((await ok({ codec: 'vp09.00.10.08', width: 320, height: 240 })) ? 'vp09.00.10.08' : null);
    s.mp4 = !!s.mp4Codec;
    if (!s.alphaWebm) s.notes.push(CO.util.t('cutout.video.no_alpha'));
    return s;
  };

  /** Limit check for a probed video: { ok, limited, msg }. limited = clip is longer than the limit and will be cut. */
  L.check = function (meta) {
    const max = L.maxSec(), notes = [];
    let ok = true, limited = false;
    if (!L.support().decode) { ok = false; notes.push(CO.util.t('cutout.video.no_decode')); }
    if (meta.duration > max) { limited = true; notes.push(CO.util.t('cutout.video.too_long', { max })); }
    if (meta.w > meta.h ? meta.w > L.MAX_LONG : meta.h > L.MAX_LONG) notes.push(CO.util.t('cutout.video.scaled'));
    if (L.isPhone()) notes.push(CO.util.t('cutout.video.phone'));
    return { ok, limited, msg: notes.join(' ') };
  };
  /** Output size for a source size: scaled so the long side is at most MAX_LONG and the short side MAX_SHORT. */
  L.outSize = function (w, h) {
    const long = Math.max(w, h), short = Math.min(w, h);
    let k = Math.min(1, L.MAX_LONG / long, L.MAX_SHORT / short);
    const ev = (x) => Math.max(2, Math.round(x * k / 2) * 2);
    return { w: ev(w), h: ev(h), k };
  };
  /** Mask size: the matte runs at MASK_LONG on the long side (speed), then is upscaled. */
  L.maskSize = function (w, h) {
    const k = Math.min(1, L.MASK_LONG / Math.max(w, h));
    return { w: Math.max(2, Math.round(w * k)), h: Math.max(2, Math.round(h * k)) };
  };
})();
