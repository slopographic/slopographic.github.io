/* Slop Slides: Slop Drive storage. Save with Ctrl+S to the same Drive id, reopen with ?drive=, the zero-byte file
   from Drive's New menu, pictures, foreign files, damaged files, the autosaved draft, and the PowerPoint export. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const MIME = 'application/x-slop-slides';
  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  describe('Slop Drive', () => {
    it('Ctrl+S saves to the same Drive file, and ?drive= reopens it with its content', async () => {
      const w = await ST.open('../../slides/');
      const id = await w.SlopHub.put(new w.Blob([], { type: MIME }), { name: 'Pitch.sslide' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      expect(a.SS.app.doc.driveId).toBe(id);
      expect(a.SS.app.doc.name).toBe('Pitch.sslide');
      expect(a.location.search).toContain('drive=' + id);
      a.SS.ops.addText();
      a.SS.textEdit.commit();
      const txt = a.SS.app.selObjs()[0];
      a.SS.app.change('Set title', () => { a.SS.textParse.apply(txt, 'Saved from Ctrl+S'); });
      expect(a.SS.app.dirty).toBe(true);
      ST.ctrl(a, 's');
      await waitFor(async () => { const r = await a.SlopHub.get(id); return r && r.size > 0; }, { timeout: 8000 });
      const rec = await a.SlopHub.get(id);
      expect(rec.name).toBe('Pitch.sslide');
      expect(rec.type).toBe(MIME);
      expect(a.SS.app.dirty).toBe(false);
      expect(a.document.getElementById('saveState').textContent).toBe('Saved to Slop Drive');
      const saved = JSON.parse(await rec.blob.text());
      expect(saved.slides[0].objects.some((o) => a.SS.objects.plain(o.text || {}) === 'Saved from Ctrl+S')).toBe(true);
      ST.close(a);
      const b = await ST.open('../../slides/?drive=' + id);
      const texts = b.SS.app.slide().objects.map((o) => (o.text ? b.SS.objects.plain(o.text) : ''));
      expect(texts).toContain('Saved from Ctrl+S');
      expect(b.SS.app.doc.driveId).toBe(id);
      ST.close(b);
    }, { timeout: 60000 });

    it('keeps the file in its folder and keeps it starred when saving again', async () => {
      const w = await ST.open('../../slides/');
      const folder = await w.SlopHub.createFolder('Decks');
      const id = await w.SlopHub.put(new w.Blob([], { type: MIME }), { name: 'Starred.sslide', folderId: folder });
      await w.SlopHub.update(id, { starred: true }, { touch: false });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      a.SS.app.change('Rename', () => { a.SS.app.deck.title = 'Renamed'; });
      await a.SS.files.save(false);
      const rec = await a.SlopHub.get(id);
      expect(rec.folderId).toBe(folder);
      expect(rec.starred).toBe(true);
      ST.close(a);
    }, { timeout: 30000 });

    it('a zero-byte .sslide (Drive New menu) opens as a blank deck linked to that file', async () => {
      const w = await ST.open('../../slides/');
      const id = await w.SlopHub.put(new w.Blob([], { type: MIME }), { name: 'Untitled Presentation.sslide' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      expect(a.SS.app.deck.slides.length).toBe(1);
      expect(a.SS.app.doc.driveId).toBe(id);
      expect(a.SS.app.dirty).toBe(false);
      ST.close(a);
    }, { timeout: 30000 });

    it('a picture opens as a one-slide deck that is not linked, so Save cannot overwrite it', async () => {
      const w = await ST.open('../../slides/');
      const png = await ST.png(w);
      const id = await w.SlopHub.put(png, { name: 'Logo.png' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      const img = a.SS.app.slide().objects.find((o) => o.type === 'image');
      expect(img).toBeTruthy();
      expect(a.SS.app.deck.media[img.media].mime).toBe('image/png');
      expect(a.SS.app.doc.driveId).toBe(null);
      expect(a.SS.app.dirty).toBe(false);
      ST.close(a);
    }, { timeout: 30000 });

    it('a picture opens under its own file name (brackets and parentheses intact), not "Picture"', async () => {
      const w = await ST.open('../../slides/');
      const png = await ST.png(w);
      const id = await w.SlopHub.put(png, { name: 'card (1) [x].png' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      expect(a.SS.app.deck.title).toBe('card (1) [x]');
      expect(a.SS.app.doc.name).toBe('card (1) [x].sslide');
      ST.close(a);
    }, { timeout: 30000 });

    it('a file that only claims to be PowerPoint is not overwritten: nothing opens over it', async () => {
      const w = await ST.open('../../slides/');
      const id = await w.SlopHub.put(new w.Blob(['PK-not-really'], { type: PPTX }), { name: 'Deck.pptx' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      expect(a.SS.app.doc.driveId).toBe(null);
      const rec = await a.SlopHub.get(id);
      expect(await rec.blob.text()).toBe('PK-not-really');
      ST.close(a);
    }, { timeout: 30000 });

    it('a damaged .sslide is reported and never replaced', async () => {
      const w = await ST.open('../../slides/');
      const id = await w.SlopHub.put(new w.Blob(['{ not json'], { type: MIME }), { name: 'Broken.sslide' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      expect(a.SS.app.doc.driveId).toBe(null);
      expect(await (await a.SlopHub.get(id)).blob.text()).toBe('{ not json');
      ST.close(a);
    }, { timeout: 30000 });

    it('an unsaved edit is kept in its tab and restored on the next visit', async () => {
      const w = await ST.open('../../slides/');
      w.SS.ops.addShape('ellipse');
      await w.SS.tabs.flush();
      ST.close(w);
      const b = await ST.open('../../slides/');
      expect(b.SS.app.slide().objects.some((o) => o.shape === 'ellipse')).toBe(true);
      expect(b.SS.app.dirty).toBe(true);
      ST.close(b);
    }, { timeout: 30000 });

    it('a saved file is not left unsaved in its tab', async () => {
      const w = await ST.open('../../slides/');
      const id = await w.SlopHub.put(new w.Blob([], { type: MIME }), { name: 'Clean.sslide' });
      ST.close(w);
      const a = await ST.open('../../slides/?drive=' + id);
      a.SS.ops.addShape('rect');
      await a.SS.files.save(false);
      await a.SS.tabs.flush();
      expect(a.SS.tabs.api().tabs().find((t) => t.active).dirty).toBe(false);
      expect(a.SS.app.dirty).toBe(false);
      ST.close(a);
    }, { timeout: 30000 });

    it('exports a PowerPoint package whose slide XML is well formed and holds the text', async () => {
      const w = await ST.open('../../slides/');
      w.SS.ops.addText();
      w.SS.textEdit.commit();
      const sel = w.SS.app.selObjs()[0];
      w.SS.app.change('Set text', () => { w.SS.textParse.apply(sel, 'Export me'); });
      w.SS.app.change('Add shape', () => { w.SS.app.slide().objects.push(w.SS.objects.make('shape', { x: 40, y: 40, w: 100, h: 60 })); });
      const r = await w.SS.pptx.write(w.SS.app.deck);
      expect(r.blob.type).toBe(PPTX);
      const Z = await import('../../shared/office/zip.js');
      const files = await Z.readZip(r.blob);
      const names = [...files.keys()];
      ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/slides/slide1.xml', 'ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml'].forEach((p) => expect(names).toContain(p));
      const slide = Z.readText(files, 'ppt/slides/slide1.xml');
      expect(ST.wellFormed(slide)).toBe(true);
      expect(slide).toContain('Export me');
      expect(ST.wellFormed(Z.readText(files, 'ppt/presentation.xml'))).toBe(true);
      expect(ST.wellFormed(Z.readText(files, 'ppt/theme/theme1.xml'))).toBe(true);
      expect(Z.readText(files, 'ppt/presentation.xml')).toContain('cx="' + 960 * 12700 + '"');
      ST.close(w);
    }, { timeout: 30000 });
  });
})();
