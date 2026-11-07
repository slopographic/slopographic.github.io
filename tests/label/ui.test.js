/* SlopLabel UI smoke tests: tools on the canvas, selection, move/resize, undo, properties, keyboard. */
(function () {
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const stage = () => W.$('stage');
  /** Dispatch a pointer event on the stage at label coordinates (mm). */
  function ptr(type, x, y, o = {}) {
    const r = stage().getBoundingClientRect();
    const e = new WIN.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + W.App.panX + x * W.App.zoom, clientY: r.top + W.App.panY + y * W.App.zoom }, o));
    stage().dispatchEvent(e);
  }
  function drag(x0, y0, x1, y1, o) { ptr('pointerdown', x0, y0, o); ptr('pointermove', (x0 + x1) / 2, (y0 + y1) / 2, o); ptr('pointermove', x1, y1, o); ptr('pointerup', x1, y1, o); }
  const key = (k, o = {}) => WIN.dispatchEvent(new WIN.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  const frame = () => new Promise((r) => WIN.requestAnimationFrame(() => WIN.requestAnimationFrame(r)));
  const blank = () => { const d = W.newDoc({ stock: W.stockById('roll-100x50'), unit: 'mm' }); d.grid.snap = false; W.setDoc(d, 'Test'); };

  describe('designer canvas', () => {
    it('creates a box by dragging with the Box tool', async () => {
      blank(); await frame();
      W.setTool('rect');
      drag(10, 10, 40, 30);
      await frame();
      const o = W.App.doc.objects[0];
      expect(o.type).toBe('rect');
      expect(o.x).toBeCloseTo(10, 0.05); expect(o.w).toBeCloseTo(30, 0.05); expect(o.h).toBeCloseTo(20, 0.05);
      expect(W.App.sel).toEqual([o.id]);
      expect(W.App.tool).toBe('select');
      // drag it so its left edge lands 0.4 mm from the label's centre line: the smart guide snaps it on
      drag(20, 20, 60.4, 20);
      expect(W.objById(o.id).x).toBeCloseTo(50, 0.001);
      W.undo(); await frame();
      expect(W.objById(o.id).x).toBeCloseTo(10, 0.05);
    });
    it('places text, barcode, QR, line and ellipse with clicks', async () => {
      const place = async (tool, x, y) => { W.setTool(tool); ptr('pointerdown', x, y); ptr('pointerup', x, y); await frame(); return W.App.doc.objects[W.App.doc.objects.length - 1]; };
      expect((await place('text', 5, 40)).type).toBe('text');
      const bc = await place('barcode', 50, 5);
      expect([bc.type, bc.symbology]).toEqual(['barcode', 'code128']);
      expect((await place('qr', 80, 25)).symbology).toBe('qrcode');
      expect((await place('line', 5, 47)).dir).toBe('h');
      expect((await place('ellipse', 60, 35)).type).toBe('ellipse');
      expect(W.App.doc.objects.length).toBe(6);
      expect(W.sceneErrors(W.App.scene)).toEqual([]);
    });
    it('selects, moves with the mouse and undoes', async () => {
      const box = W.App.doc.objects[0];
      ptr('pointerdown', 20, 20); ptr('pointerup', 20, 20); await frame();
      expect(W.App.sel).toEqual([box.id]);
      drag(20, 20, 25.5, 23);
      expect(box.x).toBeCloseTo(15.5, 0.05); expect(box.y).toBeCloseTo(13, 0.05);
      expect(W.App.hist.undoLabel).toBe('Move');
      W.undo(); await frame();
      expect(W.objById(box.id).x).toBeCloseTo(10, 0.05);
      W.redo(); await frame();
      expect(W.objById(box.id).x).toBeCloseTo(15.5, 0.05);
    });
    it('resizes with a handle', async () => {
      const box = W.App.doc.objects[0];
      W.select([box.id]); await frame();
      const b = W.boxOf(box);
      drag(b.x + b.w, b.y + b.h, b.x + b.w + 10, b.y + b.h + 5); // se handle
      expect(W.objById(box.id).w).toBeCloseTo(40, 0.05);
      expect(W.objById(box.id).h).toBeCloseTo(25, 0.05);
    });
    it('marquee-selects and deletes with the keyboard', async () => {
      W.deselect(); await frame();
      drag(-5, -5, 105, 55);
      expect(W.App.sel.length).toBe(6);
      stage().focus();
      key('Delete'); await frame();
      expect(W.App.doc.objects.length).toBe(0);
      key('z', { ctrlKey: true }); await frame();
      expect(W.App.doc.objects.length).toBe(6);
    });
    it('zooms with the wheel around the pointer and fits the label', async () => {
      const z0 = W.App.zoom;
      const r = stage().getBoundingClientRect();
      stage().dispatchEvent(new WIN.WheelEvent('wheel', { deltaY: -200, ctrlKey: true, clientX: r.left + 100, clientY: r.top + 100, bubbles: true, cancelable: true }));
      expect(W.App.zoom).toBeGreaterThan(z0);
      W.fitView(); await frame();
      expect(W.App.zoom).toBeCloseTo(z0, 0.01);
    });
  });

  describe('properties panel', () => {
    it('edits text content and font size through the panel', async () => {
      const t = W.App.doc.objects.find((o) => o.type === 'text');
      W.select([t.id]); await frame();
      const c = W.$('pContent');
      expect(c).toBeTruthy();
      c.value = 'Batch {Lot}'; c.dispatchEvent(new WIN.Event('input'));
      expect(W.objById(t.id).content).toBe('Batch {Lot}');
      const w0 = W.boxOf(W.objById(t.id)).w;
      const size = [...W.document.querySelectorAll('#dockBody .row')].find((r) => /Size \(pt\)/.test(r.textContent)).querySelector('input');
      size.value = '24'; size.dispatchEvent(new WIN.Event('input')); await frame();
      expect(W.objById(t.id).size).toBe(24);
      expect(W.boxOf(W.objById(t.id)).w).toBeGreaterThan(w0 * 1.5);
      expect(W.App.hist.undoLabel).toBe('Font size');
    });
    it('switches barcode symbology and shows validation errors', async () => {
      const b = W.App.doc.objects.find((o) => o.symbology === 'code128');
      W.select([b.id]); await frame();
      W.setProp('symbology', 'ean13', 'Barcode type', true); await frame();
      expect(W.document.querySelector('#dockBody .msg.err').textContent).toMatch(/EAN-13/);
      W.setProp('content', '590123412345', 'Edit content', true); await frame();
      expect(W.document.querySelector('#dockBody .msg.err')).toBe(null);
      expect(W.itemOf(b.id).value).toBe('590123412345');
      expect(W.itemOf(b.id).geom.data).toBe('5901234123457');
    });
    it('aligns, rotates, groups and reorders objects', async () => {
      const [a, b] = W.App.doc.objects;
      W.select([a.id]); W.alignSel('left'); expect(W.objById(a.id).x).toBe(0);
      W.alignSel('hcenter'); expect(W.objById(a.id).x + W.objById(a.id).w / 2).toBeCloseTo(50, 0.01);
      const w = W.objById(a.id).w; W.rotateSel(90); expect(W.objById(a.id).rot).toBe(90); expect(W.objById(a.id).h).toBeCloseTo(w, 0.001);
      W.select([a.id, b.id]); W.groupSel();
      expect(W.objById(a.id).group).toBeTruthy();
      W.select([a.id]); expect(W.App.sel.length).toBe(2); // clicking one grouped object selects the group
      W.ungroupSel(); expect(W.objById(a.id).group).toBe(null);
      W.select([a.id]); W.orderSel('front');
      expect(W.App.doc.objects[W.App.doc.objects.length - 1].id).toBe(a.id);
    });
    it('copies, pastes and duplicates', async () => {
      const n = W.App.doc.objects.length;
      W.select([W.App.doc.objects[0].id]); W.copySel(); W.pasteClip(); W.duplicateSel();
      expect(W.App.doc.objects.length).toBe(n + 2);
      W.undo(); W.undo(); await frame();
      expect(W.App.doc.objects.length).toBe(n);
    });
    it('shows label properties when nothing is selected and changes the size', async () => {
      W.deselect(); await frame();
      expect(W.$('dockBody').textContent).toContain('Safe margin');
      W.editDoc((d) => { d.label.w = 80; }, 'Label width'); await frame();
      expect(W.$('cbLabel').textContent).toContain('80 × 50 mm');
      W.undo();
    });
  });
})();
