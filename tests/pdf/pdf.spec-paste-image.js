/* Slop PDF: a pasted picture goes on the current page, through the shared intake (Add to this page). */
// Covers: pdf/js/editor/paste-image.js, shared/intake/intake.js (a picture pasted after the drop zone attached still goes on the page)
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('pasted pictures', () => {
    it('with a PDF open, a pasted picture asks, and Add to this page puts it on the page', async () => {
      PT.reset();
      if (!PT.SP) await PT.boot();
      await PT.open(await PT.makePdf([{ text: 'page' }]), 'paste.pdf');
      const E = PT.E, win = PT.win;
      const pid = E.state.pages[0].id;
      PT.A.openPage(pid);
      await waitFor(() => PT.SP.editor.pid === pid, { timeout: 8000 });
      const c = win.document.createElement('canvas'); c.width = 40; c.height = 30;
      c.getContext('2d').fillStyle = '#e0245e'; c.getContext('2d').fillRect(0, 0, 40, 30);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const dt = new win.DataTransfer();
      dt.items.add(new win.File([blob], 'shot.png', { type: 'image/png' }));
      win.document.body.dispatchEvent(new win.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      const add = await waitFor(() => [...win.document.querySelectorAll('.sui-dlg button')].find((b) => b.textContent.startsWith('Add to')), { timeout: 5000 });
      add.click();
      await waitFor(() => (E.state.pages[0].annots || []).some((a) => a.type === 'image'), { timeout: 8000 });
      expect((E.state.pages[0].annots || []).filter((a) => a.type === 'image').length).toBe(1);
      PT.SP.editor.setTool('select');
    });
  });
})();
