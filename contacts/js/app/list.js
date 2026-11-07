/* Slop Contacts: the middle column. The alphabetical list under letter headers (A to Z, then #), each row with an
 * avatar, the name and one line of company or stage. Recent is one flat list. Clicks, keys and drags are in select.js.
 * Renders from SlopContacts.state. Adds SlopContacts.list. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SC.text.html(s);   // the one HTML escape (core/text.js)
  const tr = (k, v) => SC.tr(k, v);

  /** The heading letter of a name: its first letter without accents, or # for anything else. */
  function letterOf(name) {
    const ch = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(ch) ? ch : '#';
  }
  /** The visible contacts in letter sections, in A to Z order with # last. */
  function sectionsOf(list) {
    const map = new Map();
    for (const c of list) { const k = letterOf(c.fn); if (!map.has(k)) map.set(k, []); map.get(k).push(c); }
    return [...map.entries()].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a < b ? -1 : a > b ? 1 : 0));
  }
  /** One row. The second line is the company, or the stage when there is no company. */
  function rowHtml(c) {
    const on = S.sel.has(c.id);
    const cls = ['row', on && 'is-sel', S.open === c.id && 'is-open', S.focus === c.id && 'is-focus'].filter(Boolean).join(' ');
    const sub = c.org || SC.stageLabel(c.stage);
    const check = S.selectMode ? `<span class="row-check${on ? ' on' : ''}" aria-hidden="true">${on ? '✓' : ''}</span>` : '';
    return `<li class="${cls}" role="listitem" data-id="${esc(c.id)}" draggable="true" aria-selected="${on}"${S.open === c.id ? ' aria-current="true"' : ''}>`
      + `${check}${SC.photoUi.avatarHtml(c)}<span class="row-text"><span class="row-name">${esc(c.fn)}</span>`
      + `<span class="row-sub">${esc(sub)}</span></span></li>`;
  }

  /** The title of the open group. */
  function titleOf(g) {
    if (!g) return tr('contacts.page.all');
    if (g === 'recent') return tr('contacts.list.recent');
    if (g.startsWith('cat:')) return g.slice(4);
    return SC.stageLabel(g.slice(6));
  }

  function render() {
    const list = S.visible();
    const n = list.length, total = S.list.length;
    $('listTitle').textContent = titleOf(S.group);
    $('listCount').textContent = S.query.trim() || S.group ? tr('contacts.list.of', { n, total }) : tr('contacts.list.count', { n: total });
    $('btnSelect').setAttribute('aria-pressed', String(S.selectMode));
    $('btnSelect').classList.toggle('on', S.selectMode);
    const flat = S.group === 'recent';
    const draft = !!S.draft;
    const refocus = SC.newContact.hasFocus();
    const html = SC.newContact.rowHtml() + (flat
      ? `<ul class="rows" role="list" aria-label="${esc(tr('contacts.list.recent'))}">${list.map(rowHtml).join('')}</ul>`
      : sectionsOf(list).map(([k, items]) => `<section class="letter-sec" aria-labelledby="letter-${k === '#' ? 'hash' : k}">`
        + `<h2 class="letter" id="letter-${k === '#' ? 'hash' : k}">${k}</h2><ul class="rows" role="list">${items.map(rowHtml).join('')}</ul></section>`).join(''));
    $('rows').innerHTML = html;
    SC.newContact.bind($('rows'), refocus);
    $('rows').hidden = !draft && (!total || !n);
    $('empty').hidden = !!total || draft;
    $('noMatch').hidden = !total || !!n;
    $('noMatch').textContent = S.group && !S.query.trim() ? tr('contacts.list.none_in', { name: titleOf(S.group) }) : tr('contacts.list.no_match');
  }

  function mount() {
    $('search').addEventListener('input', (e) => { S.query = e.target.value; S.emit('render'); });
    $('btnSelect').addEventListener('click', () => { S.selectMode = !S.selectMode; S.emit('render'); });
    S.on('render', render);
    S.on('change', render);
  }

  SC.list = { mount, render, sectionsOf, letterOf, rowHtml, titleOf };
})();
