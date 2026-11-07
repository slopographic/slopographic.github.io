/* Slop Music: the library list. Search, sort (artist, album, title), a Tags sidebar that filters with counts,
 * drop or pick files to add, and a row menu (play, tags, playlists). Exposes window.SlopMusic.libUI. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const UI = () => window.SlopUI, el = (...a) => UI().el(...a);
  const S = { q: '', sort: 'artist', tag: '' };
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  let rows, stat, side, empty, scheduled = false;
  const cmp = (x, y) => String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  const dash = (a, b) => (a ? 0 : 1) - (b ? 0 : 1);
  const trk = (a, b) => (a.track || 1e9) - (b.track || 1e9);   // album order: numbered tracks first, in number order
  function sortTracks(list, by) {
    const T = (track) => M.lib.display(track);
    return list.slice().sort((a, b) => {
      if (by === 'artist') return dash(a.artist, b.artist) || cmp(a.artist || '', b.artist || '') || dash(a.album, b.album) || cmp(a.album || '', b.album || '') || trk(a, b) || cmp(T(a), T(b));
      if (by === 'album') return dash(a.album, b.album) || cmp(a.album || '', b.album || '') || trk(a, b) || cmp(T(a), T(b));
      return cmp(T(a), T(b)) || cmp(a.artist || '', b.artist || '');
    });
  }
  /** The tracks the list shows: search and tag filter, then sort. */
  function visible() {
    const q = S.q.trim().toLowerCase();
    const list = M.lib.list().filter((track) => (!S.tag || track.tags.includes(S.tag)) &&
      (!q || [track.title, track.name, track.artist, track.album].join(' ').toLowerCase().includes(q)));
    return sortTracks(list, S.sort);
  }
  const curId = () => (M.engine ? M.engine.state().trackId : null);

  function playRow(tr) { M.engine.setQueue(visible().map((x) => x.id), tr.id); }
  function menuFor(tr, x, y) {
    const pls = M.playlists.all();
    const items = [
      { label: t('music.menu.play'), act: () => playRow(tr) },
      { label: t('music.menu.tags'), act: () => editTags(tr) },
      ...tr.tags.map((tag) => ({ label: t('music.menu.remove_tag', { tag }), act: () => M.lib.setTags(tr.id, tr.tags.filter((x) => x !== tag)) })),
      '-',
      { label: t('music.menu.new_playlist_with'), act: () => newPlaylistWith(tr) },
      ...pls.map((p) => ({ label: t('music.menu.add_to', { name: p.name }), act: async () => { const n = await M.playlists.addTracks(p.id, [tr.id]); UI().toast(n ? t('music.toast.added_to', { name: p.name }) : t('music.toast.already')); } })),
    ];
    UI().menu(items, x, y);
  }
  async function editTags(tr) {
    const v = await UI().prompt(t('music.dlg.tags_title'), t('music.dlg.tags_label'), tr.tags.join(', '), { ok: t('menu.save') });
    if (v == null) return;
    const tags = window.SlopTags.parse(v);
    await M.lib.setTags(tr.id, tags);
    UI().toast(tags.length ? t('music.toast.tags_saved') : t('music.toast.tags_removed'));
  }
  async function newPlaylistWith(tr) {
    const name = await UI().prompt(t('music.dlg.new_playlist'), t('music.dlg.name'), t('music.dlg.new_playlist'), { ok: t('music.dlg.create') });
    if (name == null) return;
    await M.playlists.create(name, [tr.id]);
    UI().toast(t('music.toast.playlist_created'));
  }
  function row(tr) {
    const sub = [tr.artist, tr.album].filter(Boolean).join(' · ') || tr.name;
    const main = el('button', { type: 'button', class: 'mu-row-main', 'aria-label': t('music.lib.play_name', { name: M.lib.display(tr) }), onclick: () => playRow(tr) },
      M.fmt.tile(tr), el('span', { class: 'mu-txt' }, el('b', null, M.lib.display(tr)), el('small', null, sub),
        tr.tags.length ? el('span', { class: 'mu-tagline' }, tr.tags.map((g) => el('span', { class: 'mu-chip' }, g))) : null),
      el('span', { class: 'mu-dur' }, M.fmt.time(tr.duration)));
    const more = el('button', { type: 'button', class: 'mu-more', title: t('ui.more'), 'aria-label': t('music.lib.more_for', { name: M.lib.display(tr) }),
      onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); menuFor(tr, r.left, r.bottom + 4); } });
    // the stored analysis error is English text (core/analyze.js): the one it can be is shown in the current language
    const li = el('li', { class: 'mu-row' + (tr.id === curId() ? ' on' : ''), 'data-id': tr.id, title: tr.error ? t('music.lib.decode_failed') : '' }, main, more);
    li.addEventListener('contextmenu', (e) => { e.preventDefault(); menuFor(tr, e.clientX, e.clientY); });
    return li;
  }
  function renderSide(all) {
    const counts = M.lib.tagCounts();
    const btn = (label, n, tag) => el('button', { type: 'button', class: 'mu-tagbtn', 'aria-pressed': S.tag === tag ? 'true' : 'false',
      onclick: () => { S.tag = S.tag === tag ? '' : tag; render(); } }, el('span', null, label), el('span', { class: 'mu-n' }, String(n)));
    side.replaceChildren(el('h2', { class: 'mu-h' }, t('music.lib.tags')), btn(t('music.lib.all_tracks'), all.length, ''),
      ...counts.map(([tag, n]) => btn(tag, n, tag)),
      ...(counts.length ? [] : [el('p', { class: 'mu-fine' }, t('music.lib.no_tags'))]));
  }
  function render() {
    scheduled = false;
    if (!rows) return;
    const all = M.lib.list(), shown = visible();
    renderSide(all);
    rows.replaceChildren(...shown.map(row));
    stat.textContent = all.length ? t(S.tag ? 'music.lib.stat_tag' : 'music.lib.stat', { shown: shown.length, n: all.length, tag: S.tag }) : '';
    empty.hidden = all.length > 0;
  }
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(render); } };
  /** Marks the playing row without rebuilding the list. */
  function markCurrent() {
    const cur = curId();
    if (rows) rows.querySelectorAll('.mu-row').forEach((li) => li.classList.toggle('on', li.dataset.id === cur));
  }
  /** The one way in (shared/intake, spec 'music'): Add files, the empty library's button, a drop on the library, the
   *  sample, a paste, ?drive=<id> and a PWA launch. A file is added to Slop Drive (the library); a track the library
   *  already has (another app's Open in Slop Music) plays. */
  const ACCEPT = () => ({ types: ['audio/*'], exts: ['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac', '.opus'], noun: 'music.lib.noun' });
  function register() {
    window.SlopIntake.register({
      id: 'music', accept: ACCEPT(), driveAccept: ['audio/*'],
      process: async (file, ctx) => {
        const id = ctx.drive && ctx.drive.id;
        if (id && M.lib.track(id)) { M.playTrack(id); return file.name; }
        if (!(await M.lib.addFiles([file]))) throw new Error(t('music.lib.add_failed'));
        return file.name;
      },
    });
  }
  const addFiles = () => window.SlopIntake.pick({ to: 'music' });
  function bind() {
    register();
    rows = $('lib-list'); stat = $('lib-stat'); side = $('lib-side'); empty = $('lib-empty');
    $('lib-search').addEventListener('input', (e) => { S.q = e.target.value; schedule(); });
    $('lib-sort').addEventListener('change', (e) => { S.sort = e.target.value; schedule(); });
    $('mu-add').addEventListener('click', addFiles);
    $('lib-add-empty').addEventListener('click', addFiles);
    const view = $('v-library');
    // The library's drop strip is the intake's zone (and its feedback for every way in).
    const drop = SlopDrop.attach($('lib-drop'), {
      intake: 'music',
      compact: true,
      targets: [view],
      // the sample's button is the empty library's (below): a compact strip draws none
      sample: { label: 'music.lib.sample', files: () => window.SlopSamples.media.melodies(3, 8) },
    });
    // the empty library's preview: drawn again on a language change, with the list (render)
    const preview = () => $('lib-preview').replaceChildren(SlopDrop.panel.preview({
      picture: { src: '../assets/shots/music.jpg', alt: t('music.lib.shot_alt') },
      steps: [t('music.lib.step_drop'), t('music.lib.step_tag'), t('music.lib.step_play')] }));
    preview();
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { preview(); render(); });
    $('lib-sample').addEventListener('click', () => drop.sample());
    M.lib.subscribe(schedule);
    M.engine.subscribe(() => { if (M.engine.state().trackId !== bind.last) { bind.last = M.engine.state().trackId; markCurrent(); } });
  }
  M.libUI = { bind, render, schedule, state: S, visible, editTags, menuFor };
})();
