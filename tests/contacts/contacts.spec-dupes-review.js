/* Slop Contacts: Find duplicates opens the review window first. Merge all and Merge list each proposed merge, checked.
 * Only the merges left checked are applied, Cancel changes nothing, and the toast after a merge can undo it.
 * Runs the real app in the app iframe (see contacts.spec-app.js). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** Boots Slop Contacts in the app frame (the same loader as contacts.spec-app.js). */
  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    return fr.contentWindow;
  }
  const findDlg = (win) => win.document.querySelector('.sui-dlg[aria-label="Find duplicates"]');
  const reviewDlg = (win) => [...win.document.querySelectorAll('.sui-back:not(.sui-out) .sr-dlg')].pop();
  const named = (win, c) => win.SlopContacts.model.displayName(c);
  /** Four contacts in two pairs (a shared e-mail, a shared phone). Ids are unique per test: deleted ids cannot be seeded again. */
  let run = 0;
  const SEED = () => { const t = 'dd' + (++run); return [
    { id: t + '-1', name: 'Pair One', email: 'pair1@example.com' },
    { id: t + '-2', name: 'Pair One Copy', email: 'PAIR1@example.com' },
    { id: t + '-3', name: 'Phone A', phone: '+1 555 010 0101' },
    { id: t + '-4', name: 'Phone A Dup', phone: '+1 (555) 010-0101' },
  ]; };
  async function openMergeAll(win) {
    win.SlopContacts.tools.dupesDialog();
    const dlg = await waitFor(() => findDlg(win));
    [...dlg.querySelectorAll('.sui-btn')].find((b) => b.textContent === 'Merge all').click();
    return waitFor(() => reviewDlg(win));
  }

  describe('contacts: duplicates in the review window', () => {
    it('Merge all lists each proposed merge checked, and applying merges only the ones left checked', async () => {
      await CT.resetCustomers();
      await CT.seed(SEED());
      const win = await boot();
      expect(win.SlopContacts.state.list.length).toBe(4);
      const rv = await openMergeAll(win);
      const rows = [...rv.querySelectorAll('.sr-row')];
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.querySelector('input').checked)).toBe(true);
      expect(rows[1].querySelector('small').textContent).toContain('phone +15550100101');
      rows[1].querySelector('input').click();
      rv.querySelector('.sui-foot .sui-primary').click();
      await waitFor(() => win.SlopContacts.state.list.length === 3);
      const names = win.SlopContacts.state.list.map((c) => named(win, c));
      // the unticked phone pair stays as two contacts; the e-mail pair is merged into one
      expect(names).toContain('Phone A');
      expect(names).toContain('Phone A Dup');
      expect(names.filter((n) => n.startsWith('Pair One')).length).toBe(1);
    }, { timeout: 60000 });

    it('Cancel in the review window leaves every contact as it was', async () => {
      await CT.resetCustomers();
      await CT.seed(SEED());
      const win = await boot();
      const rv = await openMergeAll(win);
      rv.querySelector('.sui-x').click();
      await waitFor(() => !reviewDlg(win));
      expect(win.SlopContacts.state.list.length).toBe(4);
    }, { timeout: 60000 });

    it('the toast after a merge can undo it', async () => {
      await CT.resetCustomers();
      await CT.seed(SEED());
      const win = await boot();
      const rv = await openMergeAll(win);
      rv.querySelector('.sui-foot .sui-primary').click();
      await waitFor(() => win.SlopContacts.state.list.length === 2);
      const undo = await waitFor(() => win.document.querySelector('.sui-toast-act'));
      expect(undo.textContent).toBe('Undo');
      undo.click();
      await waitFor(() => win.SlopContacts.state.list.length === 4);
    }, { timeout: 60000 });
  });
})();
