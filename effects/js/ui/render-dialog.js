// Slop Effects render dialog: the format (PNG sequence zip, or WebM or MP4 where the browser can record it), the range
// (the whole composition or the play range) and a progress bar. The render draws the document it had when it started, so
// later edits do not change a render in progress. The file downloads when it is done. Classic script:
// window.SlopEffects.renderDialog.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h } = ns.dom, t = (k, v) => ns.defs.t(k, v);

  /** Opens the render dialog. toast(msg) shows a message. */
  function open(S, toast) {
    const formats = ns.render.formats();
    const format = h('select', { class: 'sui-input', 'aria-label': t('effects.menu.format') }, formats.map((f) => h('option', { value: f.id }, t({ png: 'effects.render.fmt_png', webm: 'effects.render.fmt_webm', mp4: 'effects.render.fmt_mp4' }[f.id] || f.label))));
    const range = h('select', { class: 'sui-input', 'aria-label': t('effects.render.range') },
      h('option', { value: 'all' }, t('effects.render.whole', { s: S.doc.comp.duration.toFixed(2) })),
      h('option', { value: 'range', disabled: S.range ? null : true }, S.range ? t('effects.render.play_range', { a: S.range.in.toFixed(2), b: S.range.out.toFixed(2) }) : t('effects.render.no_range')));
    const bar = h('progress', { max: 1, value: 0, style: 'width:100%', 'aria-label': t('effects.render.progress') });
    const status = h('p', { class: 'fx-empty', style: 'padding:0;text-align:left', role: 'status' }, t('effects.render.size', { w: String(S.doc.comp.width), h: String(S.doc.comp.height), fps: S.doc.comp.fps }));
    const note = h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.render.note'));
    let busy = false, cancel = false, box = null;
    const doc = S.doc; // the render uses this document, so later edits do not change it
    const safe = String(doc.name || 'Untitled').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Untitled'; // i18n-ignore: a file name

    /** Renders and downloads. */
    async function run() {
      busy = true; cancel = false;
      const fmt = format.value;
      const r = range.value === 'range' && S.range ? { in: S.range.in, out: S.range.out } : null;
      const opts = { media: ns.media, range: r, onProgress: (f) => { bar.value = f; status.textContent = t('effects.render.pct', { pct: Math.round(f * 100) }); }, cancel: () => cancel };
      const t0 = performance.now();
      try {
        status.textContent = t('effects.render.busy');
        const blob = fmt === 'png' ? await ns.render.renderPng(doc, opts) : await ns.render.renderVideo(doc, { ...opts, format: fmt });
        const name = fmt === 'png' ? `${safe}-frames.zip` : `${safe}.${fmt}`;
        ns.render.download(blob, name);
        status.textContent = t('effects.render.done', { s: ((performance.now() - t0) / 1000).toFixed(1), name, mb: (blob.size / 1048576).toFixed(2) });
        bar.value = 1;
        toast(t('effects.render.downloaded'));
      } catch (e) {
        status.textContent = e.message === 'cancelled' ? t('effects.render.cancelled') : t('effects.render.failed', { error: e.message });
      } finally {
        busy = false;
      }
      return false;
    }

    box = g.SlopUI.dialog({
      title: t('effects.render.title'), body: h('div', { class: 'fx-group' },
        h('div', { class: 'fx-row' }, h('label', null, t('effects.menu.format')), format, h('span')),
        h('div', { class: 'fx-row' }, h('label', null, t('effects.render.range')), range, h('span')),
        bar, status, note),
      buttons: [
        { label: t('menu.close'), act: () => { if (busy) { cancel = true; return false; } } },
        { label: t('effects.render.title'), primary: true, act: () => { if (busy) return false; run(); return false; } },
      ],
      onClose: () => { cancel = true; },
    });
    return box;
  }

  ns.renderDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
