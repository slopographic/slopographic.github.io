/* Slop Contacts and Slop Drive: the list is saved as contacts.vcf in the app's Drive folder, as a new version of the same
 * record, after a short delay or at once with Save. The status line says what happened, and a failure gives the reason.
 * An empty list is offered the file at start-up; opening it shows the preview, and Import brings the contacts back with
 * their X-SLOP ids, groups, stage and follow-up date. A non-empty list is asked before anything is merged. SlopHub is
 * stubbed: the app reads and writes this page's stub, set on the iframe after it boots (see drive.test.html). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** An in-memory stand-in for the SlopHub calls the app makes. Records: { id, name, blob, folderId, trashedAt, version }. */
  function stubHub() {
    const files = new Map(), folders = new Map([['f-app', { id: 'f-app', name: 'Slop Contacts', app: 'contacts', parentId: null, trashedAt: null }]]);
    let n = 0;
    const h = {
      files, folders, puts: [], fail: null,
      register() {}, consumeLaunch: async () => null, on: () => () => {}, emit() {}, fmtSize: (x) => `${x} B`,
      listFolders: async () => [...folders.values()],
      appFolderId: async () => 'f-app',
      list: async ({ folderId } = {}) => [...files.values()].filter((r) => (folderId === undefined || r.folderId === folderId) && !r.trashedAt),
      get: async (id) => (files.has(id) ? { ...files.get(id) } : null),
      put: async (blob, { id, name, from, folderId } = {}) => {
        if (h.fail) throw new Error(h.fail);
        const rid = id || `drive-${++n}`, prev = files.get(rid);
        files.set(rid, { id: rid, name, type: blob.type, size: blob.size, from, folderId: folderId == null ? null : folderId,
          trashedAt: null, time: Date.now(), blob, version: prev ? prev.version + 1 : 1 });
        h.puts.push({ id: rid, name, version: files.get(rid).version });
        return rid;
      },
    };
    return h;
  }

  /** A contacts.vcf as another device or an older save wrote it. Its X-SLOP-ID was never stored on this device. */
  const FILE = ['BEGIN:VCARD', 'VERSION:4.0', 'FN:Ada Vance', 'N:Vance;Ada;;;', 'TEL;TYPE=CELL:0700 111', 'EMAIL;TYPE=WORK:ada@example.com',
    'X-SLOP-ID:never-stored-1', 'X-SLOP-GROUP:Friends', 'X-SLOP-GROUP:VIP', 'X-SLOP-STAGE:customer', 'X-SLOP-FOLLOWUP:2026-11-05', 'END:VCARD'].join('\r\n') + '\r\n';
  const putFile = (hub) => hub.put(new Blob([FILE], { type: 'text/vcard' }), { name: 'contacts.vcf', from: 'contacts', folderId: 'f-app' });

  /** Boots the app in its iframe and waits until it is ready. The real hub is in place at boot; the stub goes in after. */
  async function boot(hub) {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    const win = fr.contentWindow;
    if (hub) win.SlopHub = hub;
    return win;
  }
  const $ = (win, sel) => win.document.querySelector(sel);
  const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
  const status = (win) => $(win, '#driveStatus').textContent;
  const dialogButton = (win, label) => $$(win, '.sui-dlg button').find((b) => b.textContent.trim() === label);
  const dialogTitle = (win) => { const d = $(win, '.sui-dlg'); return d ? d.getAttribute('aria-label') : ''; };
  const stored = (id) => window.SlopData.store.get('customers', id).then((r) => r.value);
  const seedAda = (id) => CT.seed([{ id, name: 'Ada Vance', stage: 'customer', followUp: '2026-11-05',
    categories: ['Friends', 'VIP'], email: 'ada@example.com', emailLabel: 'work', phone: '0700 111', phoneLabel: 'mobile' }]);

  describe('save to Slop Drive', () => {
    it('a change is saved as contacts.vcf after a short delay, with the status line and the X-SLOP fields', async () => {
      await CT.resetCustomers();
      await seedAda('save-ada-1');
      const hub = stubHub();
      const win = await boot(hub);
      const S = win.SlopContacts.state;
      S.setList(S.list.map((c) => ({ ...c, groups: [...c.groups, 'Club'] })));
      await waitFor(() => hub.puts.length === 1, { timeout: 10000 });
      expect(hub.puts[0].name).toBe('contacts.vcf');
      expect(status(win).startsWith('Saved to Slop Drive at ')).toBe(true);
      const body = await hub.files.get(hub.puts[0].id).blob.text();
      expect(body).toContain('VERSION:4.0');
      expect(body).toContain('X-SLOP-ID:save-ada-1');
      expect(body).toContain('X-SLOP-GROUP:Club');
      expect(body).toContain('X-SLOP-STAGE:customer');
      expect(body).toContain('X-SLOP-FOLLOWUP:2026-11-05');
    });

    it('Save writes at once, as a new version of the same file, never a second file', async () => {
      await CT.resetCustomers();
      await seedAda(undefined);
      const hub = stubHub();
      const win = await boot(hub);
      const S = win.SlopContacts.state;
      S.setList(S.list.map((c) => ({ ...c, note: 'First note' })));
      $(win, '#btnDriveSave').click();
      await waitFor(() => hub.puts.length === 1 && status(win).startsWith('Saved'), { timeout: 2000 });
      expect(hub.puts[0].version).toBe(1);
      S.setList(S.list.map((c) => ({ ...c, note: 'Second note' })));
      $(win, '#btnDriveSave').click();
      await waitFor(() => hub.puts.length === 2, { timeout: 2000 });
      expect(hub.files.size).toBe(1);
      expect(hub.puts[1].id).toBe(hub.puts[0].id);
      expect(hub.puts[1].version).toBe(2);
      expect((await hub.files.get(hub.puts[1].id).blob.text()).includes('Second note')).toBe(true);
    });

    it('a failed save says why; the next Save writes the list', async () => {
      await CT.resetCustomers();
      await seedAda(undefined);
      const hub = stubHub();
      const win = await boot(hub);
      hub.fail = 'Drive is full';
      $(win, '#btnDriveSave').click();
      await waitFor(() => status(win).startsWith('Could not save'), { timeout: 5000 });
      expect(status(win)).toBe('Could not save: Drive is full');
      expect(hub.files.size).toBe(0);
      hub.fail = null;
      $(win, '#btnDriveSave').click();
      await waitFor(() => status(win).startsWith('Saved to Slop Drive'), { timeout: 5000 });
      expect(hub.files.size).toBe(1);
    });
  });

  describe('open from Slop Drive', () => {
    it('an empty list is offered contacts.vcf; Open shows the preview, and Import brings back the id, groups, stage and follow-up', async () => {
      await CT.resetCustomers();
      const hub = stubHub();
      await putFile(hub);
      const win = await boot(hub);
      expect(win.SlopContacts.state.list.length).toBe(0);
      win.SlopContacts.driveLoad.offerAtStart();
      await waitFor(() => dialogTitle(win) === 'Open your contacts from Slop Drive?', { timeout: 5000 });
      dialogButton(win, 'Open').click();
      await waitFor(() => dialogTitle(win).startsWith('Import 1 contact'), { timeout: 5000 });
      dialogButton(win, 'Import').click();
      await waitFor(() => win.SlopContacts.state.list.length === 1, { timeout: 5000 });
      const c = win.SlopContacts.state.list[0];
      expect(c.id).toBe('never-stored-1');
      expect(c.groups).toEqual(['Friends', 'VIP']);
      expect(c.stage).toBe('customer');
      expect(c.followUp).toBe('2026-11-05');
      await waitFor(() => stored('never-stored-1').then((r) => !!r), { timeout: 5000 });
      expect((await stored('never-stored-1')).stage).toBe('customer');
    });

    it('a list that already has contacts is asked before the file is merged; Cancel changes nothing', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'other-1', name: 'Other Person' }]);
      const hub = stubHub();
      await putFile(hub);
      const win = await boot(hub);
      win.SlopContacts.driveLoad.open();
      await waitFor(() => dialogTitle(win) === 'Merge contacts from Slop Drive?', { timeout: 5000 });
      dialogButton(win, 'Cancel').click();
      await waitFor(() => !$(win, '.sui-dlg'), { timeout: 5000 });
      expect(win.SlopContacts.state.list.map((c) => c.id)).toEqual(['other-1']);
    });
  });
})();
