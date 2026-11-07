/* SlopCut tests: UI smoke on desktop and phone (390×844), shortcuts through the command layer,
   menus, inspector edits, the sample project, and Slop Hub launch with ?drive=. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const closeDialogs = (win) => win.document.querySelectorAll('.sui-back').forEach((b) => b.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  const key = (win, k, o = {}) => win.document.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));

  describe('ui', () => {
    it('splits with S, deletes with Delete and undoes with Ctrl+Z', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      SE.change('m', (p) => ST.matte(p, 0, 0, 4, '#ff0000'));
      SE.player.seek(1.5);
      win.document.getElementById('tlLanes').focus();
      key(win, 's');
      expect(SE.doc.clips.length).toBe(2);
      SE.app.select([SE.doc.clips.find((c) => c.start > 1).id]);
      key(win, 'Delete');
      expect(SE.doc.clips.length).toBe(1);
      key(win, 'z', { ctrlKey: true });
      expect(SE.doc.clips.length).toBe(2);
      key(win, 'm');
      expect(SE.doc.markers.length).toBe(1);
      key(win, 'ArrowRight');
      expect(SE.player.time).toBeCloseTo(1.5 + 1 / SE.doc.fps, 1e-6);
      key(win, 'Home');
      expect(SE.player.time).toBe(0);
      key(win, 'l');
      expect(SE.player.playing).toBe(true);
      key(win, 'k');
      expect(SE.player.playing).toBe(false);
    });
    it('opens menus, the command palette and the keyboard shortcuts', async () => {
      const win = ST.win, doc = win.document;
      doc.querySelector('.menu-b').click();
      await waitFor(() => doc.querySelector('.sui-menu'));
      expect(doc.querySelector('.sui-menu').textContent).toContain('Export video');
      win.SlopUI.closeMenu();
      ST.SE.cmd.palette();
      await waitFor(() => doc.querySelector('.sui-dlg, [class*="scmd"]'));
      expect(ST.SE.cmd.usingShared()).toBe(!!win.SlopCmd);
      key(win, 'Escape'); closeDialogs(win);
      ST.SE.cmd.keymap();
      await waitFor(() => doc.body.textContent.includes('Split at playhead'));
      key(win, 'Escape'); closeDialogs(win);
      await waitFor(() => !win.SlopUI.openDialogs);
    });
    it('follows SlopCmd rebinding in shortcuts and menus', async () => {
      const win = ST.win, C = win.SlopCmd;
      if (!C) return;
      const SE = ST.SE;
      C.setKeys('edit.split', ['Shift+X']);
      await new Promise((r) => setTimeout(r, 10));
      const n = SE.doc.clips.length;
      SE.player.seek(0.5);
      key(win, 's');
      expect(SE.doc.clips.length).toBe(n);
      key(win, 'X', { shiftKey: true });
      expect(SE.doc.clips.length).toBe(n + 1);
      expect(SE.cmd.item('edit.split').key).toContain('X');
      C.resetKeys();
    });
    it('edits a clip in the inspector', async () => {
      const SE = ST.SE, doc = ST.win.document;
      SE.app.select([SE.doc.clips[0].id]);
      await waitFor(() => doc.querySelector('#insp .ins-sec'));
      const row = [...doc.querySelectorAll('#insp .ins-row')].find((r) => r.textContent.startsWith('Opacity'));
      const num = row.querySelector('input[type=number]');
      num.value = '40'; num.dispatchEvent(new ST.win.Event('change'));
      expect(SE.doc.clips[0].opacity).toBeCloseTo(0.4);
      SE.app.select([]);
      await waitFor(() => doc.querySelector('#insp').textContent.includes('Sequence'));
    });
    it('builds the sample project from generated media', async () => {
      const SE = ST.SE;
      const files = await SE.sample.makeMedia({ small: true });
      await ST.reset();
      const metas = await SE.media.importFiles(files);
      SE.change('Sample', (p) => SE.sample.assemble(p, metas));
      expect(SE.doc.clips.some((c) => c.kind === 'title')).toBe(true);
      expect(SE.doc.clips.some((c) => c.trIn && c.trIn.type === 'cross')).toBe(true);
      expect(SE.doc.clips.filter((c) => c.kind === 'audio').length).toBeGreaterThanOrEqual(2);
      expect(SE.doc.markers.length).toBe(1);
    }, { timeout: 60000 });
    it('has no horizontal overflow on desktop and phone, and phone tabs switch panels', async () => {
      const win = ST.win;
      expect(win.document.documentElement.scrollWidth).toBeLessThanOrEqual(win.innerWidth);
      const m = await ST.boot('phone');
      const d = m.document;
      expect(m.innerWidth).toBe(390);
      expect(d.documentElement.scrollWidth).toBeLessThanOrEqual(390);
      const tabs = d.querySelectorAll('.mtab');
      expect(tabs.length).toBe(4);
      for (const pane of ['media', 'effects', 'insp', 'timeline']) {
        d.querySelector('.mtab[data-pane="' + pane + '"]').click();
        const el = pane === 'timeline' ? d.getElementById('timeline') : pane === 'insp' ? d.getElementById('insp') : d.getElementById('bin');
        expect(el.getBoundingClientRect().height).toBeGreaterThan(150);
        expect(d.documentElement.scrollWidth).toBeLessThanOrEqual(390);
      }
      expect(m.getComputedStyle(d.getElementById('menus')).display).toBe('none');
      expect(d.getElementById('preview').getBoundingClientRect().width).toBeLessThanOrEqual(390);
    }, { timeout: 40000 });
    it('opens a file sent from Slop Drive (?drive=)', async () => {
      const win = ST.win;
      if (!win.SlopHub) return;
      const wav = ST.SE.synth.wav(0.5, () => [0.1, 0.1]);
      const id = await win.SlopHub.put(wav, { name: 'from-drive.wav', from: 'test' });
      await ST.boot('phone', '?drive=' + id);
      const P = document.getElementById('phone').contentWindow;
      await waitFor(() => P.SE.doc.media.some((m) => m.name === 'from-drive.wav'));
      expect(P.location.search).toBe('');
    }, { timeout: 40000 });
    it('builds a self-contained offline .html that boots', async () => {
      const html = await ST.SE.build.make();
      expect(html).toContain('window.SE = { offline: true }');
      expect(/^\s*<script[^>]*\ssrc=/m.test(html)).toBe(false);
      expect(/^\s*<link[^>]+stylesheet[^>]+href=/m.test(html)).toBe(false);
      const fr = document.getElementById('phone');
      fr.src = 'about:blank';
      await waitFor(() => fr.contentWindow.location.href === 'about:blank');
      fr.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      await waitFor(() => { const w = fr.contentWindow; return w && w.SE && w.document.body && w.document.body.classList.contains('ready'); }, { timeout: 30000 });
      const w = fr.contentWindow;
      expect(!!w.SE.offline).toBe(true);
      expect(!!w.SlopHub).toBe(false);
      expect(w.SE.cmd.list.length).toBeGreaterThan(60);
      expect(typeof w.Mp4Muxer.Muxer).toBe('function');
    }, { timeout: 40000 });
    it('reports no script errors', () => { expect(ST.errors).toEqual([]); });
  });
})();
