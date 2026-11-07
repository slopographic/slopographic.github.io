/* SlopCut: ui/context — right-click and keyboard (Menu key / Shift+F10) menus for the program monitor:
   a clip under the pointer (element, title clips included) or the frame itself. Clips on the timeline,
   markers and lanes use timeline/menu.js; media in the bin uses ui/bin.js; track headers use
   timeline/heads.js. This file only chooses the target and reuses those menus and the SlopCmd commands. */
(function () {
  'use strict';
  const SE = window.SE, A = SE.app, C = SE.cmd, TL = SE.timeline, M = SE.model;
  const isMenuKey = (e) => e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'); // i18n-ignore: a key name

  /** Items for the frame in the monitor: transport, snapshot and the safe-area overlay. */
  function frameItems() {
    const raw = [
      C.item('play.toggle', SE.player.playing ? SE.util.t('slopedit.ctx.pause') : SE.util.t('slopedit.ctx.play')), C.item('play.prevFrame'), C.item('play.nextFrame'), '-',
      C.item('file.snapshot'), C.item('file.snapshotSend'), '-', C.item('view.safe')
    ];
    const out = [];
    raw.forEach((it) => {
      if (it === '-') { if (out.length && out[out.length - 1] !== '-') out.push('-'); return; }
      if (it && !it.disabled) out.push(it);
    });
    while (out.length && out[out.length - 1] === '-') out.pop();
    return out;
  }
  /** The clip menu for a clip id, through the timeline's own menu. */
  function clipMenu(id, x, y) {
    const c = M.clip(SE.doc, id);
    if (c) TL.contextMenu({ area: 'clip', clip: c, t: SE.player.time, row: null }, x, y);
  }
  const firstSelected = () => [...A.sel][0] || null;

  /* right-click on the monitor: the clip under the pointer, else the frame */
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest || !e.target.closest('#monStage')) return;
    e.preventDefault();
    const hit = SE.preview.clipAt(e);
    if (hit) { if (!A.sel.has(hit.id)) A.select([hit.id]); clipMenu(hit.id, e.clientX, e.clientY); }
    else SlopUI.menu(frameItems(), e.clientX, e.clientY);
  });

  /* keyboard: the Menu key or Shift+F10 on the monitor or on the timeline. With a selected clip the clip
     menu opens; otherwise the monitor opens the frame menu and the timeline opens its empty-lane menu. */
  document.addEventListener('keydown', (e) => {
    if (!isMenuKey(e) || document.querySelector('.sui-menu')) return;
    const t = e.target;
    if (t.id !== 'monStage' && t.id !== 'tlCanvas') return;
    e.preventDefault();
    const r = t.getBoundingClientRect(), x = r.left + 16, y = r.top + 16, sel = firstSelected();
    if (sel) clipMenu(sel, x, y);
    else if (t.id === 'monStage') SlopUI.menu(frameItems(), x, y);
    else TL.contextMenu({ area: 'empty', t: SE.player.time, row: null }, x, y);
  });

  SE.contextFrameItems = frameItems;
})();
