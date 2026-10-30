/* Slop Contacts form: while two phone rows and an address row are added, the form's box keeps its position and size,
 * its content width does not change (the scrollbar gutter is reserved), and Save and Cancel stay on screen and not
 * covered, at 390 and 1280 px. Also: the first field has the focus, Escape cancels, Cmd or Ctrl+Enter saves. */
(function () {
  'use strict';
  const { describe, it, expect, sleep, waitFor } = SlopTest;

  /** Boots the app in the frame at a width (the layout follows the frame's width), with a consent choice on record so the
   * consent strip, which is not part of the form and would cover the foot of a phone screen, does not show. */
  async function boot(width) {
    const fr = document.getElementById('app');
    fr.style.width = width + 'px';
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank', { timeout: 5000 });
    try { localStorage.removeItem('slop-contacts.mode'); } catch (e) { /* blocked: the app reads the mode when it loads */ }
    fr.src = '../../contacts/index.html';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.pathname.includes('contacts/index.html') && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
    let win = fr.contentWindow;
    // A consent choice on record, then a reload: the strip (and the room it keeps at the foot) never shows. Taking the
    // strip out after it showed left its padding to be undone later, which resized the form in the middle of a check.
    if (win.SlopConsentState && win.SlopConsentState.needsChoice()) {
      win.SlopConsentState.write({});
      fr.src = '../../contacts/index.html?again';
      // The frame's window object stays the same across a navigation: the new page is the one at ?again, once it is ready.
      await waitFor(() => fr.contentWindow.location.search === '?again' && fr.contentWindow.SlopContacts && fr.contentWindow.SlopContacts.ready, { timeout: 30000 });
      win = fr.contentWindow;
    }
    await sleep(300);
    win.document.querySelectorAll('.slopc-banner').forEach((n) => n.remove());
    return win;
  }
  const restore = () => { document.getElementById('app').style.width = '1280px'; };
  const $ = (win, sel) => win.document.querySelector(sel);
  const $$ = (win, sel) => [...win.document.querySelectorAll(sel)];
  const btn = (win, label) => $$(win, 'button').find((b) => b.textContent.trim() === label);
  const rowFor = (win, name) => $$(win, '#rows .row').find((r) => r.querySelector('.row-name').textContent === name);
  const stored = (id) => window.SlopData.store.get('customers', id).then((r) => r.value);
  const round = (b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
  const box = (win, sel) => { const r = $(win, sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };

  /** Adds a contact with New contact (a name in the list), then opens the full form with Edit. */
  async function newForm(win) {
    $(win, '#btnNew').click();
    await waitFor(() => $(win, '#rows .row-new-input'));
    $(win, '#rows .row-new-input').value = 'Ada Lovelace';
    $(win, '#rows .row-new-input').dispatchEvent(new win.Event('input', { bubbles: true }));
    $(win, '#rows .row-new-input').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => $(win, '[data-act="edit"]'));
    $(win, '[data-act="edit"]').click();
    await waitFor(() => $(win, '.ed-form'));
    await sleep(350);   // on a phone the card is a bottom sheet that slides up (.22 s)
  }
  /** Opens the full form of a stored contact. */
  async function editForm(win, name) {
    await waitFor(() => rowFor(win, name));
    rowFor(win, name).click();
    await waitFor(() => $(win, '[data-act="edit"]'));
    $(win, '[data-act="edit"]').click();
    await waitFor(() => $(win, '.ed-form'));
    await sleep(350);   // on a phone the card is a bottom sheet that slides up (.22 s)
  }

  /** The form's frame, its scroll body's width, and whether Save and Cancel are on screen and not covered by anything. */
  function measure(win, name) {
    const onScreen = (b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= win.innerHeight && r.right <= win.innerWidth; };
    const uncovered = (b) => { const r = b.getBoundingClientRect(); const hit = win.document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && b.contains(hit); };
    const save = $(win, '#card .sf-p-foot .btn.primary'), cancel = $(win, '#card .sf-p-foot [data-act="cancel"]');
    const body = $(win, '.ed-body');
    /** A place in the body's own coordinates, so a scroll does not count as a move. */
    const at = (e) => Math.round(e.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop);
    const addPhone = $$(win, '.ed-sub-top button').find((b) => b.textContent.trim() === '+ Add phone');
    return {
      name, form: box(win, '.ed-form'), bodyW: body.clientWidth, view: [win.innerWidth, win.innerHeight],
      nameAt: at($(win, 'input[aria-label="Name"]')), addPhoneAt: addPhone ? at(addPhone) : null,
      save: round(box(win, '#card .sf-p-foot .btn.primary')),
      saveVisible: onScreen(save) && uncovered(save), cancelVisible: onScreen(cancel) && uncovered(cancel),
    };
  }

  /** Adds two phone rows and an address row, measuring after each step. */
  async function addRows(win) {
    const steps = [measure(win, 'open')];
    btn(win, '+ Add phone').click(); await sleep(60); steps.push(measure(win, 'phone 1'));
    btn(win, '+ Add phone').click(); await sleep(60); steps.push(measure(win, 'phone 2'));
    btn(win, '+ Add address').click(); await sleep(60); steps.push(measure(win, 'address 1'));
    return steps;
  }

  /** Fails with every step where the frame moved or resized, the body width changed, a field above the rows or the
   * phone add button moved within the body, or a footer button is not in view. */
  function expectStill(steps) {
    const first = steps[0];
    const bad = [];
    if (typeof first.addPhoneAt !== 'number') bad.push('the + Add phone button was not found');
    for (const s of steps) {
      const f = round(s.form), g = round(first.form);
      if (f.x !== g.x || f.y !== g.y || f.w !== g.w || f.h !== g.h) bad.push(`${s.name}: frame ${JSON.stringify(f)} (was ${JSON.stringify(g)})`);
      if (s.bodyW !== first.bodyW) bad.push(`${s.name}: body width ${s.bodyW} (was ${first.bodyW})`);
      if (s.nameAt !== first.nameAt) bad.push(`${s.name}: Name field at ${s.nameAt} (was ${first.nameAt})`);
      if (s.addPhoneAt !== null && s.addPhoneAt !== first.addPhoneAt && s.name !== 'address 1') bad.push(`${s.name}: + Add phone at ${s.addPhoneAt} (was ${first.addPhoneAt})`);
      if (!s.saveVisible) bad.push(`${s.name}: Save not in view (${JSON.stringify(s.save)} in ${s.view})`);
      if (!s.cancelVisible) bad.push(`${s.name}: Cancel not in view`);
    }
    expect(bad).toEqual([]);
  }

  for (const width of [390, 1280]) {
    describe(`the form at ${width} px`, () => {
      it('a new contact keeps its frame while two phone rows and an address row are added', async () => {
        await CT.resetCustomers();
        const win = await boot(width);
        try {
          await newForm(win);
          const steps = await addRows(win);
          expect(steps).toHaveLength(4);
          expect($$(win, '.ed-sub .ed-row')).toHaveLength(2);
          expect($$(win, '.ed-sec .ed-row')).toHaveLength(3);
          expect($(win, '.ed-body').contains($(win, '.ed-row'))).toBeTruthy();
          expectStill(steps);
        } finally { restore(); }
      }, { timeout: 45000 });   // the first boot records the consent choice and loads the app again

      it('an existing contact keeps its frame while rows are added to it', async () => {
        await CT.resetCustomers();
        await CT.seed([{ id: `fm-${width}`, name: `Form ${width}`, phones: [{ label: 'mobile', value: '0799 111' }], company: 'Acme' }]);
        const win = await boot(width);
        try {
          await editForm(win, `Form ${width}`);
          const steps = await addRows(win);
          expectStill(steps);
        } finally { restore(); }
      });
    });
  }

  describe('the form: focus and keys', () => {
    it('the first field has the focus when the form opens', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'fk-1', name: 'Focus Fay', company: 'Co' }]);
      const win = await boot(1280);
      try {
        await editForm(win, 'Focus Fay');
        await sleep(60);
        expect(win.document.activeElement.getAttribute('aria-label')).toBe('Name');
      } finally { restore(); }
    });

    it('Escape cancels an unchanged form at once', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'fk-2', name: 'Esc Eva', company: 'Keep' }]);
      const win = await boot(1280);
      try {
        await editForm(win, 'Esc Eva');
        $(win, 'input[aria-label="Company"]').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await waitFor(() => !$(win, '.ed-form'), { timeout: 3000 });
        expect((await stored('fk-2')).company).toBe('Keep');
      } finally { restore(); }
    });

    it('Cmd+Enter in notes saves the form', async () => {
      await CT.resetCustomers();
      await CT.seed([{ id: 'fk-3', name: 'Enter Ned', company: 'Before' }]);
      const win = await boot(1280);
      try {
        await editForm(win, 'Enter Ned');
        $(win, 'input[aria-label="Company"]').value = 'After';
        $(win, 'textarea[aria-label="Notes"]').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }));
        await waitFor(async () => (await stored('fk-3')).company === 'After', { timeout: 8000 });
        expect((await stored('fk-3')).company).toBe('After');
      } finally { restore(); }
    });
  });
})();
