/* Slop PDF: a drop on the open document asks Add to current or Create new (shared/intake, SlopIntake.choose, the same dialog as
   PhotoSlop); a file that is not a PDF or an image (SVG, XLSX, DOCX, HTML, CSV…) opens in the Convert dialog, and the PDF
   the dialog makes (SVG, images) opens in a new tab. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const doc = () => PT.win.document;
  /** A real drop: a DataTransfer with the files, dispatched on the page view (the window listener in ui/input.js takes it). */
  function drop(files, target) {
    const dt = new PT.win.DataTransfer();
    files.forEach((f) => dt.items.add(f));
    (target || doc().getElementById('viewer')).dispatchEvent(new PT.win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }
  // a closed dialog stays in the page for its 140 ms fade (.sui-out): it is not the one on screen
  const choiceDialog = () => doc().querySelector('.sui-back:not(.sui-out) .sui-dlg.si-choose');
  const clickChoice = (label) => {
    const b = [...doc().querySelectorAll('.sui-back:not(.sui-out) .sui-foot .sui-btn')].find((x) => x.textContent === label);
    if (!b) throw new Error('no choice "' + label + '"');
    b.click();
  };
  const clickSui = (label) => {
    const b = [...doc().querySelectorAll('.sui-dlg .sui-btn')].find((x) => x.textContent === label);
    if (!b) throw new Error('no dialog button "' + label + '": ' + [...doc().querySelectorAll('.sui-dlg')].map((d) => d.textContent).join(' | '));
    b.click();
  };
  const suiTitles = () => [...doc().querySelectorAll('.sui-dlg:not(.sl-cvt-dlg) .sui-title')].map((t) => t.textContent);   // the Convert dialog is a SlopUI dialog too
  const file = (name, type, bytes) => new PT.win.File([bytes || new PT.win.Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], name, { type });
  const openTabs = () => PT.SP.docs.list().length;

  describe('drop on the open document', () => {
    it('asks Add to current or Create new when a PDF is dropped on an open document', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }, { text: 'b' }]), 'base.pdf');
      const bytes = await PT.makePdf([{ text: 'x' }]);
      drop([file('extra.pdf', 'application/pdf', bytes)]);
      await waitFor(() => choiceDialog(), { timeout: 15000 });
      const d = choiceDialog();
      expect(d.textContent).toContain('extra.pdf');
      const labels = [...d.querySelectorAll('.sui-foot .sui-btn')].map((b) => b.textContent);
      expect(labels).toEqual(['Cancel', 'Create new', 'Add to current']);
      expect(PT.E.state.pages.length).toBe(2);
      clickChoice('Cancel');
      await waitFor(() => !choiceDialog());
      expect(PT.E.state.pages.length).toBe(2);
    }, { timeout: 60000 });

    it('Add to current adds the pages to this document, at the place chosen', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }, { text: 'b' }]), 'base2.pdf');
      drop([file('more.pdf', 'application/pdf', await PT.makePdf([{ text: 'x' }]))]);
      await waitFor(() => choiceDialog(), { timeout: 15000 });
      clickChoice('Add to current');
      await waitFor(() => suiTitles().includes('Add pages'), { timeout: 15000 });
      clickSui('Add pages');
      await waitFor(() => PT.E.state.pages.length === 3, { timeout: 30000 });
      expect(PT.texts()).toEqual(['1', '2', '1']);
      expect(PT.E.undoLabel()).toBeTruthy();
    }, { timeout: 90000 });

    it('Create new opens the dropped file in a new tab and leaves this document as it was', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }, { text: 'b' }]), 'base3.pdf');
      const before = openTabs();
      drop([file('fresh.pdf', 'application/pdf', await PT.makePdf([{ text: 'x' }]))]);
      await waitFor(() => choiceDialog(), { timeout: 15000 });
      clickChoice('Create new');
      await waitFor(() => openTabs() === before + 1 && PT.E.state.pages.length === 1, { timeout: 30000 });
      expect(PT.E.state.pages.length).toBe(1);
      expect(PT.texts()).toEqual(['1']);
    }, { timeout: 90000 });

    it('with no document open, the file opens without a choice', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      // a stored tab may still be loading from an earlier test: a drop is refused until the app is idle
      await waitFor(() => !PT.A.isLocked(), { timeout: 20000 });
      // PT.reset() empties only the tab on screen, and an earlier test's tab would come on screen: a new empty tab is
      // "no document open" as the person sees it
      PT.A.newTab();
      await waitFor(() => PT.E.state.pages.length === 0 && !PT.A.isLocked(), { timeout: 20000 });
      drop([file('solo.pdf', 'application/pdf', await PT.makePdf([{ text: 'x' }, { text: 'y' }]))]);
      try {
        await waitFor(() => PT.E.state.pages.length === 2 || choiceDialog(), { timeout: 30000 });
        expect(choiceDialog()).toBe(null);
        expect(PT.E.state.pages.length).toBe(2);
      } finally {
        if (choiceDialog()) clickChoice('Cancel'); // never leave the dialog open for the next test
      }
    }, { timeout: 60000 });
  });

  describe('files that are not PDFs or images go to the Convert dialog', () => {
    const cvtDialog = () => doc().querySelector('.sl-cvt-dlg');
    const cvtText = () => (cvtDialog() ? cvtDialog().textContent : '');
    const converterReady = () => waitFor(() => PT.win.SlopConvert, { timeout: 30000 }); // a module: loads after the page
    const toastText = () => (doc().querySelector('.sui-toast') || {}).textContent || '';
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#c33"/></svg>';

    it('an XLSX drop opens the converter with the file, which says it cannot become a PDF; nothing is added', async () => {
      if (!PT.SP) await PT.boot();
      await converterReady();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'base4.pdf');
      drop([file('budget.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', new PT.win.Uint8Array([80, 75, 3, 4, 0, 0]))]);
      await waitFor(() => cvtDialog() && cvtText().includes('budget.xlsx'), { timeout: 30000 });
      // the row shows first, "Reading…"; what the file can become comes once it is read
      await waitFor(() => cvtText().includes('cannot be converted to PDF here'), { timeout: 15000 });
      expect(suiTitles()).toEqual([]);
      expect(PT.E.state.pages.length).toBe(1);
      doc().querySelector('.sl-cvt-dlg .sui-x').click();
      await waitFor(() => !cvtDialog());
    }, { timeout: 60000 });

    it('an HTML drop opens the converter with the file, and a text or CSV drop opens it too', async () => {
      if (!PT.SP) await PT.boot();
      await converterReady();
      PT.reset();
      drop([file('page.html', 'text/html', new PT.win.TextEncoder().encode('<p>hi</p>'))]);
      await waitFor(() => cvtDialog() && cvtText().includes('page.html'), { timeout: 30000 });
      await waitFor(() => cvtDialog().querySelector('.cv-to[data-target="html-to-pdf"]'), { timeout: 15000 }); // the file's Convert to: Picture PDF
      expect(cvtText()).not.toContain('cannot be converted to PDF here');
      doc().querySelector('.sl-cvt-dlg .sui-x').click();
      await waitFor(() => !cvtDialog());
      drop([file('data.csv', 'text/csv', new PT.win.TextEncoder().encode('a,b\n1,2\n'))]);
      await waitFor(() => cvtDialog() && cvtText().includes('data.csv'), { timeout: 30000 });
      expect(cvtText()).toContain('CSV');
      doc().querySelector('.sl-cvt-dlg .sui-x').click();
      await waitFor(() => !cvtDialog());
      expect(PT.E.state.pages.length).toBe(0);
    }, { timeout: 90000 });

    it('an SVG drop opens the converter set to PDF; converting it opens the PDF in a new tab and closes the converter', async () => {
      if (!PT.SP) await PT.boot();
      await converterReady();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'base5.pdf');
      const before = openTabs();
      drop([file('logo.svg', 'image/svg+xml', new PT.win.TextEncoder().encode(SVG))]);
      await waitFor(() => cvtDialog() && cvtText().includes('logo.svg'), { timeout: 30000 });
      await waitFor(() => cvtDialog().querySelector('.cv-to[data-target="images-to-pdf"]'), { timeout: 15000 });
      cvtDialog().querySelector('.cv-form button[type=submit]').click();
      await waitFor(() => !cvtDialog(), { timeout: 60000 });
      await waitFor(() => openTabs() === before + 1 && PT.E.state.pages.length === 1, { timeout: 60000 });
      await waitFor(() => toastText().includes('Converted logo.svg to PDF'), { timeout: 15000 });
      expect(choiceDialog()).toBe(null);
    }, { timeout: 120000 });

    it('an HTML file converts to a picture PDF, which opens in a new tab; the converter closes', async () => {
      await converterReady();
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'a' }]), 'base6.pdf');
      const before = openTabs();
      drop([file('report.html', 'text/html', new PT.win.TextEncoder().encode('<!doctype html><html><head><style>h1{color:#c33}</style><script>document.title="x"</script></head><body><h1>Hello</h1><p>A small page.</p><img src="https://example.invalid/x.png"></body></html>'))]);
      await waitFor(() => cvtDialog() && cvtText().includes('report.html'), { timeout: 30000 });
      await waitFor(() => cvtDialog().querySelector('.cv-to[data-target="html-to-pdf"]'), { timeout: 15000 });
      cvtDialog().querySelector('.cv-form button[type=submit]').click();
      await waitFor(() => !cvtDialog(), { timeout: 90000 });
      await waitFor(() => openTabs() === before + 1 && PT.E.state.pages.length === 1, { timeout: 90000 });
      await waitFor(() => toastText().includes('Converted report.html to PDF'), { timeout: 15000 });
    }, { timeout: 150000 });

    it('a mixed drop opens the PDF and sends the other file to the converter', async () => {
      if (!PT.SP) await PT.boot();
      await converterReady();
      PT.reset();
      drop([file('ok.pdf', 'application/pdf', await PT.makePdf([{ text: 'x' }])), file('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', new PT.win.Uint8Array([80, 75, 3, 4, 0, 0]))]);
      await waitFor(() => cvtDialog() && cvtText().includes('notes.docx'), { timeout: 30000 });
      await waitFor(() => PT.E.state.pages.length === 1, { timeout: 30000 });
      expect(cvtText()).not.toContain('ok.pdf');
      doc().querySelector('.sl-cvt-dlg .sui-x').click();
      await waitFor(() => !cvtDialog());
    }, { timeout: 60000 });
  });
})();
