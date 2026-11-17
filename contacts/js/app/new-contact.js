/* Slop Contacts: New contact, in the list. A row with a focused name field appears at the top of the sidebar; it is not
 * in the list until it is created (S.draft). Enter, or leaving the field with a name, creates the contact and opens it
 * in the card. Escape, or leaving the field empty, discards it. list.js draws the row (rowHtml) and wires it (bind).
 * Adds SlopContacts.newContact. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const INPUT = '.row-new-input';

  /** The draft row, or nothing when no contact is being added. */
  function rowHtml() {
    if (!S.draft) return '';
    return `<ul class="rows rows-new" role="list"><li class="row-new" role="listitem">`
      + `<input type="text" class="row-new-input" maxlength="200" autocomplete="off" placeholder="${SC.text.html(SC.tr('contacts.new.ph'))}" aria-label="${SC.text.html(SC.tr('contacts.new.aria'))}"></li></ul>`;
  }

  /** Whether the draft's name field has the focus (read before the list is redrawn). */
  const hasFocus = () => !!(document.activeElement && document.activeElement.classList.contains('row-new-input'));

  /** Ends the draft: creates the contact (when it has a name and save is true), or discards it. */
  function finish(save) {
    const d = S.draft;
    if (!d) return;
    S.draft = null;
    const name = d.fn.trim();
    if (save && name) {
      const c = SC.model.normalise({ id: d.id, fn: name, stage: 'lead' });
      S.setList([...S.list, c]);
      S.open = c.id;
    }
    S.emit('render');
  }

  /** Wires the draft row after the list is drawn. The field keeps the focus when it had it. */
  function bind(rows, refocus) {
    const input = rows.querySelector(INPUT);
    const d = S.draft;
    if (!input || !d) return;
    input.value = d.fn;
    input.addEventListener('input', () => { d.fn = input.value; });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    // Deferred: a redraw removes the field, which must not end the draft.
    input.addEventListener('blur', () => setTimeout(() => { if (input.isConnected && S.draft === d) finish(true); }, 0));
    if (refocus) input.focus();
  }

  /** Starts a new contact at the top of the list (Cards view), with the name field focused. */
  function open() {
    if (!S.draft) {
      if (S.view === 'table') SC.layout.setView('cards');
      S.draft = { id: SC.records.newId(), fn: '' };
      S.emit('render');
    }
    const input = document.querySelector(`#rows ${INPUT}`);
    if (input) input.focus();
  }

  SC.newContact = { open, rowHtml, bind, hasFocus };
})();
