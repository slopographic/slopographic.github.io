/* Slop Contacts: a vCard dropped on the list is previewed with its duplicate flagged; merge and Undo. The table view:
 * sort, inline edit, selection and the bulk bar. Drags onto a group move (and copy with Alt). A filter chip and the URL.
 * The splitter by keyboard, kept after a reload. The app runs in a same-origin iframe and reads the shared store. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** Loads a page into a frame (blank first, so the page really reloads) and waits until ready(window) is true. */
  async function load(frameId, url, pathPart, ready) {
    const fr = document.getElementById(frameId);
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    fr.src = url;
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes(pathPart) && ready(fr.contentWindow), { timeout: 30000 });
    return fr.contentWindow;
  }
  const boot = () => load('app', '../../contacts/index.html', 'contacts/index.html', (w) => w.SlopContacts && w.SlopContacts.ready);
  const $ = (win, sel) => win.document.querySelector(sel);
  const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
  const names = (win) => $$(win, '#rows .row-name').map((n) => n.textContent);
  const rowFor = (win, name) => $$(win, '#rows .row').find((r) => r.querySelector('.row-name').textContent === name);
  const tableRow = (win, id) => $$(win, '#tbl tbody tr').find((tr) => tr.dataset.id === id);
  const tableNames = (win) => $$(win, '#tbl tbody tr').map((tr) => tr.querySelector('td[data-col="name"]').textContent);
  const button = (win, root, text) => $$(win, `${root} button`).find((b) => b.textContent.trim() === text);
  const stored = async (name) => (await window.SlopData.store.list('customers')).value.find((c) => c.name === name) || null;

  /** A vCard that matches the seeded "It Ann" on e-mail, and adds "It Zed". */
  const VCF = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:It Ann', 'N:Ann;It;;;', 'EMAIL;TYPE=WORK:ann.it@example.com',
    'TEL;TYPE=CELL:+44 7700 900111', 'PHOTO;ENCODING=b;TYPE=JPEG:/9j/AAAA', 'END:VCARD',
    'BEGIN:VCARD', 'VERSION:4.0', 'FN:It Zed', 'N:Zed;It;;;', 'TEL;VALUE=uri;TYPE="work,voice":tel:+44 20 7946 0999',
    'EMAIL:zed.it@example.com', 'END:VCARD'].join('\r\n') + '\r\n';

  /** A file drop as the browser sends it: dragover, then drop with the files on the DataTransfer. */
  function dropFiles(win, target, files) {
    const dataTransfer = new win.DataTransfer();
    for (const f of files) dataTransfer.items.add(f);
    target.dispatchEvent(new win.DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
  }
  /** A drag of one element onto another: dragstart on the source, then dragover and drop on the target. */
  function drag(win, source, target, init = {}) {
    const dataTransfer = new win.DataTransfer();
    source.dispatchEvent(new win.DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    const opts = { bubbles: true, cancelable: true, dataTransfer, ...init };
    target.dispatchEvent(new win.DragEvent('dragover', opts));
    target.dispatchEvent(new win.DragEvent('drop', opts));
  }
  const click = (win, el, detail = 1) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  /** The saved place can open a group from an earlier test: go back to All Contacts before a test counts the list. */
  const showAll = (win) => click(win, $(win, '.grp[data-group=""]'));

  describe('import by drop', () => {
    it('a dropped vCard is previewed with its duplicate flagged; merge adds the new phone, and Undo puts the list back', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'it-ann', name: 'It Ann', email: 'ann.it@example.com', stage: 'customer' }]);
      const win = await boot();
      dropFiles(win, $(win, '.col-list'), [new win.File([VCF], 'people.vcf', { type: 'text/vcard' })]);
      await waitFor(() => button(win, '.sui-dlg', 'Import'), { timeout: 5000 });
      expect($$(win, '.imp-row.is-dup')).toHaveLength(1);
      expect($(win, '.imp-row.is-dup .imp-status').textContent).toBe('Duplicate of It Ann (e-mail ann.it@example.com): skipped');
      $(win, '.sui-dlg input[name="imp-dup"][value="merge"]').click();
      expect($(win, '.imp-sum').textContent).toMatch(/1 merged/);
      button(win, '.sui-dlg', 'Import').click();
      await waitFor(async () => (await stored('It Zed')) !== null, { timeout: 8000 });
      expect((await stored('It Ann')).phone).toBe('+44 7700 900111');
      expect((await stored('It Ann')).stage).toBe('customer');
      expect((await window.SlopData.store.list('customers')).value.filter((c) => c.name === 'It Ann')).toHaveLength(1);
      $(win, '.sui-toast-act').click();
      await waitFor(async () => (await stored('It Zed')) === null, { timeout: 8000 });
      expect((await stored('It Ann')).phone).toBeFalsy();
      expect(win.SlopContacts.state.list).toHaveLength(1);
    });
  });

  describe('table view', () => {
    it('sorts by a header, edits a cell inline, selects rows and shows the bulk bar; cards come back', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'tb-1', name: 'Tab Bea', company: 'Zeta Inc' }, { id: 'tb-2', name: 'Tab Al', company: 'Acme' }, { id: 'tb-3', name: 'Tab Cy' }]);
      const win = await boot();
      showAll(win);
      click(win, $(win, '.seg-btn[data-view="table"]'));
      expect($(win, '#tableView').hidden).toBe(false);
      expect(win.document.body.classList.contains('table-mode')).toBe(true);
      expect(tableNames(win)).toEqual(['Tab Al', 'Tab Bea', 'Tab Cy']);
      click(win, $(win, '#tbl [data-sort="org"]'));
      expect(tableNames(win)).toEqual(['Tab Al', 'Tab Bea', 'Tab Cy']);
      click(win, $(win, '#tbl [data-sort="org"]'));
      expect(tableNames(win)).toEqual(['Tab Bea', 'Tab Al', 'Tab Cy']);
      expect($(win, '#tbl th[data-col="org"]').getAttribute('aria-sort')).toBe('descending');
      click(win, tableRow(win, 'tb-3').querySelector('td[data-col="org"]'));
      click(win, tableRow(win, 'tb-3').querySelector('td[data-col="org"]'), 2);
      const input = tableRow(win, 'tb-3').querySelector('td[data-col="org"] input');
      expect(!!input).toBe(true);
      input.value = 'Gamma Ltd';
      input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await waitFor(async () => (await stored('Tab Cy')).company === 'Gamma Ltd', { timeout: 8000 });
      click(win, tableRow(win, 'tb-1').querySelector('input[type="checkbox"]'));
      click(win, tableRow(win, 'tb-2').querySelector('input[type="checkbox"]'));
      // The row whose cell was edited is selected too (a cell click selects its row), so three rows are selected.
      expect($(win, '#tblBar').hidden).toBe(false);
      expect($(win, '#tblCount').textContent).toBe('3 selected');
      click(win, $(win, '.seg-btn[data-view="cards"]'));
      expect($(win, '#tableView').hidden).toBe(true);
      expect($(win, '#listScroll').hidden).toBe(false);
    });
  });

  describe('drag onto a group', () => {
    it('dragging moves a contact out of the open group; with Alt it copies', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'dg-m', name: 'Dg Mover', categories: ['Dg Old'] }, { id: 'dg-s', name: 'Dg Stay', categories: ['Dg Old'] },
        { id: 'dg-c', name: 'Dg Copy', categories: ['Dg Old'] }, { id: 'dg-n', name: 'Dg Anchor', categories: ['Dg New'] }]);
      const win = await boot();
      click(win, $(win, '.grp[data-group="cat:Dg Old"]'));
      expect(names(win)).toEqual(['Dg Copy', 'Dg Mover', 'Dg Stay']);
      drag(win, rowFor(win, 'Dg Mover'), $(win, '.grp[data-group="cat:Dg New"]'));
      await waitFor(async () => JSON.stringify((await stored('Dg Mover')).categories) === '["Dg New"]', { timeout: 8000 });
      expect(names(win)).toEqual(['Dg Copy', 'Dg Stay']);
      drag(win, rowFor(win, 'Dg Copy'), $(win, '.grp[data-group="cat:Dg New"]'), { altKey: true });
      await waitFor(async () => [...(await stored('Dg Copy')).categories].sort().join(',') === 'Dg New,Dg Old', { timeout: 8000 });
      expect(names(win)).toEqual(['Dg Copy', 'Dg Stay']);
    });
  });

  describe('export', () => {
    it('vCard 4.0 and the XLSX workbook come out with the right contents', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'ex-1', name: 'Ex One', company: 'Export Co', email: 'ex1@example.com', phone: '+1 555 0100', categories: ['Ex'] }]);
      const win = await boot();
      const list = win.SlopContacts.state.list;
      const v4 = win.SlopContacts.format.exportAs('vcf40', list, 'Contacts');
      const text = await v4.blob.text();
      expect(v4.name).toBe('Contacts (4.0).vcf');
      expect(text).toContain('VERSION:4.0');
      expect(text).toContain('FN:Ex One');
      const x = await win.SlopContacts.io.xlsxFile(list);
      expect(x.name).toBe('Contacts.xlsx');
      const bytes = new Uint8Array(await x.blob.arrayBuffer());
      expect(bytes[0]).toBe(0x50); // a zip ("PK")
      expect(new TextDecoder('latin1').decode(bytes)).toContain('xl/worksheets/sheet1.xml');
      // The shared reader opens the workbook: the sheet holds the contact (its cells are compressed in the file).
      const back = await (await import('../../shared/sheets/read.js')).read(new win.File([bytes], 'Contacts.xlsx'));
      expect(back.format).toBe('xlsx');
      expect(JSON.stringify(back.sheets[0])).toContain('Export Co');
      expect(JSON.stringify(back.sheets[0])).toContain('ex1@example.com');
    });
  });

  describe('filters, URL and layout', () => {
    it('an organisation filter shows as a chip and is kept in the URL; the chip removes it', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'fl-a', name: 'Fl Alpha', company: 'Filter Co' }, { id: 'fl-b', name: 'Fl Beta', company: 'Other Co' }]);
      const win = await boot();
      showAll(win);
      const sel = $(win, '#filters select[data-f="org"]');
      sel.value = 'Filter Co';
      sel.dispatchEvent(new win.Event('change', { bubbles: true }));
      expect(names(win)).toEqual(['Fl Alpha']);
      expect($(win, '#chips .chip').textContent).toContain('Organisation: Filter Co');
      expect(win.location.search).toMatch(/[?&]f=/);
      click(win, $(win, '#chips .chip'));
      expect(names(win)).toEqual(['Fl Alpha', 'Fl Beta']);
      expect($(win, '#chips').hidden).toBe(true);
    });

    it('the splitter moves with the arrow keys and keeps its width after a reload', async () => {
      localStorage.removeItem('slop-contacts.list-width');
      let win = await boot();
      const width = (w) => Math.round(w.document.querySelector('.col-list').getBoundingClientRect().width);
      const w0 = width(win);
      const sp = $(win, '#splitter');
      for (let i = 0; i < 2; i++) sp.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const w1 = width(win);
      expect(w1 - w0).toBe(32);
      expect(Number(localStorage.getItem('slop-contacts.list-width'))).toBe(w1);
      win = await boot();
      expect(width(win)).toBe(w1);
      localStorage.removeItem('slop-contacts.list-width');
    });
  });
})();
