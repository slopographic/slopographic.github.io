/* Slop Slides: templates you keep (save, list in New from template, preview), template files (export, import,
   validation, migration of an older version) and the Save as template dialog. Runs the real editor in iframes. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** The open alert or confirm dialog (the last one), or null. */
  const lastDialog = (w) => { const all = [...w.document.querySelectorAll('.sui-dlg')]; return all[all.length - 1] || null; };
  /** Loads a starter template into the editor (as its own deck, unlinked). */
  const loadStarter = (w, id) => { w.SS.app.load(w.SS.templates.byId(id).build(), {}); return w.SS.app.deck; };
  const count = async (w) => (await w.SS.templateStore.list()).length;
  /** A template file text with a custom deck (for broken and old files). */
  const fileText = (deck, extra) => JSON.stringify(Object.assign({ kind: 'slop-slides-template', format: 1, name: 'Hand made', created: 1, deck }, extra || {}));
  /** A deck with one shape of the given type (for validation tests). */
  const deckWith = (w, obj) => { const d = w.SS.model.newDeck({}); d.slides[0].objects.push(obj); return JSON.parse(JSON.stringify(d)); };

  describe('save as template and My templates', () => {
    it('saves the deck as a template: it is listed under My templates with a preview of its first slide', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'pitch');
      const before = await count(w);
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'Launch pitch', slideIndex: null });
      expect(await count(w)).toBe(before + 1);
      expect(rec.preview).toMatch(/^data:image\/jpeg;base64,/);
      expect(rec.slides).toBe(w.SS.templates.byId('pitch').build().slides.length);
      const b = await ST.open('../../slides/');
      const dlg = b.SS.templatesUI.openNew();
      const card = await waitFor(() => [...b.document.querySelectorAll('.tpl-mine .tpl-card')].find((c) => c.textContent.includes('Launch pitch')));
      const img = card.querySelector('img.tpl-img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toMatch(/^data:image\//);
      expect(b.document.querySelectorAll('.tpl-grid')[0].querySelectorAll('.tpl-card').length).toBe(w.SS.templates.list.length);
      dlg.close();
      ST.close(b);
      ST.close(w);
    }, { timeout: 60000 });

    it('keeps a copy of the template in the Templates folder of Slop Drive', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'lesson');
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'Drive copy', slideIndex: null });
      expect(rec.driveId).toBeTruthy();
      const folder = (await w.SlopHub.listFolders({ parentId: null })).find((f) => f.name === 'Templates');
      expect(folder).toBeTruthy();
      const file = await w.SlopHub.get(rec.driveId);
      expect(file.folderId).toBe(folder.id);
      expect(file.name).toBe('Drive copy.sslide-template');
      expect(file.type).toBe('application/x-slop-slides-template');
      expect(w.SS.templateFile.parse(await file.blob.text()).deck.slides.length).toBe(rec.slides);
      await w.SS.templateStore.remove(rec.id);
      expect(await w.SlopHub.get(rec.driveId)).toBe(undefined);
      ST.close(w);
    }, { timeout: 60000 });

    it('saves only the current slide when asked, and keeps the transition of that slide', async () => {
      const w = await ST.open('../../slides/');
      const d = loadStarter(w, 'pitch');
      w.SS.app.go(2);
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'One slide', slideIndex: 2 });
      expect(rec.slides).toBe(1);
      expect(rec.deck.slides[0].layout).toBe(d.slides[2].layout);
      expect(rec.deck.slides[0].transition).toEqual(d.slides[2].transition);
      await w.SS.templateStore.remove(rec.id);
      ST.close(w);
    }, { timeout: 60000 });

    it('the Save as template dialog keeps the name and the scope the person chose', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'album');
      w.SS.app.go(1);
      w.SS.templatesUI.openSave();
      const input = w.document.querySelector('.tpl-save input');
      input.value = 'From the dialog';
      w.document.querySelector('.tpl-save select').value = 'slide';
      w.document.querySelector('.sui-dlg .sui-primary').click();
      const rec = await waitFor(async () => (await w.SS.templateStore.list()).find((r) => r.name === 'From the dialog'));
      expect((await rec).slides).toBe(1);
      await waitFor(() => !w.document.querySelector('.tpl-save'));
      await w.SS.templateStore.remove((await rec).id);
      ST.close(w);
    }, { timeout: 60000 });
  });

  describe('template files: export and import', () => {
    it('export then import gives the same slides, transitions and animations', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'pitch');
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'Round trip', slideIndex: null });
      const text = w.SS.templatesUI.exportText(rec);
      const file = JSON.parse(text);
      expect(file.kind).toBe('slop-slides-template');
      expect(file.deck.theme.id).toBe('slop');
      const back = await w.SS.templatesUI.importText(text);
      expect(back).toBeTruthy();
      expect(back.id).not.toBe(rec.id);
      expect(JSON.stringify(back.deck.slides)).toBe(JSON.stringify(rec.deck.slides));
      const anims = back.deck.slides.flatMap((s) => s.objects.flatMap((o) => o.anims || []));
      expect(anims.length).toBeGreaterThan(2);
      expect(back.deck.slides[1].transition).toEqual({ name: 'fade', duration: 1 });
      expect(back.deck.slides[1].objects.find((o) => o.anims && o.anims.length).anims[0].preset).toBe('slide-up');
      expect(back.deck.theme).toEqual(rec.deck.theme);
      await w.SS.templateStore.remove(rec.id);
      await w.SS.templateStore.remove(back.id);
      ST.close(w);
    }, { timeout: 60000 });

    it('pictures are copied into the file as data, not linked', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'album');
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'Album file', slideIndex: null });
      const file = JSON.parse(w.SS.templatesUI.exportText(rec));
      const keys = Object.keys(file.deck.media);
      expect(keys.length).toBeGreaterThan(0);
      keys.forEach((k) => expect(file.deck.media[k].data).toMatch(/^data:image\/jpeg;base64,/));
      expect(w.SS.templatesUI.exportText(rec)).not.toContain('http');
      const used = w.SS.model.mediaUsed(file.deck);
      keys.forEach((k) => expect(used[k]).toBe(1));
      await w.SS.templateStore.remove(rec.id);
      ST.close(w);
    }, { timeout: 60000 });

    it('the File > Save as template export is a download with the .sslide-template name', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'report');
      const rec = await w.SS.templatesUI.saveTemplate({ name: 'Q3 review', slideIndex: null });
      expect(w.SS.templateFile.fileName(rec.name)).toBe('Q3 review.sslide-template');
      await w.SS.templateStore.remove(rec.id);
      ST.close(w);
    }, { timeout: 60000 });

    it('a broken template import changes nothing and shows the reason in a dialog', async () => {
      const w = await ST.open('../../slides/');
      loadStarter(w, 'pitch');
      const deck = w.SS.app.deck, title = deck.title, n = await count(w);
      const cases = [
        ['not JSON at all {', /damaged/],
        [JSON.stringify({ kind: 'something-else' }), /not a Slop Slides template file/],
        [fileText(deckWith(w, { type: 'hologram', x: 1, y: 1, w: 10, h: 10, name: 'Ghost' })), /Slide 1, object 3 \(Ghost\): unknown type "hologram"/],
        [fileText(Object.assign(deckWith(w, { type: 'shape', shape: 'rect', x: 1, y: 1, w: 10, h: 10 }), { version: 9 })), /newer Slop Slides/],
        [fileText(Object.assign(deckWith(w, { type: 'shape', shape: 'rect', x: 1, y: 1, w: 10, h: 10 }), { slides: 'nope' })), /no list of slides/],
        [fileText(Object.assign(deckWith(w, { type: 'shape', shape: 'rect', x: 1, y: 1, w: 10, h: 10 }), { media: null })), null],
        [fileText(Object.assign(deckWith(w, { type: 'image', media: 'm-missing', x: 1, y: 1, w: 10, h: 10 }), {})), /picture/],
      ];
      for (const [text, reason] of cases) {
        const got = await w.SS.templatesUI.importText(text);
        if (reason === null) { expect(got).toBeTruthy(); await w.SS.templateStore.remove(got.id); continue; }
        expect(got).toBe(null);
        const box = await waitFor(() => lastDialog(w));
        expect(box.textContent).toMatch(reason);
        expect(box.textContent).toMatch(/This template was not added|The template was not added/);
        box.querySelector('.sui-primary').click();
        await waitFor(() => !lastDialog(w));
      }
      expect(await count(w)).toBe(n);
      expect(w.SS.app.deck).toBe(deck);
      expect(w.SS.app.deck.title).toBe(title);
      ST.close(w);
    }, { timeout: 60000 });

    it('the .sslide loader and the template import use the same validator: same reason', async () => {
      const w = await ST.open('../../slides/');
      const bad = deckWith(w, { type: 'hologram', x: 1, y: 1, w: 10, h: 10, name: 'Ghost' });
      let fromSlide = null, fromTemplate = null;
      try { w.SS.native.parse(JSON.stringify(bad)); } catch (e) { fromSlide = e.message; }
      try { w.SS.templateFile.parse(fileText(bad)); } catch (e) { fromTemplate = e.message; }
      expect(fromSlide).toBe('Slide 1, object 3 (Ghost): unknown type "hologram"');
      expect(fromTemplate).toBe(fromSlide);
      ST.close(w);
    }, { timeout: 30000 });

    it('an older deck (file version 1) migrates on import: transitions and builds become engine data', async () => {
      const w = await ST.open('../../slides/');
      const v1 = { version: 1, title: 'Old deck', size: { w: 960, h: 540, preset: '16:9' }, theme: 'slop', master: { footer: '', showNumber: false }, media: {},
        slides: [{ id: 's1', layout: 'title-only', section: null, background: null, notes: '', hidden: false, transition: { type: 'push', dir: 'up', dur: 0.9 },
          objects: [{ id: 'o1', type: 'shape', shape: 'rect', name: 'Box', x: 40, y: 40, w: 200, h: 100, rot: 0, opacity: 1, fill: { type: 'solid', color: 'accent1' }, stroke: null, shadow: null, text: null }],
          builds: [{ obj: 'o1', effect: 'fly', trigger: 'click', delay: 0, dur: 0.6 }] }] };
      const got = await w.SS.templatesUI.importText(fileText(v1));
      expect(got).toBeTruthy();
      expect(got.deck.version).toBe(2);
      expect(got.deck.slides[0].transition).toEqual({ name: 'push-up', duration: 0.9 });
      expect(got.deck.slides[0].builds).toBe(undefined);
      const a = got.deck.slides[0].objects[0].anims;
      expect(a.length).toBe(1);
      expect(a[0].preset).toBe('slide-up');
      expect(a[0].trigger).toBe('click');
      await w.SS.templateStore.remove(got.id);
      ST.close(w);
    }, { timeout: 30000 });
  });
})();
