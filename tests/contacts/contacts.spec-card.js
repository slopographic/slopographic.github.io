/* Slop Contacts card and list actions on the shared customer records: edit in place, the pipeline and dated notes
 * saved at once, the CRM-only fields kept through an edit, shift and Cmd click and bulk stage, drag onto a group,
 * duplicate, and import of a vCard into customer records. */
(function () {
  'use strict';
  const { describe, it, expect, sleep, waitFor } = SlopTest;

  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    return fr.contentWindow;
  }
  const $ = (win, sel) => win.document.querySelector(sel);
  const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
  const rowFor = (win, name) => $$(win, '#rows .row').find((r) => r.querySelector('.row-name').textContent === name);
  const dialogButton = (win, label) => $$(win, '.sui-dlg button').find((b) => b.textContent.trim() === label);
  const stored = (id) => window.SlopData.store.get('customers', id).then((r) => r.value);
  const fire = (win, el, type, init = {}) => el.dispatchEvent(new win.Event(type, { bubbles: true, ...init }));
  const change = (win, el, value) => { el.value = value; fire(win, el, 'change'); };

  describe('edit in place', () => {
    it('Edit turns the card into a form; Save keeps the phones the screen does not change and the CRM fields', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'ed-1', name: 'Gina Hart', phone: '0700 000', phoneLabel: 'work', phones: [{ label: 'mobile', value: '0799 111' }],
        contactId: 'legacy-7', notes: 'Old intro' }]);
      const win = await boot();
      rowFor(win, 'Gina Hart').click();
      await waitFor(() => $(win, '[data-act="edit"]'));
      $(win, '[data-act="edit"]').click();
      await waitFor(() => $(win, '.ed-form'));
      $(win, 'input[aria-label="Company"]').value = 'Acme Ltd';
      $(win, 'input[aria-label="Job title"]').value = 'Buyer';
      $(win, 'form.ed-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
      await waitFor(async () => (await stored('ed-1')).company === 'Acme Ltd', { timeout: 8000 });
      const r = await stored('ed-1');
      expect(r.company).toBe('Acme Ltd');
      expect(r.title).toBe('Buyer');
      expect(r.phone).toBe('0700 000');
      expect(r.phoneLabel).toBe('work');
      expect(r.phones).toEqual([{ label: 'mobile', value: '0799 111' }]);
      expect(r.contactId).toBe('legacy-7');
      expect($(win, '.card-name').textContent).toBe('Gina Hart');
      expect($(win, '.card-sub').textContent).toContain('Acme Ltd');
    });

    it('Cancel with changes asks first and keeps the stored record', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'ed-2', name: 'Hal Stone', company: 'Before' }]);
      const win = await boot();
      rowFor(win, 'Hal Stone').click();
      await waitFor(() => $(win, '[data-act="edit"]'));
      $(win, '[data-act="edit"]').click();
      await waitFor(() => $(win, '.ed-form'));
      $(win, 'input[aria-label="Company"]').value = 'Changed';
      $(win, '#card .sf-p-foot [data-act="cancel"]').click();
      await waitFor(() => dialogButton(win, 'Discard'));
      dialogButton(win, 'Cancel').click();
      await sleep(60);
      expect($(win, '.ed-form')).toBeTruthy();
      expect((await stored('ed-2')).company).toBe('Before');
    });
  });

  describe('pipeline, notes and activity', () => {
    it('stage and next follow-up date are saved at once', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'pl-1', name: 'Pia Lead' }]);
      const win = await boot();
      rowFor(win, 'Pia Lead').click();
      await waitFor(() => $(win, '[data-act="stage"]'));
      change(win, $(win, '[data-act="stage"]'), 'contacted');
      change(win, $(win, '[data-act="followUp"]'), '2026-11-03');
      await waitFor(async () => (await stored('pl-1')).followUp === '2026-11-03', { timeout: 8000 });
      const r = await stored('pl-1');
      expect(r.stage).toBe('contacted');
      expect(r.followUp).toBe('2026-11-03');
    });

    it('a dated note is added to Activity, and the plain notes stay as they were', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'ac-1', name: 'Ada Notes', notes: 'Plain intro\n[2026-01-02] Called' }]);
      const win = await boot();
      rowFor(win, 'Ada Notes').click();
      await waitFor(() => $(win, '.notes'));
      expect($(win, '.notes').textContent).toBe('Plain intro');
      expect($$(win, '.acts .act-text').map((x) => x.textContent)).toEqual(['Called']);
      $(win, '#actDate').value = '2026-03-04';
      $(win, '#actText').value = 'Sent the quote';
      $(win, '.act-form').dispatchEvent(new win.Event('submit', { cancelable: true, bubbles: true }));
      await waitFor(async () => ((await stored('ac-1')).notes || '').includes('Sent the quote'), { timeout: 8000 });
      expect((await stored('ac-1')).notes).toBe('Plain intro\n[2026-01-02] Called\n[2026-03-04] Sent the quote');
    });
  });

  describe('list actions', () => {
    it('shift click selects a range, Cmd click toggles, and the bulk stage sets every selected contact', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'bk-a', name: 'Bulk Ann' }, { id: 'bk-b', name: 'Bulk Ben' }, { id: 'bk-c', name: 'Bulk Cy' }, { id: 'bk-d', name: 'Bulk Di' }]);
      const win = await boot();
      rowFor(win, 'Bulk Ann').click();
      rowFor(win, 'Bulk Cy').dispatchEvent(new win.MouseEvent('click', { bubbles: true, shiftKey: true }));
      await sleep(40);
      expect(win.SlopContacts.state.sel.size).toBe(3);
      rowFor(win, 'Bulk Di').dispatchEvent(new win.MouseEvent('click', { bubbles: true, metaKey: true }));
      await sleep(40);
      expect(win.SlopContacts.state.sel.size).toBe(4);
      rowFor(win, 'Bulk Ben').dispatchEvent(new win.MouseEvent('click', { bubbles: true, metaKey: true }));
      await sleep(40);
      expect(win.SlopContacts.state.sel.size).toBe(3);
      expect($(win, '#bulkBar').hidden).toBeFalsy();
      change(win, $(win, '#bulkStage'), 'customer');
      await waitFor(async () => (await stored('bk-c')).stage === 'customer', { timeout: 8000 });
      await waitFor(async () => (await stored('bk-d')).stage === 'customer', { timeout: 8000 });
      expect((await stored('bk-a')).stage).toBe('customer');
      expect((await stored('bk-b')).stage).toBe('lead');
    });

    it('dragging a contact onto a group adds it to that group', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'dg-1', name: 'Drag Fay', categories: ['Friends'] }, { id: 'dg-2', name: 'Drag Gus' }]);
      const win = await boot();
      const dt = new win.DataTransfer();
      dt.setData('text/x-slop-ids', JSON.stringify(['dg-2']));
      const target = $(win, '.grp[data-group="cat:Friends"]');
      target.dispatchEvent(new win.DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      await waitFor(async () => ((await stored('dg-2')).categories || []).includes('Friends'), { timeout: 8000 });
      expect((await stored('dg-2')).categories).toEqual(['Friends']);
    });

    it('Duplicate makes a copy under a new id and opens it in the form', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'du-1', name: 'Dup Hana', company: 'Twin' }]);
      const win = await boot();
      rowFor(win, 'Dup Hana').click();
      await waitFor(() => $(win, '[data-act="dup"]'));
      $(win, '[data-act="dup"]').click();
      await waitFor(() => $(win, '.ed-form'), { timeout: 5000 });
      await waitFor(async () => (await window.SlopData.store.list('customers')).value.filter((c) => c.name === 'Dup Hana').length === 2, { timeout: 8000 });
      const all = (await window.SlopData.store.list('customers')).value.filter((c) => c.name === 'Dup Hana');
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.company)).toEqual(['Twin', 'Twin']);
    });
  });

  describe('import', () => {
    it('a vCard becomes customer records: the name, the labelled phones and e-mails, birthday and groups', async () => {
      await CT.resetCustomers();
      const win = await boot();
      // The import shows the preview first: the file is read, then Import is pressed in the dialog.
      const pending = win.SlopContacts.io.importFiles([{ name: 'people.vcf', text: () => Promise.resolve(CT.VCF30) }]);
      await waitFor(() => [...win.document.querySelectorAll('.sui-dlg button')].find((b) => b.textContent.trim() === 'Import'), { timeout: 5000 });
      [...win.document.querySelectorAll('.sui-dlg button')].find((b) => b.textContent.trim() === 'Import').click();
      expect(await pending).toBe(true);
      await waitFor(() => win.SlopContacts.state.list.some((c) => c.id && c.fn.startsWith('Dr. Jose')), { timeout: 8000 });
      const c = (await window.SlopData.store.list('customers')).value.find((x) => x.name.startsWith('Dr. Jose'));
      expect(c.company).toBe('Acme; Ltd');
      expect(c.phone).toBe('+49 170 1234567');
      expect(c.phoneLabel).toBe('mobile');
      expect(c.phones).toEqual([{ label: 'work', value: '+49 30 555 0100' }]);
      expect(c.email).toBe('jose@example.com');
      expect(c.birthday).toBe('1980-02-29');
      expect(c.categories).toEqual(['Friends', 'Work, Club'].slice(0, 1).concat(c.categories.slice(1)));
      expect(c.categories).toContain('Work, Club');
    });
  });
})();
