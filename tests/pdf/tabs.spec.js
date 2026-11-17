/* Slop PDF document tabs: two PDFs as two tabs, each keeping its pages, view, undo history, name and Drive link when
   switched to and back; a PDF dropped on the strip opens a new tab (a PDF already open asks first); a PDF dropped on the
   page adds its pages where the person picks, as one undo step (a PDF already in the document asks first); the tabs and
   their documents come back after a reload; the toolbar Convert button opens the converter on the open document. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  let booted = false;
  async function boot() {
    if (!booted) { await PT.boot(); booted = true; }
    await waitFor(() => PT.SP.tabs && PT.SP.tabs.api());
  }
  const doc = () => PT.win.document;
  const strip = () => doc().querySelector('#tabs .sl-doctabs-strip');
  const tabs = () => [...doc().querySelectorAll('#tabs .sl-doctab')];
  const tabNamed = (s) => tabs().find((t) => t.textContent.toLowerCase().includes(s));
  const file = (bytes, name) => new PT.win.File([bytes], name, { type: 'application/pdf' });
  /** A drop of files on an element of the app frame (the window's drop handler sees it, as with a real drag). */
  function drop(target, files) {
    const dt = new PT.win.DataTransfer();
    for (const f of files) dt.items.add(f);
    target.dispatchEvent(new PT.win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }
  const dialogs = () => [...doc().querySelectorAll('.sui-dlg')];
  const dialogTitled = (t) => dialogs().find((d) => d.querySelector('.sui-title') && d.querySelector('.sui-title').textContent === t);
  const clickIn = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === label).click();
  const texts = async () => (await PT.read(await PT.E.build())).pages.map((p) => p.text);
  const field = () => doc().getElementById('fileName');
  /** A drop on an open document shows the shared Add to current / Create new dialog first (shared/intake, SlopIntake.choose). */
  async function chooseHere(label, name) {
    const d = await waitFor(() => doc().querySelector('.sui-dlg.si-choose'), { timeout: 15000 });
    expect(d.textContent.includes(name)).toBe(true);
    const buttons = [...d.querySelectorAll('.sui-foot .sui-btn')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Create new', 'Add to current']);
    buttons.find((b) => b.textContent === label).click();
    await waitFor(() => !doc().querySelector('.sui-dlg.si-choose'));
  }

  describe('document tabs', () => {
  const wait = (label, fn, o) => waitFor(fn, o).catch(() => { const st = doc().getElementById('status'); throw new Error('timed out waiting for ' + label + ' (pages ' + (PT.E.state.pages || []).length + ', locked ' + PT.A.isLocked() + ', status ' + (st && st.textContent) + ')'); });
    it('two PDFs open as two tabs, and switching brings each one back as it was', async () => {
      await boot();
      PT.A.newTab();
      const alphaBytes = await PT.makePdf([{ text: 'Alpha 1' }, { text: 'Alpha 2' }]);
      await PT.open(alphaBytes, 'alpha.pdf');
      const n0 = tabs().length;
      // a PDF dropped on the strip opens as a new tab, and becomes the tab on screen
      drop(strip(), [file(await PT.makePdf([{ text: 'Beta 1' }]), 'beta.pdf')]);
      await waitFor(() => tabNamed('beta') && PT.E.state.pages.length === 1);
      expect(tabs().length).toBe(n0 + 1);
      expect(tabNamed('beta').getAttribute('aria-selected')).toBe('true');
      expect(await texts()).toEqual(['Beta 1']);
      // a PDF opened into an empty tab is kept in Slop Drive at once and the tab is linked to that copy (main.js)
      const betaLink = await waitFor(() => PT.A.driveId, { timeout: 15000 });
      expect((await PT.win.SlopHub.get(betaLink)).name).toBe('beta.pdf');
      // the alpha tab: a name, a Drive link and the page view on page 1 are its own; they come back when it is shown again
      tabNamed('alpha').click();
      await waitFor(() => PT.E.state.pages.length === 2);
      expect(await texts()).toEqual(['Alpha 1', 'Alpha 2']);
      PT.A.rename('Alpha renamed');
      PT.A.driveId = 'drive-alpha';
      PT.A.openPage(PT.E.state.pages[0].id);
      tabNamed('beta').click();
      await waitFor(() => PT.E.state.pages.length === 1);
      expect(PT.A.mode).toBe('grid');
      expect(PT.A.driveId).toBe(betaLink); // beta's own copy, not alpha's link
      expect(PT.E.undoLabel()).not.toBe('Rotate page');
      tabNamed('alpha').click();
      await waitFor(() => PT.E.state.pages.length === 2);
      expect(await texts()).toEqual(['Alpha 1', 'Alpha 2']);
      expect(PT.A.mode).toBe('page');
      expect(PT.SP.editor.pid).toBe(PT.E.state.pages[0].id);
      expect(field().value).toBe('Alpha renamed.pdf');
      expect(PT.A.driveId).toBe('drive-alpha');
      // an edit in alpha is its undo step, and the rotation is there when alpha is shown again
      PT.A.rotate([PT.E.state.pages[1].id], 90);
      // zoom and layout are the tab's too; the edit log of alpha's file is written when the tab is left
      PT.SP.editor.zoomMode = 'num'; PT.SP.editor.zoom = 1.5; PT.SP.editor.layout();
      PT.SP.editor.setLayout('two');
      const fp = [...PT.E.files.values()][0].fp;
      await waitFor(async () => { const r = await PT.U.idb.get('edits/' + fp); return !!r && r.entries.length >= 1; }, { timeout: 10000 });
      tabNamed('beta').click();
      await waitFor(() => PT.E.state.pages.length === 1);
      expect(PT.SP.editor.layoutMode).toBe('continuous');
      tabNamed('alpha').click();
      await waitFor(() => PT.E.state.pages.length === 2);
      expect(PT.E.state.pages[1].rot).toBe(90);
      expect(PT.E.undoLabel()).toBe('Rotate page');
      expect(PT.SP.editor.layoutMode).toBe('two');
      expect(Math.abs(PT.SP.editor.zoom - 1.5) < 1e-6).toBe(true);
      PT.A.driveId = null;
    }, { timeout: 90000 });

    it('a PDF already open in another tab asks before it opens again', async () => {
      await boot();
      PT.A.newTab();
      const bytes = await PT.makePdf([{ text: 'Twice' }]);
      await PT.open(bytes, 'twice.pdf');
      const n0 = tabs().length;
      drop(strip(), [file(bytes, 'twice.pdf')]);
      const d = await waitFor(() => dialogTitled('Already open'));
      expect(d.textContent.includes('already open in a tab')).toBe(true);
      clickIn(d, 'Cancel');
      await sleep(200);
      expect(tabs().length).toBe(n0);
      drop(strip(), [file(bytes, 'twice.pdf')]);
      clickIn(await waitFor(() => dialogTitled('Already open')), 'Open again');
      await waitFor(() => tabs().length === n0 + 1);
      await waitFor(() => PT.E.state.pages.length === 1);
    }, { timeout: 60000 });

    it('a PDF dropped on the page adds its pages where the person picks, as one undo step', async () => {
      await boot();
      // the app is shared by the tests in this file: let the last test's open finish before a new tab starts
      await wait('earlier work to finish', () => !PT.A.isLocked(), { timeout: 30000 });
      await new Promise((r) => setTimeout(r, 300));
      PT.A.newTab();
      const baseBytes = await PT.makePdf([{ text: 'Base 1' }, { text: 'Base 2' }]);
      await PT.open(baseBytes, 'base.pdf');
      const page = doc().getElementById('gridWrap');
      // at the start
      // a drop is refused while the last open or add is still finishing: wait for it to settle first
      await wait('step 1', () => !PT.A.isLocked(), { timeout: 15000 });
      drop(page, [file(await PT.makePdf([{ text: 'Extra 1' }, { text: 'Extra 2' }]), 'extra.pdf')]);
      await chooseHere('Add to current', 'extra.pdf');
      const ask = await wait('step 2', () => dialogTitled('Add pages'), { timeout: 30000 });
      ask.querySelector('select').value = 'start';
      clickIn(ask, 'Add pages');
      await wait('step 3', () => PT.E.state.pages.length === 4, { timeout: 30000 });
      expect(await texts()).toEqual(['Extra 1', 'Extra 2', 'Base 1', 'Base 2']);
      PT.A.undo();
      expect(await texts()).toEqual(['Base 1', 'Base 2']);
      // after page 1
      // a drop is refused while the last open or add is still finishing: wait for it to settle first
      await wait('step 4', () => !PT.A.isLocked(), { timeout: 15000 });
      drop(page, [file(await PT.makePdf([{ text: 'Mid 1' }]), 'mid.pdf')]);
      await chooseHere('Add to current', 'mid.pdf');
      const ask2 = await wait('step 5', () => dialogTitled('Add pages'), { timeout: 30000 });
      ask2.querySelector('select').value = 'after:1';
      clickIn(ask2, 'Add pages');
      await wait('step 6', () => PT.E.state.pages.length === 3, { timeout: 30000 });
      expect(await texts()).toEqual(['Base 1', 'Mid 1', 'Base 2']);
      PT.A.undo();
      expect(await texts()).toEqual(['Base 1', 'Base 2']);
      // a PDF already in the document asks first; cancelling adds nothing
      // a drop is refused while the last open or add is still finishing: wait for it to settle first
      await wait('step 7', () => !PT.A.isLocked(), { timeout: 15000 });
      drop(page, [file(baseBytes, 'base.pdf')]);
      await chooseHere('Add to current', 'base.pdf');
      clickIn(await wait('step 8', () => dialogTitled('Already in this document'), { timeout: 30000 }), 'Cancel');
      await sleep(200);
      expect(PT.E.state.pages.length).toBe(2);
      expect(dialogTitled('Add pages')).toBe(undefined);
    }, { timeout: 90000 });

    it('the tabs and their documents come back after a reload', async () => {
      await boot();
      PT.A.newTab();
      await PT.open(await PT.makePdf([{ text: 'Keep A' }]), 'reload-a.pdf');
      PT.A.rename('Reload kept');
      PT.A.newTab();
      await PT.open(await PT.makePdf([{ text: 'Keep B 1' }, { text: 'Keep B 2' }]), 'reload-b.pdf');
      PT.A.rotate([PT.E.state.pages[1].id], 90);
      await PT.A.tabsFlush();
      PT.A._.autosave.flush();
      await sleep(300);
      await PT.boot();
      await waitFor(() => tabNamed('reload kept') && PT.E.state.pages.length === 2, { timeout: 30000 });
      expect(PT.E.state.pages[1].rot).toBe(90);
      expect(await texts()).toEqual(['Keep B 1', 'Keep B 2']);
      tabNamed('reload kept').click();
      await waitFor(() => PT.E.state.pages.length === 1);
      expect(await texts()).toEqual(['Keep A']);
      expect(field().value).toBe('Reload kept.pdf');
    }, { timeout: 90000 });

    it('the toolbar Convert button and File > Convert open the converter on the open document', async () => {
      await boot();
      PT.A.newTab();
      await PT.open(await PT.makePdf([{ text: 'Convert me' }]), 'to-convert.pdf');
      expect(PT.A._.fileMenu().some((x) => x && x.label === 'Convert…')).toBe(true);
      PT.A.driveId = 'drive-convert';
      doc().querySelector('.rail-b[data-tool="convert"]').click(); // the rail's Convert is the one entry: it selects the tool
      expect(doc().querySelector('.rail-b[data-tool="convert"]').getAttribute('aria-selected')).toBe('true');
      PT.A._.fileMenu().find((x) => x && x.label === 'Convert…').act(); // File > Convert opens the dialog on the open document
      const dlg = await waitFor(() => doc().querySelector('.sl-cvt-dlg'), { timeout: 20000 });
      await waitFor(() => dlg.querySelector('.cv-to[data-target="pdf-to-images"]'), { timeout: 20000 }); // the file starts on PDF to images (PNG)
      const ids = dlg.querySelector('.cv-tool').convertTool.targets();
      expect(ids).toContain('pdf-to-images');
      expect(ids).not.toContain('images-to-pdf');
      dlg.querySelector('.cv-form button[type=submit]').click();
      await waitFor(() => dlg.querySelector('.cv-out-item .sl-cvt-save'), { timeout: 60000 }); // Download, and Save to Slop Drive
      expect(dlg.querySelector('.cv-out-item .cv-file-name').textContent).toBe('to-convert-edited-page-1.png');
      dlg.dispatchEvent(new PT.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await waitFor(() => !doc().querySelector('.sl-cvt-dlg'));
      PT.A.driveId = null;
    }, { timeout: 90000 });

    it('each save adds a numbered version: the original keeps them newest last, each with its change list, and versionList returns them newest first', async () => {
      await boot();
      PT.A.newTab();
      const H = PT.win.SlopHub, D = PT.SP.driveDocs, mk = (t) => new PT.win.Blob([t], { type: 'application/pdf' });
      const base = await PT.makePdf([{ text: 'Version base' }]);
      const orig = await H.put(new PT.win.Blob([base], { type: 'application/pdf' }), { name: 'versions.pdf', from: 'pdf', meta: { pdf: { role: 'original' } } });
      await PT.open(base, 'versions.pdf');
      PT.A.driveId = orig;
      const first = await D.save(orig, mk(await PT.makePdf([{ text: 'First edit' }])), 'versions.pdf');
      const second = await D.save(orig, mk(await PT.makePdf([{ text: 'Second edit' }])), 'versions.pdf');
      expect(first.version).toBe(1);
      expect(second.version).toBe(2);
      const rec = await H.get(orig);
      expect(rec.meta.pdf.versions.length).toBe(2);
      expect(rec.meta.pdf.edited).toBe(second.editedId);
      const list = await D.versionList(orig);
      expect(list.length).toBe(2);
      expect(list[0].n).toBe(2);
      expect(list[1].n).toBe(1);
      expect(list[0].edited.id).toBe(second.editedId);
      expect(list[1].edited.id).toBe(first.editedId);
      expect(!!list[0].changes && !!list[1].changes).toBe(true);
    }, { timeout: 60000 });
  });
})();
