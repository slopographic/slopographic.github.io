/* SlopCut: layout cells on the program monitor and the timeline. The monitor draws a numbered outline for each slot
   of the current layout, and a bin item dropped on a cell fills that slot. The timeline draws an empty slot as a
   dashed box on its track over the layout's time span. Slot i is video track i (V(i+1)). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, L = SE.layout, T = SE.templates, SV = window.SlopVideo; // SE.timeline loads later: read it at call time
  const C = SE.cells = {};
  const MIME_MEDIA = 'application/x-slopedit-media';
  let stage = null, ov = null;
  const hasMedia = (e) => !!e.dataTransfer && [...(e.dataTransfer.types || [])].includes(MIME_MEDIA);

  /** Regions of the current layout's template (empty when there is no layout). */
  C.rects = () => { const lay = SE.doc.layout, tpl = lay && T.get(lay.tpl); return tpl ? tpl.slots : []; };

  /** Slot under a pointer event on the monitor, or null. Works in fractions of the frame, so it follows any zoom. */
  C.slotAt = function (e) {
    const lay = SE.doc.layout, r = ov.getBoundingClientRect();
    if (!lay || !r.width || !r.height) return null;
    return SV.slots.cellAt(lay.tpl, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  /** Outlines and numbers over the monitor (overlay pixels W × H). Filled cells are drawn fainter. */
  C.draw = function (og, W, H) {
    const lay = SE.doc.layout;
    if (!lay) return;
    const dpr = SE.preview.dpr || 1;
    og.save();
    og.font = '600 ' + Math.round(11 * dpr) + 'px monospace'; og.textBaseline = 'top'; // i18n-ignore: a canvas font
    C.rects().forEach((r, i) => {
      const x = r.x * W, y = r.y * H, w = r.w * W, h = r.h * H, empty = !lay.slots[i];
      og.setLineDash(empty ? [6 * dpr, 4 * dpr] : []);
      og.strokeStyle = empty ? 'rgba(212,255,58,.95)' : 'rgba(212,255,58,.3)';
      og.lineWidth = 1.5 * dpr;
      og.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
      og.fillStyle = empty ? 'rgba(212,255,58,.9)' : 'rgba(0,0,0,.6)';
      og.fillRect(x + 4 * dpr, y + 4 * dpr, 18 * dpr, 16 * dpr);
      og.fillStyle = empty ? '#111' : '#fff';
      og.fillText(String(i + 1), x + 9 * dpr, y + 7 * dpr);
    });
    og.restore();
  };

  /** Empty slots on the timeline: a dashed box on the slot's track over the layout's time span. */
  C.drawTimeline = function (g, col) {
    const lay = SE.doc.layout, TL = SE.timeline;
    if (!lay) return;
    const vts = M.videoTracks(SE.doc);
    lay.slots.forEach((id, i) => {
      const tk = vts[i], row = tk && TL.rowOf(tk.id);
      if (id || !row) return;
      const x = TL.x(lay.start), w = Math.max(4, lay.dur * TL.pps), y = row.y - TL.scrollY + 3;
      g.save();
      g.fillStyle = 'rgba(212,255,58,.07)'; g.fillRect(x, y, w, row.h - 7);
      g.setLineDash([5, 4]); g.strokeStyle = col.accent; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, row.h - 8);
      g.setLineDash([]); g.fillStyle = col.dim; g.font = '600 10px ' + col.ui; g.textBaseline = 'middle';
      g.fillText(U.t('slopedit.tpl.slot_empty', { n: i + 1 }), x + 6, y + (row.h - 7) / 2);
      g.restore();
    });
  };

  /** Monitor drops: a bin item dropped on a cell fills that slot (a new clip at the layout's start). */
  function onDragOver(e) {
    if (!hasMedia(e) || !SE.doc.layout) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(e) {
    if (!hasMedia(e)) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(MIME_MEDIA), meta = M.media(SE.doc, id);
    if (!SE.doc.layout) { SlopUI.toast(U.t('slopedit.render.choose_a_layout_first_templates')); return; }
    if (!meta || !SE.media.ready(id)) { SlopUI.toast(U.t('slopedit.render.that_item_is_still_analysing')); return; }
    const i = C.slotAt(e);
    if (i == null) return;
    SE.change(U.t('slopedit.tpl.put_media_in_slot'), (p) => L.placeMedia(p, i, M.media(p, id)));
    SE.app.status(U.t('slopedit.tpl.slot_n', { n: i + 1 }) + ': ' + meta.name);
  }
  C.init = function () {
    stage = SE.app.els.monStage; ov = SE.app.els.overlay;
    stage.addEventListener('dragover', onDragOver);
    stage.addEventListener('drop', onDrop); // intake-ok: a bin item dropped on a layout cell, not a file
  };
})();
