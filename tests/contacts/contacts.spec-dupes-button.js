/* Slop Contacts: the Duplicates button in the top bar (data-cmd="contacts.dupes") opens the duplicates dialog. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    return fr.contentWindow;
  }
  describe('contacts: the Duplicates button', () => {
    it('clicking the top-bar Duplicates button with duplicates in the list opens the duplicates dialog', async () => {
      await CT.resetCustomers();
      await CT.seed([
        { id: 'btn-1', name: 'Btn One', email: 'btn1@example.com' },
        { id: 'btn-2', name: 'Btn One Copy', email: 'BTN1@example.com' },
      ]);
      const win = await boot();
      const btn = win.document.querySelector('[data-cmd="contacts.dupes"]');
      expect(!!btn).toBe(true);
      btn.click();
      const dlg = await waitFor(() => win.document.querySelector('.sui-dlg[aria-label="Find duplicates"]'), { timeout: 5000 });
      expect(!!dlg).toBe(true);
    }, { timeout: 60000 });
  });
})();
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  describe('contacts: the Duplicates button says why it cannot run', () => {
    it('with fewer than two contacts, the button says so instead of doing nothing', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'solo-1', name: 'Solo', email: 'solo@example.com' }]);
      const fr = document.getElementById('app');
      fr.src = 'about:blank';
      await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
      fr.src = '../../contacts/index.html';
      const win = await waitFor(() => fr.contentWindow && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready && fr.contentWindow, { timeout: 30000 });
      win.document.querySelector('[data-cmd="contacts.dupes"]').click();
      const toast = await waitFor(() => [...win.document.querySelectorAll('.sui-toast, [role="status"]')].find((t) => /at least two contacts/.test(t.textContent)), { timeout: 5000 });
      expect(!!toast).toBe(true);
    }, { timeout: 60000 });
  });
})();
