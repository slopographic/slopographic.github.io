/* Slop Contacts: the card column (the right-hand column on a wide screen; on a narrow one a bottom sheet over the list,
 * SlopSheet: its ×, Escape, a tap outside or a swipe down closes the contact). Chooses the view for the state: the empty card, the selection count, the read card (card-read.js),
 * or the form (card-edit.js). The read card is drawn again only when the contact or the view changes, so typing
 * in it is not lost to an unrelated redraw. Adds SlopContacts.card. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const D = window.SlopData;
  let key = '', json = '', fp = null, sheet = null;
  const tr = (k, v) => SC.tr(k, v);

  /** The card's footer (the suite rule, shared/frame/HANDOFF.md: the main button at the foot of the right-hand panel; the
   *  shared footer, shared/frame/panel.js): Edit, Duplicate and Delete on a contact, Cancel and Save in the form. */
  function foot(list) {
    if (!fp && window.SlopFramePanel) fp = window.SlopFramePanel.create(document.getElementById('card'), { bare: true });
    if (fp) fp.footer(list.map((b) => ({ el: b })));
  }
  function btn(label, act, cls, run) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.dataset.act = act; b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }
  function readFoot(c) {
    foot([btn(tr('contacts.card.edit'), 'editFoot', 'btn primary', () => { S.mode = 'edit'; S.emit('render'); }),   // i18n-ignore: class names
      btn(tr('contacts.card.dup'), 'dup', 'btn', () => SC.cardRead.duplicate(c)),
      btn(tr('ui.delete'), 'del', 'btn danger', () => SC.select.remove(new Set([c.id])))]);   // i18n-ignore: class names
  }

  function empty(text) {
    const body = document.getElementById('cardBody');
    body.innerHTML = `<div class="card-empty"><p class="card-empty-h">${SC.text.html(text)}</p></div>`;
    key = ''; json = '';
    foot([]);
  }

  /** Draws the card for the current state. */
  function render() {
    document.body.classList.toggle('card-open', !!S.open);
    if (sheet) { if (S.open) sheet.open(); else sheet.close(); }
    const c = S.open ? S.byId(S.open) : null;
    if (!c) {
      key = ''; json = '';
      if (S.sel.size > 1) empty(tr('contacts.card.n_selected', { n: S.sel.size }));
      else empty(tr(S.list.length ? 'contacts.card.none_sel' : 'contacts.card.none'));
      return;
    }
    if (S.mode === 'edit') {
      if (key !== `edit:${c.id}`) { key = `edit:${c.id}`; SC.cardEdit.render(c); foot(SC.cardEdit.buttons); }
      return;
    }
    const j = JSON.stringify(c);
    if (key === `view:${c.id}` && j === json) return;
    key = `view:${c.id}`; json = j;
    SC.cardRead.render(c);
    readFoot(c);
  }

  /** The View / Edit switch on the card (shown in both modes). The chosen mode is remembered per device (state.js). */
  function modeSwitch(mode) {
    const t = document.createElement('template');
    const b = (m, label) => `<button type="button" class="mode-btn${mode === m ? ' on' : ''}" data-act="${m}" aria-pressed="${mode === m}">${label}</button>`;
    t.innerHTML = `<div class="mode-switch" role="group" aria-label="${tr('contacts.card.mode')}">${b('view', tr('contacts.card.view'))}${b('edit', tr('contacts.card.edit'))}</div>`;
    return t.content.firstElementChild;
  }

  /** The switch: View leaves edit mode (asks first when there are unsaved changes); Edit opens the form. */
  function onSwitch(e) {
    const b = e.target.closest && e.target.closest('.mode-switch [data-act]');
    if (!b || !S.open) return;
    if (b.dataset.act === 'edit') { S.mode = 'edit'; S.emit('render'); }
    else if (S.mode === 'edit') SC.cardEdit.cancel();
  }

  /** On a phone the card is a bottom sheet (shared/ui/sheet.js). Closing it closes the contact; with the form open it
   *  leaves the form the way Escape and Cancel do (asking first about unsaved changes) and the card stays. A window that
   *  becomes a phone's with a contact open shows it in the sheet. */
  function mountSheet() {
    if (!window.SlopSheet) return;
    const card = document.getElementById('card'), PHONE = '(max-width: 959px)';
    sheet = window.SlopSheet.attach({ root: document.getElementById('shell'), panel: card, side: 'bottom', phone: PHONE, label: tr('contacts.card.label'),
      onChange: (open, why) => {
        if (open || why === 'api' || why === 'wide' || why === 'destroy' || !S.open) return;
        if (S.mode === 'edit') { sheet.open(); SC.cardEdit.cancel(); return; }
        S.open = null; S.emit('render');
      } });
    const mq = window.matchMedia(PHONE);
    mq.addEventListener('change', () => { if (mq.matches && S.open) sheet.open(); });
  }

  function mount() {
    mountSheet();
    S.on('render', render);
    S.on('change', render);
    document.getElementById('cardBody').addEventListener('click', onSwitch);
    D.store.subscribe(() => { if (!SC.records.pending()) SC.cardRead.refreshHistory(); });
  }

  /** Draws the card again from scratch (a language change). */
  function redraw() { key = ''; json = ''; render(); }
  SC.card = { mount, render, redraw, modeSwitch };
})();
