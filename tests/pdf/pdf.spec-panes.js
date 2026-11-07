/* Slop PDF: split view (ui/panes.js). Two documents side by side: the focused one is the live editor, the other a read-only
   preview with its own zoom; a click focuses a pane and moves the tools to its document; closing a document empties the pane
   that showed it; one pane again puts the page view back. Every test restores one pane, even when it fails. */
// Covers: pdf/js/ui/panes.js, pdf/js/ui/panes-ui.js
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** Two documents, the first on screen, in a fresh state. Returns both document records. */
  async function twoDocs() {
    PT.reset();
    if (!PT.SP) await PT.boot();
    await PT.open(await PT.makePdf([{ text: 'alpha one' }, { text: 'alpha two' }]), 'a.pdf');
    const docA = PT.SP.tabs.current();
    PT.A.newTab();
    await PT.open(await PT.makePdf([{ text: 'beta one' }]), 'b.pdf');
    const docB = PT.SP.tabs.current();
    PT.SP.tabs.api().activate(docA);
    const pid = PT.E.state.pages[0].id;
    PT.A.openPage(pid);
    await waitFor(() => PT.SP.editor.pid === pid, { timeout: 8000 });
    return { docA, docB };
  }
  /** A focus can open a stored document that is still loading, and the app is busy until it is in: wait for that, so the
     next test does not meet a busy app (a drop is refused while it is). */
  const settle = () => waitFor(() => !PT.A.isLocked(), { timeout: 15000 });
  /** Closes every document the strip holds, so the next test starts with what it expects (a reset empties the page only). */
  async function closeTabs() {
    await settle();
    const a = PT.SP.tabs.api();
    for (const t of a.tabs()) await a.close(t.doc);
    PT.reset();
    await settle();
  }
  /** Runs fn with two panes in columns, then puts one pane back and closes the documents, whatever happens. */
  async function inSplit(fn) {
    const docs = await twoDocs();
    PT.SP.panes.setLayout('columns2');
    try { await fn(docs); } finally { PT.SP.panes.unsplit(); await closeTabs(); }
  }
  // A press and its release, as a finger or a mouse makes them.
  const click = (win, el) => {
    el.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
    win.dispatchEvent(new win.PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));
  };

  describe('split view', () => {
    it('two columns: the focused document is live, the other is a read-only preview of its own', () => inSplit(async ({ docA, docB }) => {
      const win = PT.win, P = PT.SP.panes;
      expect(P.count()).toBe(2);
      expect(P.layout()).toBe('columns2');
      expect(P.shownDocs()[0] === docA && P.shownDocs()[1] === docB).toBe(true);
      expect(win.document.getElementById('viewer').parentNode.dataset.pane).toBe('0');
      const preview = P.preview(1);
      expect(!!preview).toBe(true);
      expect(preview.el.parentNode.dataset.pane).toBe('1');
      await waitFor(() => win.document.querySelector('.sw-pane[data-pane="1"] .pv-pv-canvas[data-drawn="1"]'), { timeout: 8000 });
      expect(win.document.querySelectorAll('.sw-pane[data-pane="1"] .pv-pv-page').length).toBe(1);
    }));

    it('a click on a pane focuses it: the tools and the strip move to its document', () => inSplit(async ({ docA, docB }) => {
      const win = PT.win, P = PT.SP.panes;
      click(win, win.document.querySelector('.sw-pane[data-pane="1"]'));
      expect(P.focused()).toBe(1);
      expect(PT.SP.tabs.current() === docB).toBe(true);
      expect(PT.E.state.pages.length).toBe(1);             // the live state is B's: one page
      expect(win.document.getElementById('viewer').parentNode.dataset.pane).toBe('1');
      expect(P.preview(0).doc() === docA).toBe(true);     // A is now the preview
    }));

    it('a preview shows the annotations of its page, and its text can be selected', () => inSplit(async ({ docB }) => {
      const win = PT.win, P = PT.SP.panes;
      // B's page gets a rectangle, added to the document as the editor would add it
      docB.state.pages[0].annots.push({ id: 'preview-rect', type: 'rect', cx: 80, cy: 45, w: 120, h: 50, rot: 0, color: '#ff0000', width: 2, fill: 'none', opacity: 1 });
      P.split(2, 'columns');
      await waitFor(() => win.document.querySelector('.sw-pane[data-pane="1"] .annots > *'), { timeout: 8000 });
      expect(win.document.querySelectorAll('.sw-pane[data-pane="1"] .annots > *').length >= 1).toBe(true);
      await waitFor(() => win.document.querySelector('.sw-pane[data-pane="1"] .pv-textlayer span'), { timeout: 8000 });
      expect(win.document.querySelector('.sw-pane[data-pane="1"] .pv-textlayer span').textContent.includes('beta')).toBe(true);
      docB.state.pages[0].annots = docB.state.pages[0].annots.filter((a) => a.id !== 'preview-rect');
    }));

    it('a saved split comes back: its layout, its focused pane and the documents in each pane', () => inSplit(async ({ docA, docB }) => {
      const win = PT.win, P = PT.SP.panes;
      click(win, win.document.querySelector('.sw-pane[data-pane="1"]'));
      const snap = P.snapshot();
      expect(snap.layout).toBe('columns2');
      expect(snap.focused).toBe(1);
      expect(snap.docs[0] === docA.id && snap.docs[1] === docB.id).toBe(true);
      P.unsplit();
      expect(P.count()).toBe(1);
      P.restore(snap);
      expect(P.count()).toBe(2);
      expect(P.layout()).toBe('columns2');
      expect(P.focused()).toBe(1);
      expect(P.shownDocs()[0] === docA && P.shownDocs()[1] === docB).toBe(true);
    }));

    it('Ctrl+Alt+arrows move between the panes, and skip an empty one', () => inSplit(async ({ docB }) => {
      const win = PT.win, P = PT.SP.panes;
      win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true, bubbles: true }));
      expect(P.focused()).toBe(1);
      expect(PT.SP.tabs.current() === docB).toBe(true);
      win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true, altKey: true, bubbles: true }));
      expect(P.focused()).toBe(0);
    }));

    it('each pane zooms on its own: a preview zoom does not change the live editor', () => inSplit(async () => {
      const win = PT.win, P = PT.SP.panes;
      const live = PT.SP.editor.zoom;
      const before = P.preview(1).zoom();
      win.document.querySelector('.sw-pane[data-pane="1"] .pv-pv-btn[aria-label="Zoom in"]').click();
      expect(P.preview(1).zoom() > before).toBe(true);
      expect(PT.SP.editor.zoom).toBe(live);
    }));

    it('closing a document shown in a preview pane empties that pane', () => inSplit(async ({ docB }) => {
      const P = PT.SP.panes;
      await PT.SP.tabs.api().close(docB);
      expect(P.shownDocs()[1] === null).toBe(true);
      expect(P.preview(1).doc() === null).toBe(true);
    }));

    it('one pane again: the page view goes back to the stage, and the previews go', async () => {
      await twoDocs();
      const win = PT.win, P = PT.SP.panes;
      P.setLayout('grid4');
      expect(P.count()).toBe(4);
      P.setLayout('one');
      expect(P.count()).toBe(1);
      expect(win.document.getElementById('viewer').parentNode.id).toBe('stage');
      expect(win.document.getElementById('panes').hidden).toBe(true);
    });

    it('the header Split view button lists the layouts: Two columns splits the view', async () => {
      await twoDocs();
      const win = PT.win;
      try {
        win.document.getElementById('btnSplit').click();
        const row = [...win.document.querySelectorAll('.sui-menu .sui-row')].find((r) => r.querySelector('.sui-lbl')?.textContent === 'Two columns');
        expect(!!row).toBe(true);
        row.click();
        expect(PT.SP.panes.layout()).toBe('columns2');
        expect(PT.SP.panes.count()).toBe(2);
      } finally { PT.SP.panes.unsplit(); await closeTabs(); }
    });

    it('a file opened into a preview pane is live there; the document that was live is previewed in the other pane', () => inSplit(async ({ docA }) => {
      const P = PT.SP.panes;
      const bytes = await PT.makePdf([{ text: 'gamma' }]);
      await PT.A.openFilesInPane(1, [new PT.win.File([bytes], 'c.pdf', { type: 'application/pdf' })]);
      await settle();
      const fresh = PT.SP.tabs.current();
      expect(fresh !== docA).toBe(true);
      expect(P.focused()).toBe(1);
      expect(P.shownDocs()[1] === fresh).toBe(true);
      expect(P.shownDocs()[0] === docA).toBe(true);
      expect(P.preview(0).doc() === docA).toBe(true);
    }));

    it('an empty pane offers Open a file and Show an open document', () => inSplit(async ({ docB }) => {
      const P = PT.SP.panes;
      await PT.SP.tabs.api().close(docB);
      const empty = PT.win.document.querySelector('.sw-pane[data-pane="1"] .pv-pv-empty');
      expect(!!empty).toBe(true);
      const labels = [...empty.querySelectorAll('button')].map((b) => b.textContent);
      expect(labels).toEqual(['Open a file', 'Show an open document']);
      expect(P.shownDocs()[1] === null).toBe(true);
    }));

    it('each pane has its own tab strip, and the strip above the stage is away; a tab picked in a strip shows there', () => inSplit(async ({ docB }) => {
      const win = PT.win, P = PT.SP.panes;
      expect(win.document.getElementById('tabs').hidden).toBe(true);
      const bars = [...win.document.querySelectorAll('.sw-pane .spt-tabs')];
      expect(bars.length).toBe(2);
      expect(bars[0].querySelectorAll('.spt-tab').length).toBe(2);
      expect(bars[1].querySelector('.spt-tab.on .spt-name').title.length > 0).toBe(true);
      // pane 0 shows docA live; picking docB from its strip (docB is pane 1's preview) moves the focus to pane 1
      names(bars[0])[1].click();
      expect(P.focused()).toBe(1);
      expect(P.shownDocs()[1] === docB).toBe(true);
      // and the strip of pane 0 now marks docB as the one pane 1 shows; picking docA from pane 1 focuses pane 0
      names(bars[1])[0].click();
      expect(P.focused()).toBe(0);
    }));
  });

  function names(bar) { return [...bar.querySelectorAll('.spt-name')]; }

  describe('split view: each pane keeps its place', () => {
    it('the live pane and a preview pane keep their scroll and zoom when the focus goes back and forth', () => inSplit(async () => {
      const win = PT.win, P = PT.SP.panes, v = win.document.getElementById('viewer');
      const pv = P.preview(1), pb = pv.el.querySelector('.pv-pv-body');
      try {
        PT.SP.editor.zoomMode = 'num'; PT.SP.editor.zoom = 2; PT.SP.editor.layout();   // large enough to scroll
        pv.setZoom(4);
        await waitFor(() => v.scrollHeight > v.clientHeight + 100 && pb.scrollHeight > pb.clientHeight + 100, { timeout: 8000 }).catch(() => { throw new Error('dims ' + JSON.stringify([v.scrollHeight, v.clientHeight, pb.scrollHeight, pb.clientHeight, P.focused()])); });
        v.scrollTop = 200;
        pb.scrollTop = 150;
        const zoom = pv.zoom();
        click(win, win.document.querySelector('.sw-pane[data-pane="1"]'));
        await settle();
        expect(P.focused()).toBe(1);
        click(win, win.document.querySelector('.sw-pane[data-pane="0"]'));
        await settle();
        expect(P.focused()).toBe(0);
        expect(Math.abs(v.scrollTop - 200) < 5).toBe(true);
        const again = P.preview(1);
        expect(again.zoom()).toBe(zoom);
        expect(Math.abs(again.el.querySelector('.pv-pv-body').scrollTop - 150) < 5).toBe(true);
      } finally {
        PT.SP.editor.zoomMode = 'fit'; PT.SP.editor.layout();
      }
    }));
  });

  describe('split view: drop and new document in a pane', () => {
    it('a file dropped on a preview pane opens there, live (a real drop event on the pane)', () => inSplit(async ({ docA }) => {
      const win = PT.win, P = PT.SP.panes;
      const bytes = await PT.makePdf([{ text: 'dropped' }]);
      const dt = new win.DataTransfer();
      dt.items.add(new win.File([bytes], 'c.pdf', { type: 'application/pdf' }));
      win.document.querySelector('.sw-pane[data-pane="1"] .pv-pv-body').dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await waitFor(() => P.focused() === 1 && !PT.A.isLocked(), { timeout: 15000 });
      const fresh = PT.SP.tabs.current();
      expect(fresh !== docA).toBe(true);
      expect(P.shownDocs()[1] === fresh).toBe(true);
      expect(P.shownDocs()[0] === docA).toBe(true);
    }));

    it('the + in a pane makes a new document there; the other pane shows the document that was live', () => inSplit(async ({ docA, docB }) => {
      const win = PT.win, P = PT.SP.panes;
      const before = PT.SP.tabs.api().tabs().length;
      win.document.querySelector('.sw-pane[data-pane="1"] .spt-add').click();
      await settle();
      expect(PT.SP.tabs.api().tabs().length).toBe(before + 1);
      expect(P.focused()).toBe(1);
      const fresh = PT.SP.tabs.current();
      expect(fresh !== docA && fresh !== docB).toBe(true);
      expect(P.shownDocs()[1] === fresh).toBe(true);
      expect(P.shownDocs()[0] === docA).toBe(true);
    }));
  });
})();
