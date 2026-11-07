/* Slop Contacts: the layout. A draggable splitter sits between the list and the card; its width (the list's) is kept in
 * localStorage in a try/catch, so a blocked store only loses the saved width. Arrow keys move the splitter, a double
 * click resets it. The view switch: Cards (the list and the card) or Table (the table takes the card's place and the
 * splitter hides). Below 960 px the splitter is hidden and the columns stack. Adds SlopContacts.layout. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const $ = (id) => document.getElementById(id);
  const KEY = 'slop-contacts.list-width';
  const DEFAULT = 380, MIN = 260, CARD_MIN = 420, GROUPS = 210, BAR = 6, STEP = 16;
  const wide = () => window.matchMedia('(min-width: 960px)').matches;

  function savedWidth() {
    try { const n = parseInt(localStorage.getItem(KEY), 10); return n > 0 ? n : null; } catch (e) { return null; }
  }
  function saveWidth(n) {
    try { localStorage.setItem(KEY, String(n)); } catch (e) { /* storage blocked: the width lasts for this visit */ }
  }
  /** The list width, kept between MIN and the room left beside the groups and a card of CARD_MIN. */
  function clampW(px) {
    const shell = $('shell'), total = shell && shell.clientWidth ? shell.clientWidth : 1280;
    const max = Math.max(MIN, total - GROUPS - BAR - CARD_MIN);
    return Math.min(max, Math.max(MIN, Math.round(px)));
  }
  function setWidth(px, save) {
    const w = clampW(px);
    $('shell').style.setProperty('--list-w', w + 'px');
    $('splitter').setAttribute('aria-valuenow', String(w));
    if (save) saveWidth(w);
    return w;
  }
  const listWidth = () => document.querySelector('.col-list').getBoundingClientRect().width;

  // The splitter has touch-action: none (contacts/css/contacts-panel.css) and data-touch-hit: a 44 px hit area for a finger.
  function mountSplitter() {
    const sp = $('splitter');
    const start = savedWidth();
    if (start) setWidth(start, false);
    sp.setAttribute('aria-valuemin', String(MIN));
    sp.addEventListener('pointerdown', (e) => {
      if (!wide() || e.button !== 0) return;
      e.preventDefault();
      try { sp.setPointerCapture(e.pointerId); } catch (err) { /* no active pointer: the drag still works on the page */ }
      const x0 = e.clientX, w0 = listWidth();
      sp.classList.add('on');
      const move = (ev) => setWidth(w0 + ev.clientX - x0, false);
      const up = (ev) => {
        sp.removeEventListener('pointermove', move);
        sp.removeEventListener('pointerup', up);
        sp.removeEventListener('pointercancel', up);
        sp.classList.remove('on');
        setWidth(w0 + ev.clientX - x0, true);
      };
      sp.addEventListener('pointermove', move);
      sp.addEventListener('pointerup', up);
      sp.addEventListener('pointercancel', up);
    });
    sp.addEventListener('dblclick', () => setWidth(DEFAULT, true));
    sp.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setWidth(listWidth() + (e.key === 'ArrowRight' ? STEP : -STEP), true);
    });
  }

  /** Cards or Table. The view is part of the place (url-place.js). */
  function setView(v) {
    S.view = v === 'table' ? 'table' : 'cards';
    S.emit('render');
  }
  function syncView() {
    const table = S.view === 'table';
    document.body.classList.toggle('table-mode', table);
    for (const b of document.querySelectorAll('[data-view]')) {
      const on = b.dataset.view === (table ? 'table' : 'cards');
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('on', on);
    }
  }

  function mount() {
    mountSplitter();
    for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => setView(b.dataset.view));
    S.on('render', syncView);
    syncView();
  }

  SC.layout = { mount, setView, setWidth, clampW, DEFAULT, MIN };
})();
