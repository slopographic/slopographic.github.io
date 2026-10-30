/* Slop PDF: password/encrypted files, broken files, autosave/restore, Slop Hub and the offline build. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  describe('decryption', () => {
    const PW = ['s', 'l', 'o', 'p'].join('');   // the fixtures' password, inside the binary files (spelt so a build's rename leaves it)
    const cases = [['rc4-128.pdf', PW], ['aes-128.pdf', PW], ['aes-256.pdf', PW], ['owner-only.pdf', null]];
    for (const [name, pw] of cases) {
      it(`opens ${name}, removes the encryption and exports clean pages`, async () => {
        PT.reset();
        const asked = [], orig = PT.A.askPassword;
        PT.A.askPassword = (n, wrong) => { asked.push(wrong); return Promise.resolve(asked.length === 1 && pw ? 'wrong' : pw); };
        let f;
        try { f = await PT.open(await PT.fixture(name), name); } finally { PT.A.askPassword = orig; }
        expect(f.decrypted).toBe(true);
        expect(f.locked).toBe(null);
        expect(asked).toEqual(pw ? [false, true] : []);
        expect(PT.SP.decrypt.isEncrypted(f.bytes)).toBe(false);
        const bytes = await PT.E.build();
        expect(PT.SP.decrypt.isEncrypted(bytes)).toBe(false);
        const out = await PT.read(bytes);
        expect(out.pages.map((p) => p.text)).toEqual(['Secret page 1', 'Secret page 2']);
      });
    }
    it('cancelling the password adds nothing and shows no error', async () => {
      PT.reset();
      const orig = PT.A.askPassword;
      PT.A.askPassword = () => Promise.resolve(null);
      try { await PT.open(await PT.fixture('aes-128.pdf'), 'x.pdf'); } finally { PT.A.askPassword = orig; }
      expect(PT.E.state.pages.length).toBe(0);
      expect(PT.closeDialogs()).toBe('');
    });
    it('reports broken and non-PDF files clearly', async () => {
      PT.reset();
      await PT.open(PT.U.ascii('%PDF-1.4\nthis is not really a pdf'), 'broken.pdf');
      expect(PT.closeDialogs()).toMatch(/broken\.pdf.*(not a valid PDF|could not be opened)/);
      await PT.open(PT.U.ascii('hello'), 'notes.txt');
      expect(PT.closeDialogs()).toContain('not a PDF or a supported image');
      expect(PT.E.state.pages.length).toBe(0);
    });
  });

  describe('autosave / restore', () => {
    it('autosaves to IndexedDB and restores pages, rotation, annotations and file name after reload', async () => {
      PT.reset();
      PT.U.store.set('autosave', true);
      await PT.open(await PT.makePdf([{ text: 'Keep me' }, { text: 'Me too' }]), 'keep.pdf');
      const E = PT.E;
      PT.A.rotate([E.state.pages[1].id], 90);
      E.commit('Annot', (st) => st.pages[0].annots.push({ id: 'k', type: 'rect', cx: 50, cy: 50, w: 20, h: 20, rot: 0, fill: '#ff0000', color: 'none', width: 0 }));
      PT.A._.autosave.flush();
      await waitFor(async () => { const s = await PT.U.idb.get('session'); return s && s.state.pages.length === 2 && s.state.pages[0].annots.length === 1; });
      await PT.boot();
      // Slop PDF restores the autosaved session by itself on boot (ui/view-state.js); the Restore button stays hidden.
      await waitFor(() => PT.E.state.pages.length === 2, { timeout: 20000 });
      expect(PT.win.document.getElementById('restore').hidden).toBe(true);
      expect(PT.E.state.pages[1].rot).toBe(90);
      expect(PT.E.state.pages[0].annots[0].id).toBe('k');
      expect(PT.win.document.getElementById('fileName').value).toBe('keep-edited.pdf');
      const out = await PT.read(await PT.E.build());
      expect(out.pages.map((p) => p.text)).toEqual(['Keep me', 'Me too']);
      expect(out.pages[1].rotate).toBe(90);
    }, { timeout: 40000 });
    it('turning autosave off deletes the saved session', async () => {
      const m = PT.A._.fileMenu().find((x) => x && /Autosave/.test(x.label));
      m.act();
      expect(PT.U.store.get('autosave', true)).toBe(false);
      await waitFor(async () => !(await PT.U.idb.get('session')));
      m.act();
      expect(PT.U.store.get('autosave', true)).toBe(true);
    });
  });

  describe('Slop Hub', () => {
    it('registers as pdf and offers Send to items for the PDF and a page image', async () => {
      const H = PT.win.SlopHub;
      expect(H.self.app).toBe('pdf');
      const imgApps = H.appsAccepting('image/png').map((a) => a.id).filter((id) => id !== 'workflows');
      const items = PT.A.sendPageItems(PT.E.state.pages[0].id).filter((i) => !/workflow/.test(i.label));
      expect(items.length).toBe(imgApps.length);
      const file = PT.A._.fileMenu().find((x) => x && x.label === 'Send to');
      expect(!!file && file.sub.length >= 1).toBe(true);
      // one item per app that opens PDFs; Slop Workflows through its entry (Run a workflow…, Add to a workflow…)
      expect(PT.A.sendItems().filter((i) => !/workflow/.test(i.label)).length).toBe(H.appsAccepting('application/pdf').filter((a) => a.id !== 'workflows').length);
    });
    it('Send page as image puts a PNG in Slop Drive and opens the target app with ?drive=', async () => {
      const H = PT.win.SlopHub, items = PT.A.sendPageItems(PT.E.state.pages[0].id);
      if (!items.length) return;
      const st = PT.stubOpen(PT.win);
      try { await items[0].act(); } finally { st.restore(); }
      expect(st.urls.length).toBe(1);
      const id = new URL(st.urls[0]).searchParams.get('drive');
      const rec = await H.get(id);
      expect(rec.type).toBe('image/png');
      expect(rec.from).toBe('pdf');
      expect(rec.name).toMatch(/-page-1\.png$/);
      const head = new Uint8Array(await rec.blob.slice(0, 4).arrayBuffer());
      expect(PT.U.sniff(head)).toBe('png');
    });
    it('opens a PDF from Slop Drive through the picker', async () => {
      PT.reset();
      const H = PT.win.SlopHub;
      await H.put(new PT.win.Blob([await PT.makePdf([{ text: 'From drive' }])], { type: 'application/pdf' }), { name: 'drive-doc.pdf', from: 'test' });
      PT.A.openFromDrive();
      const d = PT.win.document;
      const item = await waitFor(() => [...d.querySelectorAll('.hub-item')].find((b) => b.textContent.includes('drive-doc.pdf')));
      item.click();
      await waitFor(() => PT.E.state.pages.length === 1);
      expect((await PT.read(await PT.E.build())).pages[0].text).toBe('From drive');
    });
    it('launches with ?drive=<id>, opens that file and tidies the URL', async () => {
      const H = PT.win.SlopHub;
      const id = await H.put(new PT.win.Blob([await PT.makePdf([{ text: 'Launched' }, { text: 'Two' }])], { type: 'application/pdf' }), { name: 'launch.pdf', from: 'test' });
      const win = await PT.boot('?drive=' + id, 'app2');
      await waitFor(() => win.SP.engine.state.pages.length === 2);
      expect(win.location.search).toBe('');
      expect(win.document.getElementById('fileName').value).toBe('launch-edited.pdf');
      document.getElementById('app2').src = 'about:blank';
    }, { timeout: 40000 });
  });

  describe('offline build', () => {
    let html = '';
    it('packs one self-contained HTML file with no external scripts or styles', async () => {
      const cap = PT.captureDownloads();
      try { html = await PT.A.downloadApp(); } finally { cap.restore(); }
      expect(cap.list[0].name).toBe('slop-pdf.html');
      expect(html.length).toBeGreaterThan(500000);
      expect(html).toContain('<meta name="slop-pdf-build" content="offline">');
      expect(/<script[^>]+\bsrc=/i.test(html)).toBe(false);
      expect(/<link[^>]+rel="stylesheet"/i.test(html)).toBe(false);
      const shell = html.replace(/<script type="application\/json" id="app-src">[\s\S]*?<\/script>/, '');
      expect(/(?:src|href)="[^"]*shared\/fonts\//.test(shell)).toBe(false);   // inlined scripts keep a data-src label; none loads from shared/fonts
      expect(shell).not.toContain('hub.js');
    }, { timeout: 60000 });
    it('rebuilds itself byte-for-byte from the embedded sources', async () => {
      const B = PT.SP.build, m = html.match(/<script type="application\/json" id="app-src">([\s\S]*?)<\/script>/);
      const S = JSON.parse(m[1]);
      expect(Object.keys(S)).toContain('pdf/js/core/model.js');
      expect(B.buildHTML(S) === html).toBe(true);
    });
    it('boots from a blob URL, opens a PDF and exports it', async () => {
      // The offline copy shares this origin's storage, so it would restore the session left by earlier tests.
      // Turn autosave off and clear the session for this boot; the setting is put back afterwards.
      PT.U.store.set('autosave', false);
      await PT.U.idb.del('session');
      const fr = document.getElementById('app2');
      fr.src = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      await waitFor(() => fr.contentWindow.SP && fr.contentWindow.SP.offline && fr.contentWindow.document.documentElement.classList.contains('ready'), { timeout: 30000 });
      const w = fr.contentWindow, E = w.SP.engine;
      expect(w.document.documentElement.classList.contains('is-offline')).toBe(true);
      const bytes = await PT.makePdf([{ text: 'Offline ok' }]);
      await w.SP.app.addFiles([new w.File([bytes], 'o.pdf', { type: 'application/pdf' })]);
      const out = await E.build();
      expect(await E.validate(out, 1)).toBe(1);
      expect((await PT.read(out)).pages[0].text).toBe('Offline ok');
      await sleep(10);
      fr.src = 'about:blank';
      PT.U.store.set('autosave', true);
    }, { timeout: 40000 });
  });
})();
