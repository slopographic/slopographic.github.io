/* Slop EML: the message list (the list region of the SlopFrame layout), shown when two or more messages are open. One row
 * per message: a tick box, the sender, the date, the subject and the attachment count. A search box and a sort; the box at
 * the top ticks every message shown (blank-ticked when some are). Click opens a row; shift-click on a tick box ticks the
 * range from the last one. Keys in the list: Up and Down (Home, End) move and open, Shift with them ticks as it goes,
 * Space ticks, Enter opens (on a phone it shows the message), Ctrl+A ticks all. Classic script; exposes window.EmlList.
 * Draws once per frame (a batch of hundreds opens without redrawing each time); flush() draws now. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = () => window.EmlApp, B = () => window.EmlBatch;
  const L = (window.EmlList = {});
  let queued = false, anchor = null, onOpen = null;
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const SORTS = () => [['date:desc', t('eml.list.newest')], ['date:asc', t('eml.list.oldest')], ['from:asc', t('eml.list.from_az')], ['from:desc', t('eml.list.from_za')],
    ['subject:asc', t('eml.list.subject_az')], ['subject:desc', t('eml.list.subject_za')]];
  const CLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9"/></svg>';

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function when(ts) {
    if (ts == null) return '';
    const d = new Date(ts), now = new Date();
    const o = d.toDateString() === now.toDateString() ? { hour: '2-digit', minute: '2-digit' } : d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { dateStyle: 'medium' };
    return window.SlopI18n ? window.SlopI18n.date(d, o) : d.toLocaleString(undefined, o);   // in the page's language
  }

  /** Builds the bar once and wires it. open(doc) runs when a row is opened by a click or Enter. */
  L.init = function (opts = {}) {
    onOpen = opts.open || null;
    const sort = $('em-sort');
    sortOptions();
    sort.addEventListener('change', () => { const [key, dir] = sort.value.split(':'); A().setList({ sort: key, dir }); });
    $('em-search').addEventListener('input', (e) => A().setList({ query: e.target.value }));
    $('em-check-all').addEventListener('change', (e) => A().checkAll(e.target.checked));
    const rows = $('em-rows');
    rows.addEventListener('click', onClick);
    rows.addEventListener('keydown', onKey);
  };

  /** The sort menu in the page's language (again on a language change, keeping the choice). */
  function sortOptions() {
    const sort = $('em-sort'), was = sort.value;
    sort.replaceChildren(...SORTS().map(([v, l]) => { const o = el('option', null, l); o.value = v; return o; }));
    if (was) sort.value = was;
  }
  L.relang = function () { sortOptions(); L.render(); };

  const idOf = (n) => { const r = n && n.closest && n.closest('.em-row'); return r ? Number(r.dataset.id) : null; };
  const ids = () => A().visible().map((d) => d.id);
  function open(id, show) { A().select(id); if (onOpen) onOpen(A().find(id), show); }

  function onClick(e) {
    const id = idOf(e.target);
    if (id == null) return;
    if (e.target.classList.contains('em-row-check')) {
      const on = e.target.checked;
      if (e.shiftKey && anchor != null) A().checkMany(B().range(ids(), anchor, id), on);
      else A().check(id, on);
      anchor = id;
      return;
    }
    if (e.target.closest('.em-row-open')) open(id, true);
  }

  function focusRow(id) {
    const b = document.querySelector('.em-row[data-id="' + id + '"] .em-row-open');
    if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
  }
  function onKey(e) {
    const id = idOf(e.target);
    if (id == null) return;
    const list = ids(), i = list.indexOf(id);
    let to = null;
    if (e.key === 'ArrowDown') to = list[Math.min(list.length - 1, i + 1)];
    else if (e.key === 'ArrowUp') to = list[Math.max(0, i - 1)];
    else if (e.key === 'Home') to = list[0];
    else if (e.key === 'End') to = list[list.length - 1];
    else if (e.key === ' ' && e.target.classList.contains('em-row-open')) { e.preventDefault(); A().check(id, !A().isChecked(id)); anchor = id; return; }
    else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); A().checkAll(true); return; }
    else return;
    e.preventDefault();
    if (to == null) return;
    if (e.shiftKey) { A().checkMany(B().range(list, anchor != null ? anchor : id, to), true); if (anchor == null) anchor = id; }
    open(to, false);
    L.flush();
    focusRow(to);
  }

  function row(d, cur) {
    const li = el('li', 'em-row' + (cur ? ' em-on' : '') + (A().isChecked(d.id) ? ' em-checked' : ''));
    li.dataset.id = String(d.id);
    const s = d.summary, subject = s.subject || t('eml.list.no_subject');
    const box = el('input', 'em-row-check');
    box.type = 'checkbox';
    box.checked = A().isChecked(d.id);
    box.setAttribute('aria-label', t('eml.list.select', { subject }));
    const b = el('button', 'em-row-open');
    b.type = 'button';
    b.tabIndex = cur ? 0 : -1;
    if (cur) b.setAttribute('aria-current', 'true');
    const top = el('span', 'em-row-top');
    top.append(el('span', 'em-row-from', B().person(s.from) || t('eml.list.no_sender')), el('span', 'em-row-date', when(d.time)));
    const bottom = el('span', 'em-row-bottom');
    bottom.append(el('span', 'em-row-subj', subject));
    const n = d.msg.attachments.filter((a) => !a.inline).length;
    if (n) {
      const c = el('span', 'em-row-att');
      c.innerHTML = CLIP;
      c.append(String(n));
      c.title = t('eml.view.n_atts', { n });
      bottom.append(c);
    }
    b.append(top, bottom);
    b.title = [s.from, s.date, subject].filter(Boolean).join('\n');
    li.append(box, b);
    return li;
  }

  function draw() {
    queued = false;
    const app = A(), all = app.docs().length, vis = app.visible(), cur = app.current(), st = app.listState();
    const rows = $('em-rows'), had = rows.contains(document.activeElement) ? idOf(document.activeElement) : null;
    const k = app.checkedDocs().length;
    $('em-sort').value = st.sort + ':' + st.dir;
    if ($('em-search').value !== st.query) $('em-search').value = st.query;
    const all_ = $('em-check-all');
    all_.checked = vis.length > 0 && k === vis.length;
    all_.indeterminate = k > 0 && k < vis.length;
    $('em-count').textContent = k ? t('eml.list.k_selected', { k: String(k), n: vis.length }) : vis.length === all ? t('eml.list.n_messages', { n: all }) : t('eml.list.k_of_n', { k: String(vis.length), n: all });
    rows.replaceChildren(...vis.map((d) => row(d, cur && cur.id === d.id)));
    if (!rows.querySelector('.em-row-open[tabindex="0"]') && rows.firstChild) rows.firstChild.querySelector('.em-row-open').tabIndex = 0;
    $('em-noresults').hidden = vis.length > 0;
    if (had != null) focusRow(had);
  }
  L.render = function () { if (!queued) { queued = true; requestAnimationFrame(draw); } };
  L.flush = function () { draw(); };
})();
