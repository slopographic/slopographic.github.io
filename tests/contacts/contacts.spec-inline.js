/* Slop Contacts inline editing: New contact adds a row at the top of the sidebar with its name field focused (no
 * dialog); the card has a View / Edit switch (View is read-only, a click on the card's text does not edit); Escape
 * leaves edit mode; the mode is remembered for the next contact. The app runs in a same-origin iframe. */
(function () {
  'use strict';
  const { describe, it, expect, sleep, waitFor } = SlopTest;

  /** Boots Slop Contacts in the frame, after the per-device card mode is cleared (the app reads it when it loads). */
  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    try { localStorage.removeItem('slop-contacts.mode'); } catch (e) { /* blocked */ }
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    await sleep(200);
    return fr.contentWindow;
  }
  const $ = (win, sel) => win.document.querySelector(sel);
  const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
  const rowFor = (win, name) => $$(win, '#rows .row').find((r) => r.querySelector('.row-name').textContent === name);
  const typeIn = (win, el, value) => { el.value = value; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  const key = (win, el, k) => el.dispatchEvent(new win.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const switchBtn = (win, mode) => $(win, `#cardBody .mode-switch [data-act="${mode}"]`);

  describe('New contact in the list', () => {
    it('New contact adds a row at the top of the list with the name focused, and no dialog opens', async () => {
      await CT.resetCustomers();
      await CT.seed([{ name: 'Zed Existing', id: 'in-z' }]);
      const win = await boot();
      $(win, '#btnNew').click();
      await waitFor(() => $(win, '#rows .row-new-input'));
      const field = $(win, '#rows .row-new-input');
      expect(win.document.activeElement).toBe(field);
      expect($(win, '#rows').firstElementChild.contains(field)).toBe(true);
      expect(win.document.querySelector('.sui-dlg')).toBeFalsy();
      expect(document.querySelector('.sui-dlg')).toBeFalsy();
      expect(rowFor(win, 'Zed Existing')).toBeTruthy();
    });

    it('Enter creates the contact from the typed name and opens it in the card', async () => {
      await CT.resetCustomers();
      const win = await boot();
      $(win, '#btnNew').click();
      await waitFor(() => $(win, '#rows .row-new-input'));
      typeIn(win, $(win, '#rows .row-new-input'), 'Inline Ines');
      key(win, $(win, '#rows .row-new-input'), 'Enter');
      await waitFor(() => rowFor(win, 'Inline Ines'), { timeout: 5000 });
      expect($(win, '#rows .row-new-input')).toBeFalsy();
      expect($(win, '#cardBody .card-name').textContent).toBe('Inline Ines');
      await waitFor(async () => (await window.SlopData.store.list('customers')).value.some((c) => c.name === 'Inline Ines'), { timeout: 8000 });
    });

    it('Escape discards an empty new row, and nothing is created', async () => {
      await CT.resetCustomers();
      const win = await boot();
      $(win, '#btnNew').click();
      await waitFor(() => $(win, '#rows .row-new-input'));
      key(win, $(win, '#rows .row-new-input'), 'Escape');
      await waitFor(() => !$(win, '#rows .row-new-input'));
      expect($$(win, '#rows .row').length).toBe(0);
      expect((await window.SlopData.store.list('customers')).value.length).toBe(0);
    });
  });

  describe('the card View / Edit switch', () => {
    it('a click on the card text does not edit; the Edit switch shows the inputs; Escape leaves edit mode', async () => {
      await CT.resetCustomers();
      await CT.seed([{ name: 'Switch Sam', id: 'sw-1', company: 'Sam Co' }]);
      const win = await boot();
      rowFor(win, 'Switch Sam').click();
      await waitFor(() => $(win, '#cardBody .card-name'));
      expect(switchBtn(win, 'view').getAttribute('aria-pressed')).toBe('true');
      $(win, '#cardBody .card-name').click();
      await sleep(60);
      expect($(win, '.ed-form')).toBeFalsy(); // View is read-only
      switchBtn(win, 'edit').click();
      await waitFor(() => $(win, '.ed-form input[aria-label="Name"]'));
      await sleep(80); // the form focuses its first field a moment after it is drawn
      expect(win.document.activeElement).toBe($(win, '.ed-form input[aria-label="Name"]'));
      key(win, win.document.activeElement, 'Escape');
      await waitFor(() => !$(win, '.ed-form'), { timeout: 3000 });
      expect($(win, '#cardBody .card-name').textContent).toBe('Switch Sam');
      expect(switchBtn(win, 'view').getAttribute('aria-pressed')).toBe('true');
    });

    it('the chosen mode is kept for the next contact opened from the list', async () => {
      await CT.resetCustomers();
      await CT.seed([{ name: 'Keep Ann', id: 'kp-1' }, { name: 'Keep Bo', id: 'kp-2' }]);
      const win = await boot();
      rowFor(win, 'Keep Ann').click();
      await waitFor(() => switchBtn(win, 'edit'));
      switchBtn(win, 'edit').click();
      await waitFor(() => $(win, '.ed-form'));
      rowFor(win, 'Keep Bo').click();
      await waitFor(() => $(win, '.ed-form input[aria-label="Name"]'));
      expect($(win, '.ed-form input[aria-label="Name"]').value).toBe('Keep Bo');
      switchBtn(win, 'view').click(); // View leaves edit mode (no changes, so no question)
      await waitFor(() => !$(win, '.ed-form'), { timeout: 3000 });
      expect(win.localStorage.getItem('slop-contacts.mode')).toBe('view');
    });
  });
})();
