/* Slop PDF File > Rename: the document's name changes (the output name in the top bar), the original file name is kept
   and shown as its tooltip, and a document linked to Slop Drive renames the Drive file too (extension kept). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  describe('File > Rename', () => {
    it('changes the document name, keeps the original name, and renames the linked Drive file', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'x' }]), 'report.pdf');
      const field = PT.win.document.getElementById('fileName');
      PT.A.rename('Q3 summary');
      expect(field.value).toBe('Q3 summary.pdf');
      expect(PT.A.originalName()).toBe('report.pdf');
      expect(field.title.includes('Original name: report.pdf')).toBe(true);
      expect(PT.E.state.pages.length).toBe(1);
      // edit in place: File > Rename with no name focuses the field
      PT.A.rename(null);
      expect(PT.win.document.activeElement).toBe(field);
      // the File menu has the entry
      const items = PT.A._.fileMenu().filter(Boolean).map((x) => x.label);
      expect(items.includes('Rename…')).toBe(true);
      // a Drive-linked document renames its Drive file, keeping .pdf
      const calls = [];
      const realHub = PT.win.SlopHub; // put back as it was (the Drive specs after this need it)
      PT.win.SlopHub = { update: (id, patch) => { calls.push([id, patch]); return Promise.resolve({ id }); } };
      try {
        PT.A.driveId = 'rec-42';
        PT.A.rename('Final.pdf');
        expect(field.value).toBe('Final.pdf');
        await waitFor(() => calls.length === 1);
        expect(calls[0][0]).toBe('rec-42');
        expect(calls[0][1].name).toBe('Final.pdf');
        expect(PT.A.originalName()).toBe('report.pdf');
        PT.A.rename('   ');
        expect(field.value).toBe('Final.pdf');
      } finally { PT.win.SlopHub = realHub; PT.A.driveId = null; }
    }, { timeout: 60000 });
  });
})();
