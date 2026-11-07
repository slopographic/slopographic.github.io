/* Slop Gallery: "Make reel". The Make reel dialog (template, target length, pace, aspect, order, Cut out subjects first),
 * then run(): photos go into a Slop Drive folder, optional cut-outs follow (cancellable, rolled back on cancel), a manifest
 * is written and SlopCut opens on it (?drive=<manifest id>). See HANDOFF.md for the flow and the manifest format.
 * Entry points: init(button) for the toolbar button, open(ids) for menus and the command palette.
 * Exposes window.SlopGallery.reel. */
(function () {
  'use strict';
  const G = (window.SlopGallery = window.SlopGallery || {});
  const C = () => G.reelCore;
  const el = (...a) => SlopUI.el(...a);
  const toast = (m) => window.SlopUI && SlopUI.toast(m);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const STAGE = { runtime: 'gallery.reel.stage_runtime', model: 'gallery.reel.stage_model', init: 'gallery.reel.stage_init', infer: 'gallery.reel.stage_infer', refine: 'gallery.reel.stage_refine' };
  const stage = (p) => t(STAGE[p] || 'gallery.reel.stage_working');
  /** The option labels of the dialog, by the spec's ids (core/reel.js keeps the English labels for the data). */
  const LABELS = {
    tpl: { random: 'gallery.reel.tpl_random', single: 'gallery.reel.tpl_single', split: 'gallery.reel.tpl_split', grid: 'gallery.reel.tpl_grid', reel: 'gallery.reel.tpl_reel' },
    pace: { slow: 'gallery.reel.pace_slow', medium: 'gallery.reel.pace_medium', fast: 'gallery.reel.pace_fast' },
    aspect: { '16:9': 'gallery.reel.aspect_16_9', '9:16': 'gallery.reel.aspect_9_16', '1:1': 'gallery.reel.aspect_1_1' },
    order: { oldest: 'gallery.reel.order_oldest', newest: 'gallery.reel.order_newest', selection: 'gallery.reel.order_selection' },
  };
  class Cancelled extends Error { constructor() { super('Cancelled'); this.cancelled = true; } }

  /** Opens a tab for SlopCut inside the click (browsers allow that), filled in when the reel is ready. */
  function openTab() {
    try {
      const w = window.open('', '_blank');
      if (w) w.document.write('<!doctype html><title>SlopCut</title><p style="font:16px system-ui;padding:24px">' + t('gallery.reel.making').replace(/[<&]/g, '') + '</p>');
      return w;
    } catch (e) { return null; }
  }
  function editorUrl(manifestId) {
    return SlopHub.urlOf(SlopHub.appById('slopedit'), { drive: manifestId });
  }
  /** Points the tab from openTab() at SlopCut (or this tab, when no tab could be opened). */
  function openEditor(manifestId, win) {
    const url = editorUrl(manifestId);
    if (win && !win.closed) { try { win.location.href = url; return; } catch (e) { /* fall through */ } }
    location.href = url;
  }

  /** The progress dialog for the cut-outs. Cancel, Escape or closing it calls onCancel once. */
  function progress(total, onCancel) {
    let done = false;
    const msg = el('p', { class: 'sui-p' }, t('gallery.reel.starting'));
    const bar = el('progress', { class: 'reel-bar', max: String(total), value: '0' });
    const d = SlopUI.dialog({ title: t('gallery.reel.cutting_title'), body: el('div', { class: 'reel-prog' }, msg, bar), buttons: [{ label: t('menu.cancel') }], modal: true, onClose: () => { if (!done) onCancel(); } });
    return {
      set(n, text) { bar.value = String(n); if (text) msg.textContent = text; },
      close() { done = true; d.close(true); },
    };
  }

  /** Makes the reel. Resolves with { cancelled, error, failed, folderId, manifestId, files (Drive ids in order), overlays }. */
  async function run(photos, spec, opts = {}) {
    const ctl = new AbortController();
    if (opts.signal) { if (opts.signal.aborted) ctl.abort(); else opts.signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
    const check = () => { if (ctl.signal.aborted) throw new Cancelled(); };
    const ordered = C().orderPhotos(photos, spec.order);
    const name = C().folderName(new Date());
    const out = { cancelled: false, error: '', folderId: null, manifestId: null, files: [], fileIds: [], overlays: [], failed: [] };
    let session = null, bar = null;
    try {
      session = await G.reelDrive.begin(name);
      out.folderId = session.folderId;
      if (spec.cutout) bar = progress(ordered.length, () => ctl.abort());
      for (const p of ordered) {
        check();
        const row = await G.db.get('originals', p.id);
        if (!row || !row.blob) { out.failed.push(p.name); continue; }
        out.fileIds.push({ photo: p, id: await session.addPhoto(p, row.blob) });
      }
      if (out.fileIds.length < C().MIN_FILES) throw new Error(t('gallery.reel.too_few'));
      if (spec.cutout) {
        const n = out.fileIds.length;
        for (let i = 0; i < n; i++) {
          check();
          const { photo, id } = out.fileIds[i];
          bar.set(i, t('gallery.reel.cutting', { i: i + 1, n, name: photo.name }));
          try {
            const row = await G.db.get('originals', photo.id);
            const png = await G.reelCutout.cutOut(row.blob, { signal: ctl.signal, onProgress: (pr) => bar.set(i, t('gallery.reel.cutting_stage', { i: i + 1, n, name: photo.name, stage: stage(pr.phase) })) });
            check();
            out.overlays.push({ id: await session.addOverlay(photo, id, png), of: id });
          } catch (e) {
            check();
            out.failed.push(t('gallery.reel.no_cutout', { name: photo.name, error: String(e.message || e) }));
          }
        }
        bar.set(n, t('gallery.reel.saving'));
      }
      check();
      out.files = out.fileIds.map((x) => x.id);
      const manifest = C().buildManifest({ spec, fileIds: out.files, overlays: out.overlays, now: new Date() });
      out.manifestId = await session.finish(manifest);
      if (bar) bar.close();
      if (opts.open !== false) openEditor(out.manifestId, opts.win);
      toast(t(out.overlays.length ? 'gallery.reel.ready_cutouts' : 'gallery.reel.ready', { n: out.fileIds.length, c: out.overlays.length }));
      if (out.failed.length) SlopUI.alert(t('gallery.reel.left_out_title'), t('gallery.reel.left_out_body', { list: out.failed.slice(0, 10).join(', ') + (out.failed.length > 10 ? '…' : '') }));
      return out;
    } catch (e) {
      if (bar) bar.close();
      if (opts.win && !opts.win.closed) try { opts.win.close(); } catch (x) { /* ignore */ }
      if (session) await session.abort();
      if (e && e.cancelled) { out.cancelled = true; toast(t('gallery.reel.cancelled')); return out; }
      out.error = e.message || String(e);
      SlopUI.alert(t('gallery.reel.title'), t('gallery.reel.failed', { error: out.error }));
      return out;
    }
  }

  /** The Make reel dialog for these photos. Validation keeps it open with the reason shown. */
  function dialog(photos) {
    const D = C().defaults(), n = photos.length;
    const opt = (list, area) => list.map((x) => [x.id, LABELS[area][x.id] ? t(LABELS[area][x.id]) : x.label]);
    const tpl = SlopUI.select(opt(C().TEMPLATES, 'tpl'), D.template);
    const len = SlopUI.number(D.length, C().MIN_LENGTH, C().MAX_LENGTH, 1);
    const pace = SlopUI.select(opt(C().PACES, 'pace'), D.pace);
    const aspect = SlopUI.select(opt(C().ASPECTS, 'aspect'), D.aspect);
    const order = SlopUI.select(opt(C().ORDERS, 'order'), D.order);
    const cut = SlopUI.check(t('gallery.reel.cut_first'), D.cutout);
    const err = el('p', { class: 'sui-p reel-err', role: 'alert' });
    const spec = () => ({ template: tpl.value, length: len.value, pace: pace.value, aspect: aspect.value, order: order.value, cutout: cut.input.checked });
    const check = () => { const e = C().validate(spec(), n); err.textContent = e.join(' '); return e; };
    tpl.addEventListener('change', () => { if (tpl.value === 'reel') aspect.value = '9:16'; check(); });
    for (const x of [len, pace, aspect, order]) { x.addEventListener('input', check); x.addEventListener('change', check); }
    const body = el('div', { class: 'reel-form' },
      el('p', { class: 'sui-p' }, t('gallery.reel.selected', { n })),
      SlopUI.field(t('gallery.reel.template'), tpl), SlopUI.field(t('gallery.reel.length'), len, t('gallery.reel.seconds')), SlopUI.field(t('gallery.reel.pace'), pace),
      SlopUI.field(t('gallery.reel.aspect'), aspect), SlopUI.field(t('gallery.reel.order'), order), cut.el, err);
    SlopUI.dialog({
      title: t('gallery.reel.title'), body, buttons: [{ label: t('menu.cancel') }, { label: t('gallery.reel.title'), primary: true, act: () => {
        const s = spec();
        if (C().validate(s, n).length) { check(); return false; }
        const win = openTab();
        run(photos, s, { win });
        return undefined;
      } }],
    });
    check();
  }

  /** Opens the dialog for the photo ids (the selection, from the menus and the palette). */
  function open(ids) {
    const photos = [...new Set(ids || [])].map((id) => G.library.photo(id)).filter(Boolean);
    dialog(photos);
  }

  /** The toolbar button: shown while something is selected. */
  function init(button) {
    const sync = () => { if (button) button.hidden = G.state.selected.length === 0; };
    if (button) button.addEventListener('click', () => open(G.state.selected));
    G.state.subscribe((what) => { if (what === 'selection') sync(); });
    sync();
  }

  G.reel = { open, run, init, editorUrl, openEditor };
})();
