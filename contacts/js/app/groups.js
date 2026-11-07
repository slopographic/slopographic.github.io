/* Slop Contacts: the left column. Library (All Contacts, Recent), Groups (the categories, with counts; a contact
 * dragged onto one moves there, or copies with Alt or Ctrl), and Pipeline (the CRM stages, with counts). On a narrow screen the column is a sheet
 * opened from the list. Renders from SlopContacts.state. Adds SlopContacts.groups. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => SC.text.html(s);   // the one HTML escape (core/text.js)
  const tr = (k, v) => SC.tr(k, v);

  /** One button of the group list. key is the group key (empty for All). */
  function item(key, label, count, extra = '') {
    const on = (S.group || '') === key;
    return `<li><button type="button" class="grp${on ? ' on' : ''}${extra}" data-group="${esc(key)}"${on ? ' aria-current="true"' : ''}>`
      + `<span class="grp-name">${esc(label)}</span><span class="grp-n">${count}</span></button></li>`;
  }

  function render() {
    const c = S.groupCounts();
    const cats = c.cats.map(([name, n]) => item(`cat:${name}`, name, n, ' is-drop')).join('');
    $('groups').innerHTML = `<div class="grp-sec"><h2 class="grp-h">${esc(tr('contacts.grp.library'))}</h2><ul class="grp-list">`
      + item('', tr('contacts.page.all'), c.all) + item('recent', tr('contacts.list.recent'), c.recent) + `</ul></div>`
      + `<div class="grp-sec"><h2 class="grp-h">${esc(tr('contacts.grp.groups'))}</h2><ul class="grp-list">${cats || `<li class="grp-empty">${esc(tr('contacts.grp.none'))}</li>`}</ul></div>`
      + `<div class="grp-sec"><h2 class="grp-h">${esc(tr('contacts.grp.pipeline'))}</h2><ul class="grp-list">${S.STAGES.map((s) => item(`stage:${s}`, SC.stageLabel(s), c.stages[s] || 0)).join('')}</ul></div>`;
  }

  /** Shows or hides the sheet (narrow screens only; wide screens always show the column). */
  function sheet(open) { document.body.classList.toggle('groups-open', !!open); $('btnGroups').setAttribute('aria-expanded', String(!!open)); }

  /** Alt or Ctrl held copies; otherwise the contacts move: they leave the group that is open (when it is a group) and
   *  join the target. Dropped from All, Recent or a pipeline stage, they are added. */
  const copying = (e) => !!(e.altKey || e.ctrlKey);
  function drop(e, name) {
    const raw = e.dataTransfer && e.dataTransfer.getData(SC.select.MIME);
    if (!raw) return;
    let ids = [];
    try { ids = JSON.parse(raw); } catch (err) { return; }
    const set = new Set(ids), from = S.group && S.group.startsWith('cat:') ? S.group.slice(4) : null;
    let r = SC.bulk.addGroup(S.list, set, name), moved = 0;
    if (!copying(e) && from && from !== name) {
      const out = SC.bulk.removeGroup(r.list, set, from);
      r = { list: out.list, changed: r.changed };
      moved = out.changed;
    }
    if (r.changed || moved) S.setList(r.list);
    UI.toast(tr(moved ? 'contacts.grp.moved' : 'contacts.grp.added', { n: String(r.changed), name }));
  }

  function mount() {
    const box = $('groups');
    box.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.grp');
      if (!b) return;
      S.group = b.dataset.group || null;
      S.query = ''; $('search').value = '';
      sheet(false);
      S.emit('render');
    });
    box.addEventListener('dragover', (e) => {
      const b = e.target.closest && e.target.closest('.is-drop');
      if (!b || !e.dataTransfer || !e.dataTransfer.types.includes(SC.select.MIME)) return;
      e.preventDefault(); e.dataTransfer.dropEffect = copying(e) ? 'copy' : 'move';
      b.classList.add('drop-on');
    });
    box.addEventListener('dragleave', (e) => { const b = e.target.closest && e.target.closest('.drop-on'); if (b) b.classList.remove('drop-on'); });
    box.addEventListener('drop', (e) => { // intake-ok: contacts dragged onto a group, not files
      const b = e.target.closest && e.target.closest('.is-drop');
      if (!b) return;
      e.preventDefault(); b.classList.remove('drop-on');
      drop(e, b.dataset.group.slice(4));
    });
    $('btnGroups').addEventListener('click', () => sheet(!document.body.classList.contains('groups-open')));
    $('scrim').addEventListener('click', () => sheet(false));
    S.on('render', render);
    S.on('change', render);
  }

  SC.groups = { mount, render, sheet };
})();
