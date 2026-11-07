/* Slop Slides: boot, slides, text boxes, moving, undo, and the 390 x 844 layout. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('boot', () => {
    it('loads the editor with a blank title slide, a canvas and the toolbar', async () => {
      const w = await ST.open('../../slides/');
      window.__W1 = w;
      expect(w.SS.fonts.isReady()).toBe(true);
      expect(w.SS.app.deck.slides.length).toBe(1);
      expect(w.SS.app.doc.driveId).toBe(null);
      expect(w.document.querySelectorAll('.thumb').length).toBe(1);
      expect(w.document.getElementById('canvas').width).toBeGreaterThan(100);
      expect(w.document.getElementById('btnSave')).toBeTruthy();
      expect(w.SlopHub.self.app).toBe('slides');
    }, { timeout: 30000 });
    it('registers the app as a Slop Drive peer and loads the manifest scripts', async () => {
      const w = window.__W1;
      const m = w.SS_MANIFEST;
      expect(m.ui.length).toBeGreaterThan(10);
      m.ui.forEach((p) => expect(w.document.querySelector(`script[src="../${p}"]`)).toBeTruthy());
    });
  });

  describe('slides', () => {
    it('adds, duplicates and deletes slides from the list, and keeps the selection in step', async () => {
      const w = window.__W1;
      w.document.getElementById('slNew').click();
      expect(w.SS.app.deck.slides.length).toBe(2);
      expect(w.SS.app.idx).toBe(1);
      expect(w.document.querySelectorAll('.thumb').length).toBe(2);
      w.document.getElementById('slDup').click();
      expect(w.SS.app.deck.slides.length).toBe(3);
      expect(w.SS.app.idx).toBe(2);
      w.document.getElementById('slDel').click();
      expect(w.SS.app.deck.slides.length).toBe(2);
      w.document.querySelectorAll('.thumb')[0].click();
      expect(w.SS.app.idx).toBe(0);
    });
    it('moves a slide up and down', async () => {
      const w = window.__W1;
      const ids = () => w.SS.app.deck.slides.map((s) => s.id);
      const before = ids();
      w.document.querySelectorAll('.thumb')[0].click();
      w.document.getElementById('slDown').click();
      expect(ids()[1]).toBe(before[0]);
      expect(w.SS.app.idx).toBe(1);
      w.document.getElementById('slUp').click();
      expect(ids()[0]).toBe(before[0]);
    });
    it('changes the layout of the current slide from the toolbar', async () => {
      const w = window.__W1;
      w.document.getElementById('selLayout').value = 'quote';
      w.document.getElementById('selLayout').dispatchEvent(new w.Event('change'));
      expect(w.SS.app.slide().layout).toBe('quote');
    });
  });

  describe('new from template', () => {
    it('File > New from template opens the template in a new tab, unlinked from Drive', async () => {
      // The editor above keeps its tabs on this device. A new editor restores them, and the template opens in a new tab.
      const w = await ST.open('../../slides/');
      const t = w.SS.templates.byId('pitch');
      expect(t).toBeTruthy();
      w.SS.files.fromTemplate('pitch');
      expect(w.SS.app.deck.slides.length).toBe(t.build().slides.length);
      expect(w.SS.app.deck.title).toBe('Pitch deck');
      expect(w.SS.app.doc.driveId).toBe(null);
      ST.close(w);
    }, { timeout: 30000 });
  });

  describe('text boxes', () => {
    it('inserts a text box, types into it and commits with Ctrl+Enter', async () => {
      const w = window.__W1;
      w.document.getElementById('insText').click();
      const ta = w.document.getElementById('editor');
      expect(ta.hidden).toBe(false);
      ta.value = 'Hello slides';
      ta.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(ta.hidden).toBe(true);
      const o = w.SS.app.slide().objects.find((x) => x.type === 'text' && w.SS.objects.plain(x.text) === 'Hello slides');
      expect(o).toBeTruthy();
    });
    it('moves a text box by dragging it, and undo puts it back', async () => {
      const w = window.__W1;
      const now = () => w.SS.app.selObjs()[0];   // undo swaps in a new deck object, so read the object again
      const o = now();
      const x0 = o.x, y0 = o.y, c = ST.centre(o);
      ST.ptr(w, 'pointerdown', c.x, c.y);
      ST.ptr(w, 'pointermove', c.x + 60, c.y + 30);
      ST.ptr(w, 'pointermove', c.x + 120, c.y + 40);
      ST.ptr(w, 'pointerup', c.x + 120, c.y + 40);
      expect(now().x).toBeGreaterThan(x0 + 60);
      expect(now().y).toBeGreaterThan(y0 + 20);
      ST.ctrl(w, 'z');
      expect(Math.round(now().x)).toBe(Math.round(x0));
      expect(Math.round(now().y)).toBe(Math.round(y0));
      ST.ctrl(w, 'z', { shiftKey: true });
      expect(now().x).toBeGreaterThan(x0 + 60);
    });
    it('a press without a move adds no undo step; a double-click opens the text', async () => {
      const w = window.__W1;
      const o = w.SS.app.selObjs()[0];
      const depth = w.SS.app.hist.canUndo();
      const c = ST.centre(o);
      await SlopTest.sleep(500);
      ST.click(w, c.x, c.y);
      expect(w.SS.textEdit.editing).toBe(null);
      ST.click(w, c.x, c.y);
      expect(w.SS.textEdit.editing).toBe(o.id);
      expect(w.document.getElementById('editor').hidden).toBe(false);
      w.document.getElementById('editor').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(w.SS.textEdit.editing).toBe(null);
      expect(w.SS.app.hist.canUndo()).toBe(depth);
    });
    it('adds a rectangle and an ellipse centred on the slide', async () => {
      const w = window.__W1;
      w.document.getElementById('insRect').click();
      w.document.getElementById('insEllipse').click();
      const shapes = w.SS.app.slide().objects.filter((x) => x.type === 'shape');
      expect(shapes.map((s) => s.shape)).toEqual(['rect', 'ellipse']);
      expect(Math.round(shapes[0].x + shapes[0].w / 2)).toBe(Math.round(w.SS.app.deck.size.w / 2));
    });
    it('inserts a picture from a file, scaled to fit the slide', async () => {
      const w = window.__W1;
      const png = await ST.png(w, '#ff4f6e', 400);
      const file = new w.File([png], 'Red square.png', { type: 'image/png' });
      const saved = w.SlopUI.pickFiles;
      w.SlopUI.pickFiles = async () => [file];
      try { await w.SS.ops.addImage(); } finally { w.SlopUI.pickFiles = saved; }
      const img = w.SS.app.selObjs()[0];
      expect(img.type).toBe('image');
      expect(w.SS.app.deck.media[img.media].mime).toBe('image/png');
      expect(img.w).toBeLessThanOrEqual(w.SS.app.deck.size.w * 0.6 + 0.01);
      expect(img.h).toBeLessThanOrEqual(w.SS.app.deck.size.h * 0.6 + 0.01);
    });
    it('the inspector edits the selection: X by typing, font size and bold by controls', async () => {
      const w = window.__W1;
      const txt = w.SS.app.slide().objects.find((o) => o.type === 'text' && w.SS.objects.plain(o.text) === 'Hello slides');
      w.SS.app.select([txt.id]);
      const field = (label) => [...w.document.querySelectorAll('#inspector .row')].find((r) => r.querySelector('span').textContent === label).querySelector('input, select');
      const x = field('X');
      x.value = '123';
      x.dispatchEvent(new w.Event('change'));
      expect(Math.round(txt.x)).toBe(123);
      const size = field('Size');
      size.value = '44';
      size.dispatchEvent(new w.Event('change'));
      expect(w.SS.app.selObjs()[0].style.size).toBe(44);
      const bold = field('Bold');
      bold.click();
      expect(w.SS.app.selObjs()[0].style.bold).toBe(true);
      w.SS.app.select([]);
    });
    it('keeps the editor usable at 390 x 844 (no horizontal page scroll, a real canvas)', async () => {
      const m = await ST.open('../../slides/', { width: 390, height: 844 });
      const doc = m.document;
      expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(390);
      const stage = doc.getElementById('stage').getBoundingClientRect();
      expect(stage.width).toBeGreaterThan(300);
      expect(stage.height).toBeGreaterThan(150);
      const cv = doc.getElementById('canvas').getBoundingClientRect();
      expect(cv.right).toBeLessThanOrEqual(391);
      ST.click(m, -30, -30);
      expect(m.SS.app.sel.length).toBe(0);
      ST.close(m);
    }, { timeout: 30000 });
  });
})();
