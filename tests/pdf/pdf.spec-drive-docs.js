// Covers: pdf/js/io/drive-docs.js
/* Slop PDF documents in Slop Drive: an opened PDF's original is stored at once, the same bytes are linked (not copied), Save
   writes the edited copy and its change list beside the original, the change list replays onto the original, the versions
   open, revert keeps the saved copy, a Drive file uploaded by another app is adopted, and without Drive (or with autosave
   off) the work stays on this device. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const H = () => PT.win.SlopHub;
  const uid = () => 'd' + Date.now().toString(36) + (++PT._nonce);
  const sameBytes = async (rec, bytes) => {
    const got = new Uint8Array(await rec.blob.arrayBuffer());
    return got.length === bytes.length && got.every((b, i) => b === bytes[i]);
  };
  /** Opens bytes in an empty document (a fresh tab each time, the way File ▸ Open does). */
  async function openFresh(bytes, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(bytes, name);
    return PT.A.driveId;
  }
  /** The Drive records of PDFs with these bytes' hash. */
  async function countSame(bytes) {
    const h = await PT.SP.editLog.fingerprint(bytes);
    return (await H().list({ accept: 'application/pdf', trashed: 'any' })).filter((r) => r.meta && r.meta.sha256 === h).length;
  }

  describe('Slop PDF documents in Slop Drive', () => {
    it('stores the untouched original in Slop Drive at once, with its hash', async () => {
      const bytes = await PT.makePdf([{ text: 'Original ' + uid() }]);
      const id = await openFresh(bytes, 'original-' + uid() + '.pdf');
      expect(!!id).toBe(true);
      const rec = await H().get(id);
      expect(rec.meta.pdf.role).toBe('original');
      expect(await sameBytes(rec, bytes)).toBe(true);
      expect(rec.meta.sha256).toBe(await PT.SP.editLog.fingerprint(bytes));
    });

    it('links the same bytes instead of making a second copy', async () => {
      const bytes = await PT.makePdf([{ text: 'Twice ' + uid() }]);
      const first = await openFresh(bytes, 'twice.pdf');
      const before = await countSame(bytes);
      const second = await openFresh(bytes, 'twice-again.pdf');
      expect(second).toBe(first);
      expect(await countSame(bytes)).toBe(before);
    });

    it('adopts a PDF another app put in Drive with the same bytes (no copy)', async () => {
      const bytes = await PT.makePdf([{ text: 'Uploaded ' + uid() }]);
      const plain = await H().put(new PT.win.Blob([bytes], { type: 'application/pdf' }), { name: 'uploaded.pdf', from: 'drive' });
      const id = await openFresh(bytes, 'uploaded.pdf');
      expect(id).toBe(plain);
      expect(await countSame(bytes)).toBe(1);
    });

    it('Save writes the edited copy and its change list beside the original; the original stays as it was', async () => {
      const bytes = await PT.makePdf([{ text: 'Edit me ' + uid() }, { text: 'Second' }]);
      const id = await openFresh(bytes, 'edit-me.pdf');
      PT.E.commit('Rotate page', (st) => { st.pages[0].rot = 90; });
      const saved = await PT.A.saveToDrive();
      expect(!!saved).toBe(true);
      const orig = await H().get(id);
      const p = orig.meta.pdf;
      const edited = await H().get(p.edited), changes = await H().get(p.changes);
      expect(edited.meta.pdf.role).toBe('edited');
      expect(edited.meta.pdf.original).toBe(id);
      expect(changes.type).toBe('application/json');
      const list = JSON.parse(await changes.blob.text());
      expect(list.format).toBe('slop-pdf-changes');
      expect(list.original.sha256).toBe(orig.meta.sha256);
      expect(list.edited.sha256).toBe(edited.meta.sha256);
      expect(await sameBytes(await H().get(id), bytes)).toBe(true);
      expect((await PT.read(new Uint8Array(await edited.blob.arrayBuffer()))).pages[0].rotate).toBe(90);
    });

    it('the change list turns the original into the edited one (open the original with the saved changes)', async () => {
      const bytes = await PT.makePdf([{ text: 'Replay ' + uid() }]);
      await openFresh(bytes, 'replay.pdf');
      PT.E.commit('Rotate page', (st) => { st.pages[0].rot = 90; });
      await PT.A.saveToDrive();
      await PT.A.openVersion('replay');
      expect(PT.E.state.pages[0].rot).toBe(90);
    });

    it('opens the edited copy in a new tab, linked to the original, with no new Drive copy', async () => {
      const bytes = await PT.makePdf([{ text: 'Copy ' + uid() }]);
      const id = await openFresh(bytes, 'copy-check.pdf');
      PT.E.commit('Rotate page', (st) => { st.pages[0].rot = 90; });
      await PT.A.saveToDrive();
      const before = (await H().list({ trashed: 'any' })).length;
      await PT.A.openVersion('edited');
      expect(PT.A.driveId).toBe(id);
      expect(PT.E.rotation(PT.E.state.pages[0])).toBe(90); // the copy is rotated in its own file: the page turn stays 0
      expect((await H().list({ trashed: 'any' })).length).toBe(before);
    });

    it('reverts the open document to the original; the saved edited copy stays in Drive', async () => {
      const bytes = await PT.makePdf([{ text: 'Revert ' + uid() }]);
      const id = await openFresh(bytes, 'revert.pdf');
      PT.E.commit('Rotate page', (st) => { st.pages[0].rot = 90; });
      await PT.A.saveToDrive();
      const p = (await H().get(id)).meta.pdf;
      const confirm = PT.win.SlopUI.confirm;
      PT.win.SlopUI.confirm = () => Promise.resolve(true);
      try { await PT.A.revertToOriginal(); } finally { PT.win.SlopUI.confirm = confirm; }
      expect(PT.E.state.pages[0].rot).toBe(0);
      expect(PT.A.driveId).toBe(id);
      expect(!!(await H().get(p.edited))).toBe(true);
    });

    it('the Versions menu lists the copies and is off until the document is in Drive', async () => {
      PT.reset();
      const items = PT.A.versionItems();
      expect(items.filter((x) => x && x.label).every((x) => x.disabled)).toBe(true);
      const bytes = await PT.makePdf([{ text: 'Menu ' + uid() }]);
      await openFresh(bytes, 'menu.pdf');
      const live = PT.A.versionItems().filter((x) => x && x.label);
      expect(live.map((x) => x.label)).toContain('Open the original');
      expect(live.find((x) => x.label === 'Open the edited copy').disabled).toBe(false);
    });

    it('without Slop Drive the document still opens here, and the person is told so', async () => {
      const bytes = await PT.makePdf([{ text: 'Offline ' + uid() }]);
      const put = H().put;
      H().put = () => Promise.reject(new Error('Storage is unavailable'));
      try {
        PT.reset();
        await PT.open(bytes, 'offline-check.pdf');
      } finally { H().put = put; }
      expect(PT.E.state.pages.length).toBe(1);
      await waitFor(() => PT.win.document.body.textContent.includes('kept on this device only'), { timeout: 4000 });
    });

    it('with autosave off nothing is written when a PDF opens', async () => {
      const bytes = await PT.makePdf([{ text: 'Off ' + uid() }]);
      PT.U.store.set('driveAutosave', false);
      try {
        const before = await countSame(bytes);
        await openFresh(bytes, 'off.pdf');
        expect(await countSame(bytes)).toBe(before);
      } finally { PT.U.store.set('driveAutosave', true); }
    });
    it('a double click on text over a PDF that was just opened puts no Slop Drive text over the page', async () => {
      const bytes = await PT.makePdf([{ text: 'Double click ' + uid() }]);
      PT.win.document.querySelectorAll('.sui-toast').forEach((n) => n.classList.remove('sui-show')); // an earlier test's toast
      await openFresh(bytes, 'dbl-' + uid() + '.pdf'); // the background save is silent: no toast over the page
      const pid = PT.E.state.pages[0].id;
      PT.A.openPage(pid);
      await waitFor(() => PT.win.document.querySelector('.pv-textlayer span') && PT.SP.editor.pid === pid, { timeout: 8000 });
      const el = PT.SP.editor._.slots.get(pid).el, z = PT.SP.editor.zoom, r = el.getBoundingClientRect();
      const at = { clientX: r.left + 60 * z, clientY: r.top + (200 - 26) * z, button: 0, bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true };
      el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { ...at, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new PT.win.PointerEvent('pointerup', { ...at, pointerId: 7, isPrimary: true }));
      el.dispatchEvent(new PT.win.PointerEvent('pointerdown', { ...at, pointerId: 8, isPrimary: true }));
      el.dispatchEvent(new PT.win.MouseEvent('dblclick', { ...at, detail: 2 }));
      await SlopTest.sleep(300);
      const doc = PT.win.document;
      const overlays = [...doc.querySelectorAll('.pv-page, .sui-toast.sui-show, .sui-toast.sui-show *')].filter((n) => /Slop Drive/.test(n.textContent));
      expect(overlays.length).toBe(0);
    });
  });
})();
