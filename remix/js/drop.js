/* Reel Remix: drag and drop of bin clips. A clip dragged from the bin onto a slot of the preview replaces that slot's clip in the cut showing at
   the playhead; dropped on a cut in the cut list, it replaces that slot's clip in that cut. ui.js calls install()
   once and cutTargets() for each cut item it draws. */
(function () {
  'use strict';
  const RM = window.RM, SV = window.SlopVideo;
  const D = (RM.dnd = {});
  let opts = null;

  const isItem = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes(RM.ITEM_MIME);
  const itemId = (e) => e.dataTransfer.getData(RM.ITEM_MIME);

  /** The preview slot under a pointer, as { cut, slot } for the cut showing at the playhead, or null. */
  D.slotAt = function (clientX, clientY) {
    const plan = RM.state.plan, cv = RM.preview.canvas;
    if (!plan || !cv) return null;
    const rect = cv.getBoundingClientRect(), W = cv.width, H = cv.height;
    const s = Math.min(rect.width / W, rect.height / H), dw = W * s, dh = H * s;
    const fx = (clientX - rect.left - (rect.width - dw) / 2) / dw, fy = (clientY - rect.top - (rect.height - dh) / 2) / dh;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    const t = RM.preview.t;
    for (let ci = 0; ci < plan.cuts.length; ci++) for (const it of plan.cuts[ci]) {
      if (!(t >= it.start && t < it.start + it.dur)) continue;
      const r = SV.random.regionFor(plan, it);
      if (r && fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) return { cut: ci, slot: it.slot };
    }
    return null;
  };
  /** Replace a slot with a bin item and redraw the plan. */
  function place(ci, slot, id) {
    const name = (RM.state.items.find((x) => x.id === id) || {}).name || RM.t('remix.drop.clip');
    if (!RM.replaceSlot(ci, slot, id)) { opts.say(RM.t('remix.drop.no_slot')); return; }
    opts.redraw();
    opts.say(RM.t('remix.drop.put', { name, cut: ci + 1, slot: slot + 1 }));
  }
  /** Make a cut item (a span in the cut list) a drop target for bin items. */
  D.cutTargets = function (el, ci, slot) {
    el.addEventListener('dragover', (e) => { if (!isItem(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('over'); });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => { // intake-ok: a bin clip dropped on a cut, not a file
      if (!isItem(e)) return;
      e.preventDefault(); e.stopPropagation(); el.classList.remove('over');
      place(ci, slot, itemId(e));
    });
  };
  /** Wire the stage for bin items dropped on the preview. Files dropped on the stage go to the bin through SlopDrop
   (ui.js). o: { stage, redraw, say }. */
  D.install = function (o) {
    opts = o;
    const stage = o.stage;
    stage.addEventListener('dragover', (e) => {
      if (!isItem(e)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; stage.classList.add('over');
    });
    stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('over'); });
    stage.addEventListener('drop', (e) => { // intake-ok: a bin clip dropped on a slot, not a file
      if (!isItem(e)) return;
      e.preventDefault(); stage.classList.remove('over');
      if (!RM.state.plan) { o.say(RM.t('remix.drop.first')); return; }
      const hit = D.slotAt(e.clientX, e.clientY);
      if (hit) place(hit.cut, hit.slot, itemId(e));
      else o.say(RM.t('remix.drop.miss'));
    });
  };
})();
