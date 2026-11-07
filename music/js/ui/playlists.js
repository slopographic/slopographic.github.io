/* Slop Music: the Playlists view. Create, rename, delete; add tracks from the library; drag the handle to
 * reorder (pointer events, so it works by touch too); play; save as a .splaylist file to Slop Drive or open one.
 * Exposes window.SlopMusic.plUI = { bind, render, create, rename, remove, addTracks, selected, select }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const UI = () => window.SlopUI, el = (...a) => UI().el(...a), H = () => window.SlopHub;
  const $ = (id) => document.getElementById(id);
  const T = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const S = { sel: null };
  const byId = (id) => M.lib.track(id);
  function renderList() {
    const all = M.playlists.all();
    if (S.sel && !M.playlists.get(S.sel)) S.sel = null;
    $('pl-list').replaceChildren(...all.map((p) => el('li', null, el('button', { type: 'button', class: 'mu-pl-btn', 'aria-current': p.id === S.sel ? 'true' : 'false',
      onclick: () => { S.sel = p.id; render(); } }, el('b', null, p.name), el('small', null, T('music.pl.tracks_n', { n: p.trackIds.length }))))));
    $('pl-empty').hidden = all.length > 0;
  }
  function playlistIds(p) { return p.trackIds.filter((id) => byId(id)); }
  function item(p, id, i) {
    const t = byId(id);
    const handle = el('button', { type: 'button', class: 'mu-handle', 'aria-label': T('music.pl.drag_label'), title: T('music.pl.drag'),
      onkeydown: (e) => keyMove(e, p, i) });
    handle.addEventListener('pointerdown', (e) => startDrag(e, p, i));
    return el('li', { class: 'mu-pl-item', 'data-i': i }, handle,
      el('button', { type: 'button', class: 'mu-row-main', onclick: () => M.engine.setQueue(playlistIds(p), id) },
        t ? M.fmt.tile(t, 'mu-cover-sm') : el('span', { class: 'mu-cover-sm mu-tile' }, '?'),
        el('span', { class: 'mu-txt' }, el('b', null, t ? M.lib.display(t) : T('music.pl.not_in_drive')), el('small', null, t ? [t.artist, t.album].filter(Boolean).join(' · ') : id))),
      el('button', { type: 'button', class: 'mu-more', 'aria-label': T('music.pl.remove_from'), title: T('ui.remove'),
        onclick: () => M.playlists.setTracks(p.id, p.trackIds.filter((x) => x !== id)) }, '×'));
  }
  function keyMove(e, p, i) {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (!e.altKey || to < 0 || to >= p.trackIds.length) return;
    e.preventDefault();
    M.playlists.setTracks(p.id, moved(p.trackIds, i, to));
  }
  const moved = (arr, from, to) => { const a = arr.slice(), [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };
  /** Pointer drag: the target is the row the pointer is over when released. The handle has touch-action: none and is
   *  44 px wide for a finger (music/css/music.css). */
  function startDrag(e, p, from) {
    e.preventDefault();
    const list = $('pl-items'), handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ }
    const rowsEls = () => [...list.querySelectorAll('.mu-pl-item')];
    let to = from;
    const mark = (ev) => {
      const rs = rowsEls();
      to = rs.length - 1;
      for (let i = 0; i < rs.length; i++) { const r = rs[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { to = i; break; } }
      rs.forEach((r, i) => r.classList.toggle('mu-drop', i === to && to !== from));
    };
    const move = (ev) => { mark(ev); };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      const target = to > from ? to - 1 : to;
      if (target !== from) M.playlists.setTracks(p.id, moved(p.trackIds, from, target));
      else rowsEls().forEach((r) => r.classList.remove('mu-drop'));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    handle.closest('.mu-pl-item').classList.add('mu-dragging');
  }
  function renderDetail() {
    const box = $('pl-detail'), p = S.sel && M.playlists.get(S.sel);
    if (!p) { box.replaceChildren(el('p', { class: 'mu-fine' }, T('music.pl.choose'))); return; }
    const ids = p.trackIds;
    box.replaceChildren(
      el('div', { class: 'mu-pl-head' }, el('h2', null, p.name), el('p', { class: 'mu-fine' }, T('music.pl.tracks_n', { n: ids.length }))),
      el('div', { class: 'mu-pl-tools' },
        el('button', { type: 'button', class: 'sui-btn sui-primary', disabled: !ids.length, onclick: () => M.engine.setQueue(playlistIds(p), playlistIds(p)[0]) }, T('music.pl.play')),
        el('button', { type: 'button', class: 'sui-btn', onclick: () => addTracks(p) }, T('music.pl.add_tracks')),
        el('button', { type: 'button', class: 'sui-btn', onclick: () => rename(p) }, T('ui.rename')),
        el('button', { type: 'button', class: 'sui-btn', onclick: () => saveToDrive(p) }, T('music.pl.save_drive')),
        el('button', { type: 'button', class: 'sui-btn sui-danger', onclick: () => remove(p) }, T('ui.delete'))),
      ids.length ? el('ol', { class: 'mu-list mu-pl-items', id: 'pl-items', 'aria-label': T('music.pl.in_order') }, ids.map((id, i) => item(p, id, i)))
        : el('p', { class: 'mu-fine' }, T('music.pl.empty')));
  }
  function render() { renderList(); renderDetail(); }
  async function create() {
    const name = await UI().prompt(T('music.dlg.new_playlist'), T('music.dlg.name'), T('music.dlg.new_playlist'), { ok: T('music.dlg.create') });
    if (name == null) return;
    const p = await M.playlists.create(name);
    S.sel = p.id;
  }
  async function rename(p) {
    const name = await UI().prompt(T('music.pl.rename_title'), T('music.dlg.name'), p.name, { ok: T('ui.rename') });
    if (name != null) await M.playlists.rename(p.id, name);
  }
  async function remove(p) {
    if (!(await UI().confirm(T('music.pl.delete_title'), T('music.pl.delete_msg', { name: p.name }), T('ui.delete'), { danger: true }))) return;
    if (S.sel === p.id) S.sel = null;
    await M.playlists.remove(p.id);
  }
  /** A checklist of library tracks; the ones already in the playlist are ticked and kept. */
  function addTracks(p) {
    const tracks = M.lib.list().sort((a, b) => M.lib.display(a).localeCompare(M.lib.display(b), undefined, { numeric: true, sensitivity: 'base' }));
    const boxes = tracks.map((t) => {
      const c = el('input', { type: 'checkbox', value: t.id, checked: p.trackIds.includes(t.id) });
      return el('label', { class: 'sui-check mu-pick' }, c, el('span', null, M.lib.display(t) + (t.artist ? ' · ' + t.artist : '')));
    });
    const body = el('div', { class: 'mu-pick-list' }, boxes.length ? boxes : el('p', { class: 'sui-p' }, T('music.pl.lib_empty')));
    let chosen = null;
    UI().dialog({ title: T('music.pl.add_to_title', { name: p.name }), cls: 'sui-wide', body,
      buttons: [{ label: T('menu.cancel') }, { label: T('ui.done'), primary: true, act: () => { chosen = boxes.map((l) => l.querySelector('input')).filter((c) => c.checked).map((c) => c.value); } }],
      onClose: async (ok) => {
        if (!ok || !chosen) return;
        await M.playlists.setTracks(p.id, [...p.trackIds.filter((id) => chosen.includes(id)), ...chosen.filter((id) => !p.trackIds.includes(id))]);
      } });
  }
  async function saveToDrive(p) {
    const blob = M.plfile.build(p.name, M.plfile.rows(p));
    const id = await H().saveToDrive(blob, M.plfile.fileName(p.name), { from: 'music', title: T('music.pl.save_title', { name: p.name }) });
    if (id) UI().toast(T('music.pl.saved'));
  }
  /** Open a playlist from Slop Drive: a part of the intake of its own ('music.playlist'). */
  const openFromDrive = () => window.SlopIntake.fromDrive({ to: 'music.playlist', title: T('music.pl.open_title') });
  function bind() {
    window.SlopIntake.register({
      id: 'music.playlist', main: false, paste: false, toast: false, driveAccept: [M.plfile.MIME],
      accept: { types: [M.plfile.MIME, 'application/json'], exts: [M.plfile.EXT], noun: 'music.pl.noun' },
      process: async (file) => {
        try {
          const parsed = M.plfile.parse(await file.text());
          const p = await M.playlists.create(parsed.name, parsed.trackIds);
          S.sel = p.id;
          UI().toast(T('music.pl.opened'));
          return p.id;
        } catch (e) { UI().alert(T('music.pl.open_failed'), T('music.pl.not_playlist')); throw e; }
      },
    });
    $('pl-new').addEventListener('click', create);
    $('pl-open').addEventListener('click', openFromDrive);
    M.playlists.subscribe(render);
    M.lib.subscribe(() => renderDetail());
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(render);   // the list and the open playlist, in the new language
  }
  /** The playlist open in the Playlists view, or null. */
  const selected = () => (S.sel ? M.playlists.get(S.sel) : null);
  M.plUI = { bind, render, create, rename, remove, addTracks, saveToDrive, selected, select: (id) => { S.sel = id; render(); } };
})();
