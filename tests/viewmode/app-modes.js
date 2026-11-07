/* Shared view-mode checks for one app. Each tests/viewmode/<app>.test.html sets window.APP_MODES and loads this file
 * after tests/harness.js. The app runs in an iframe (same origin); the checks read its window and document. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, run, sleep } = SlopTest;
  const C = window.APP_MODES;
  const frame = document.getElementById('app');
  let W = null, D = null, V = null;

  const q = (sel) => (sel ? D.querySelector(sel) : null);
  const shown = (n) => !!n && W.getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0;
  const wsArea = () => { const b = q(C.workspace).getBoundingClientRect(); return b.width * b.height; };
  const sendKey = (target, init) => target.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, init)));
  const pressReveal = () => sendKey(D, { key: 'L', ctrlKey: true, shiftKey: true });
  const pressEscape = () => sendKey(D.body, { key: 'Escape' });
  const settle = () => sleep(150);
  const everyShown = (sels) => (sels || []).every((s) => shown(q(s)));
  const everyHidden = (sels) => (sels || []).every((s) => !shown(q(s)));

  async function load() {
    await new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; frame.src = C.url; });
    W = frame.contentWindow; D = frame.contentDocument;
    await waitFor(() => W.SlopViewMode && D.querySelector(C.workspace) && (!C.ready || C.ready(W, D)), { timeout: 30000 });
    await sleep(300);
    V = W.SlopViewMode;
    V.set('full');
    await settle();
  }

  describe('View modes: ' + C.name, () => {
    it('the app registers its view modes and shows the mode controls in its toolbar', async () => {
      await load();
      expect(V.modes).toEqual(['full', 'focus', 'content']);
      const btn = q('.slopvm-btn');
      expect(btn).toBeTruthy();
      expect(shown(btn)).toBe(true);
      const bar = q('.slopvm-bar');
      expect(W.getComputedStyle(bar).position).not.toBe('fixed');
    });

    it('content mode: the workspace is larger, and the sidebar and panels are hidden', async () => {
      V.set('full'); await settle();
      const full = wsArea();
      expect(everyShown(C.sidebar) && everyShown(C.panels)).toBe(true);
      V.set('content'); await settle();
      const content = wsArea();
      if (C.grow !== false) expect(content).toBeGreaterThan(full * 1.01);   // a fixed-size card (grow: false) has no free space to take
      expect(everyHidden(C.sidebar)).toBe(true);
      expect(everyHidden(C.panels)).toBe(true);
    });

    it('content mode: the Show panels control brings every hidden region back', async () => {
      V.set('content'); await settle();
      const reveal = q('.slopvm-reveal');
      expect(shown(reveal)).toBe(true);
      reveal.click(); await settle();
      expect(everyShown(C.sidebar) && everyShown(C.panels)).toBe(true);
      reveal.click(); await settle();
      expect(everyHidden(C.sidebar)).toBe(true);
    });

    it('Ctrl+Shift+L shows every hidden region, and again hides them', async () => {
      V.set('content'); await settle();
      pressReveal(); await settle();
      expect(everyShown(C.sidebar) && everyShown(C.panels)).toBe(true);
      pressReveal(); await settle();
      expect(everyHidden(C.sidebar)).toBe(true);
    });

    it('Escape returns to Full, and the workspace is its full width again', async () => {
      V.set('full'); await settle();
      const full = wsArea();
      V.set('content'); await settle();
      pressEscape(); await settle();
      expect(V.mode()).toBe('full');
      expect(everyShown(C.sidebar) && everyShown(C.panels)).toBe(true);
      expect(Math.abs(wsArea() - full)).toBeLessThan(full * 0.01);
    });

    it('the View button opens a menu of the three modes, the current one checked; a row picks its mode', async () => {
      V.set('full'); await settle();
      const btn = q('.slopvm-btn');
      for (const [label, m] of [['Focus', 'focus'], ['Content', 'content'], ['Full', 'full']]) {
        btn.click();
        const menu = await waitFor(() => q('.slopvm-menu'));
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        const rows = [...menu.querySelectorAll('[role="menuitemradio"]')];
        expect(rows.length).toBe(3);
        expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true').length).toBe(1);
        rows.find((r) => r.querySelector('.sui-lbl').textContent.startsWith(label + ':')).click();
        expect(V.mode()).toBe(m);
        await waitFor(() => btn.getAttribute('aria-expanded') === 'false');
        expect(btn.querySelector('.slopvm-txt').textContent).toBe(label);
      }
    });
  });

  run({ name: 'View modes: ' + C.name });
})();
