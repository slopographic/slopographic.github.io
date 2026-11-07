/* SlopCut: context menus. Right-click and the Menu key / Shift+F10 open the menu for the monitor (clip or
   frame), a timeline clip, a title clip, a bin item and a track header, with the expected items; clicking
   an item performs the action. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const win = () => ST.win;
  const menuRows = () => [...win().document.querySelectorAll('.sui-menu .sui-row')];
  const menuText = () => menuRows().map((r) => r.querySelector('.sui-lbl').textContent);
  const clickItem = (label) => {
    const row = menuRows().find((r) => r.querySelector('.sui-lbl').textContent === label);
    if (!row) throw new Error('no menu item "' + label + '" in [' + menuText().join(' | ') + ']');
    row.click();
  };
  const rightClick = (el, x, y) => el.dispatchEvent(new (win().MouseEvent)('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  const menuKey = (el, k = 'F10', o = { shiftKey: true }) => el.dispatchEvent(new (win().KeyboardEvent)('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const closeMenus = () => win().SlopUI.closeMenu();
  const SE = () => ST.SE;

  describe('context menus', () => {
    it('right-click on a clip in the monitor opens the clip menu, and Duplicate clip adds a clip', async () => {
      await ST.reset();
      SE().change('m', (p) => ST.matte(p, 0, 0, 4, '#ff0000'));
      SE().player.seek(1);
      const ov = SE().app.els.overlay, c = centre(ov);
      rightClick(ov, c.x, c.y);
      expect(menuText()).toContain('Cut');
      expect(menuText()).toContain('Duplicate clip');
      expect(menuText()).toContain('Reset all (settings, keeps media)');
      expect(menuText()).not.toContain('Edit title text…');
      clickItem('Duplicate clip');
      expect(SE().doc.clips.length).toBe(2);
      closeMenus();
    });

    it('right-click on an empty monitor opens the frame menu, and Safe area overlay toggles the guides', async () => {
      await ST.reset();
      SE().player.seek(0);
      const ov = SE().app.els.overlay, c = centre(ov);
      rightClick(ov, c.x, c.y);
      expect(menuText()).toContain('Play');
      expect(menuText()).toContain('Snapshot frame to PNG');
      expect(menuText()).toContain('Safe area overlay');
      expect(menuText()).not.toContain('Cut');
      clickItem('Safe area overlay');
      expect(!!SE().preview.safe).toBe(true);
      SE().preview.safe = false;
      closeMenus();
    });

    it('Shift+F10 on the timeline with a selected clip opens the clip menu for it', async () => {
      await ST.reset();
      SE().change('m', (p) => ST.matte(p, 0, 0, 4, '#00ff00'));
      const id = SE().doc.clips[0].id;
      SE().app.select([id]);
      const tl = SE().app.els.tlCanvas;
      tl.focus();
      menuKey(tl);
      expect(menuText()).toContain('Split at playhead');
      expect(menuText()).toContain('Delete (lift)');
      closeMenus();
    });

    it('a title clip offers Edit title text first, which moves focus to the inspector', async () => {
      await ST.reset();
      SE().change('title', (p) => {
        const v = ST.M.videoTracks(p)[0];
        return ST.E.addGenerated(p, 'title', v.id, 0, 3, { str: 'Hello', size: 0.05, anim: 'none' });
      });
      SE().app.select([SE().doc.clips[0].id]);
      const tl = SE().app.els.tlCanvas;
      tl.focus();
      menuKey(tl);
      expect(menuText()[0]).toBe('Edit title text…');
      clickItem('Edit title text…');
      await waitFor(() => win().document.activeElement && win().document.activeElement.closest('#insp'));
      closeMenus();
    });

    it('Shift+F10 on a focused track header opens the track menu, and Add video track adds a track', async () => {
      await ST.reset();
      const before = SE().doc.tracks.filter((t) => t.kind === 'video').length;
      const head = win().document.querySelector('.th[data-id]');
      expect(!!head).toBe(true);
      head.focus();
      menuKey(head);
      expect(menuText()).toContain('Add video track');
      expect(menuText()).toContain('Rename…');
      clickItem('Add video track');
      expect(SE().doc.tracks.filter((t) => t.kind === 'video').length).toBe(before + 1);
      closeMenus();
    });

    it('Shift+F10 on a focused bin item opens its menu, and Append adds it to the timeline', async () => {
      await ST.reset();
      const cv = win().document.createElement('canvas');
      cv.width = 64; cv.height = 36; cv.getContext('2d').fillStyle = '#3366ff'; cv.getContext('2d').fillRect(0, 0, 64, 36);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      const [meta] = await SE().media.importFiles([new (win().File)([blob], 'still.png', { type: 'image/png' })]);
      SE().bin.show('media');
      await waitFor(() => win().document.querySelector('.bi[data-id="' + meta.id + '"]') && SE().media.ready(meta.id));
      const item = win().document.querySelector('.bi[data-id="' + meta.id + '"]');
      item.focus();
      menuKey(item);
      expect(menuText()).toContain('Add at playhead');
      expect(menuText()).toContain('Remove from project');
      const before = SE().doc.clips.length;
      clickItem('Append to end of timeline');
      await waitFor(() => SE().doc.clips.length > before);
      closeMenus();
    });
  });
})();
