/* Slop Upscale: the page's words in the current language (shared/i18n, upscale/i18n). Classic script, before the other
 * app scripts; adds SlopUpscale.t and SlopUpscale.words.
 *   t(key, vars)          SlopI18n.t, or the key when the page has no SlopI18n
 *   words.options(S)      the Model and Format lists' option texts (installed, not in this browser) for the state S
 *   words.fine()          the empty page's note, its model size (#up-quality-size) kept as it is
 *   words.firstUse(bytes) the intake's first-use notice (the Quality model's size in bytes)
 *   words.on(fn)          fn after a language change
 */
(function (g) {
  'use strict';
  const U = (g.SlopUpscale = g.SlopUpscale || {});
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const $ = (id) => document.getElementById(id);
  U.t = t;

  function options(S) {
    const set = (sel, value, key) => { const o = sel && sel.querySelector(`option[value="${value}"]`); if (o) o.textContent = t(key); };
    const m = $('up-model'), f = $('up-format'), un = (S && S.unsupported) || {};
    set(m, 'fast', 'upscale.panel.model_fast');
    set(m, 'quality', S && S.installed ? 'upscale.panel.model_quality_in' : 'upscale.panel.model_quality_out');
    set(m, 'lanczos', 'upscale.panel.model_lanczos');
    set(f, 'png', 'upscale.panel.fmt_png');
    for (const v of ['jpeg', 'webp']) {
      const o = f && f.querySelector(`option[value="${v}"]`);
      if (o) o.textContent = un[v] ? t('upscale.panel.fmt_none', { fmt: v === 'jpeg' ? 'JPEG' : 'WebP' }) : (v === 'jpeg' ? 'JPEG' : 'WebP');   // i18n-ignore: format names
    }
  }
  /** The note under the drop zone: its words around the size, which boot() fills in (and a test reads). */
  function fine() {
    const p = $('up-fine'), size = $('up-quality-size');
    if (!p || !size) return;
    const [a, b = ''] = t('upscale.app.fine').split('{size}');
    p.replaceChildren(a, size, b);
  }
  const firstUse = (bytes) => ({
    title: t('upscale.notice.title'),
    lines: [t('upscale.notice.line')],
    downloads: [{ name: t('upscale.notice.quality'), bytes }],
  });
  const on = (fn) => { if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(fn); };
  U.words = { options, fine, firstUse, on };
})(typeof window !== 'undefined' ? window : globalThis);
