/* SlopCut: the Project panel. Tabs for Media (imported files) and Effects (transitions, titles,
   generators; filled by effects.js). Media items drag onto the timeline, or double-click to add. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, A = SE.app;
  const h = U.h;
  const B = SE.bin = { tab: 'media', filter: '', picked: new Set() };
  let root, list, info, search;

  const KIND_ICON = { video: 'film', audio: 'music', image: 'image' };
  function card(meta) {
    const it = SE.media.get(meta.id) || { status: 'missing' };
    const thumb = h('div', { class: 'bi-thumb k-' + meta.kind });
    if (it.poster) { const c = U.canvas(it.poster.width, it.poster.height); c.getContext('2d').drawImage(it.poster, 0, 0); thumb.append(c); }
    else thumb.append(SE.icon(KIND_ICON[meta.kind] || 'film', 'bi-ph'));
    if (it.status === 'loading' || it.status === 'analysing') thumb.append(h('span', { class: 'bi-spin', title: U.t('slopedit.bin.analysing') }));
    if (it.status === 'error' || it.status === 'missing') thumb.append(h('span', { class: 'bi-err', title: it.error || U.t('slopedit.bin.error') }, '!'));
    const dur = meta.kind === 'image' ? U.t('slopedit.bin.still') : U.dur(meta.dur);
    thumb.append(h('span', { class: 'bi-dur' }, dur));
    if (it.status === 'ready') thumb.append(h('button', { type: 'button', class: 'bi-add', title: U.t('slopedit.bin.add_at_playhead'), 'aria-label': U.t('slopedit.bin.add_name', { name: meta.name }), onclick: (e) => { e.stopPropagation(); addAtPlayhead(meta); } }, SE.icon('plus')));
    const used = SE.doc.clips.some((c) => c.media === meta.id);
    const el = h('div', {
      class: 'bi' + (used ? ' used' : '') + (B.picked.has(meta.id) ? ' on' : ''), role: 'option', tabindex: '0', draggable: it.status === 'ready' ? 'true' : 'false', dataset: { id: meta.id }, 'aria-selected': B.picked.has(meta.id) ? 'true' : 'false',
      title: meta.name + (meta.w ? ' · ' + meta.w + '×' + meta.h : '') + (meta.kind !== 'image' ? ' · ' + U.dur(meta.dur) : '') + (meta.kind === 'video' ? (meta.hasAudio ? ' · with sound' : ' · no sound') : '')
    }, thumb, h('div', { class: 'bi-name' }, SE.icon(KIND_ICON[meta.kind] || 'film'), h('span', null, meta.name)));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-slopedit-media', meta.id); e.dataTransfer.effectAllowed = 'copy'; SE.timeline && SE.timeline.dragMedia(meta.id); });
    el.addEventListener('dragend', () => SE.timeline && SE.timeline.dragMedia(null));
    el.addEventListener('dblclick', () => addAtPlayhead(meta));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addAtPlayhead(meta);
      else if (e.key === ' ') { e.preventDefault(); B.picked.has(meta.id) ? B.picked.delete(meta.id) : B.picked.add(meta.id); B.render(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.stopPropagation(); removeItem(meta); }
      else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = el.getBoundingClientRect(); itemMenu(meta, r.left + 16, r.top + 16); } // i18n-ignore: key names and classes
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(meta, e.clientX, e.clientY); });
    // A long press is the contextmenu above: the touch layer (shared/input) sends it on iOS, Android its own.
    el.addEventListener('click', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      // Ctrl/Shift-click builds a multi-selection (templates and the random edit use it); a plain click selects one.
      if (e.ctrlKey || e.metaKey || e.shiftKey) { if (B.picked.has(meta.id)) B.picked.delete(meta.id); else B.picked.add(meta.id); }
      else { B.picked = new Set([meta.id]); }
      B.render();
    });
    return el;
  }
  function addAtPlayhead(meta) {
    if (!SE.media.ready(meta.id)) { SlopUI.toast(U.t('slopedit.bin.analysing_name', { name: meta.name })); return; }
    A.appendToTimeline([meta], SE.player ? SE.player.time : null);
    A.status(U.t('slopedit.bin.added_name', { name: meta.name }));
  }
  async function removeItem(meta) {
    const n = SE.doc.clips.filter((c) => c.media === meta.id).length;
    if (n && !(await SlopUI.confirm(U.t('slopedit.bin.remove_media'), `“${meta.name}” is used by ${n} clip${n > 1 ? 's' : ''} on the timeline. Remove it and those clips?`, U.t('slopedit.bin.remove'), { danger: true }))) return;
    SE.media.remove(meta.id);
  }
  async function rename(meta) {
    const v = await SlopUI.prompt(U.t('slopedit.bin.rename'), U.t('slopedit.bin.name'), meta.name);
    if (v && v.trim()) { meta.name = v.trim(); B.render(); SE.emit('change', { label: U.t('slopedit.bin.rename') }); }
  }
  function itemMenu(meta, x, y) {
    const ready = SE.media.ready(meta.id);
    SlopUI.menu([
      { label: U.t('slopedit.bin.add_at_playhead'), key: 'Enter', act: () => addAtPlayhead(meta), disabled: !ready },
      { label: U.t('slopedit.bin.append_to_end_of_timeline'), act: () => A.appendToTimeline([meta]), disabled: !ready },
      { label: U.t('slopedit.bin.use_size', { w: String(meta.w), h: String(meta.h) }), disabled: !meta.w || meta.kind === 'audio', act: () => SE.settings.apply({ w: meta.w + (meta.w % 2), h: meta.h + (meta.h % 2) }) },
      '-',
      { label: U.t('slopedit.bin.rename_2'), act: () => rename(meta) },
      window.SlopHub && !SE.offline ? { label: U.t('slopedit.bin.save_to_slop_drive'), act: () => SlopHub.saveToDrive(SE.media.get(meta.id).blob, meta.name) } : null,
      { label: U.t('slopedit.bin.download_original'), act: () => SlopUI.download(SE.media.get(meta.id).blob, meta.name) },
      '-',
      { label: U.t('slopedit.bin.remove_from_project'), key: 'Del', act: () => removeItem(meta) } // i18n-ignore: key names and classes
    ], x, y);
  }

  B.render = function () {
    if (!root) return;
    U.$$('.bin-tab', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === B.tab));
    root.dataset.tab = B.tab;
    if (B.tab === 'effects') { if (SE.effectsPanel) SE.effectsPanel.render(list); return; }
    if (B.tab === 'templates') { if (SE.tplPanel) SE.tplPanel.render(list); info.textContent = ''; return; }
    if (B.tab === 'watermark' && SE.watermark) { SE.watermark.panel.render(list); info.textContent = ''; return; }
    list.replaceChildren();
    const q = B.filter.toLowerCase();
    const items = SE.doc.media.filter((m) => !q || m.name.toLowerCase().includes(q));
    if (!SE.doc.media.length) {
      list.append(h('div', { class: 'bin-empty' },
        SE.icon('film', 'bin-empty-ic'),
        h('b', null, U.t('slopedit.bin.import_media_to_start')),
        h('p', null, U.t('slopedit.bin.drop_video_audio_or_images')),
        h('div', { class: 'bin-empty-actions' },
          h('button', { type: 'button', class: 'btn primary', onclick: A.openDialog }, SE.icon('open'), U.t('slopedit.bin.import_files')), // i18n-ignore: key names and classes
          h('button', { type: 'button', class: 'btn', onclick: () => SE.sample && SE.sample.load() }, SE.icon('sparkle'), U.t('slopedit.bin.sample_project'))),
        h('p', { class: 'bin-privacy' }, U.t('slopedit.bin.your_footage_never_leaves_this'))));
    } else list.append(h('div', { class: 'bi-grid', role: 'listbox', 'aria-label': U.t('slopedit.app.media') }, items.map(card)));
    const total = SE.doc.media.length;
    info.textContent = total ? U.t('slopedit.bin.items', { n: total }) : U.t('slopedit.bin.empty');
  };
  B.init = function (el) {
    root = el;
    search = h('input', { class: 'inp bin-search', type: 'search', placeholder: U.t('slopedit.bin.search_media'), 'aria-label': U.t('slopedit.bin.search_media'), 'data-i18n-attr': 'placeholder:slopedit.bin.search_media;aria-label:slopedit.bin.search_media', oninput: () => { B.filter = search.value; B.render(); } });
    info = h('span', { class: 'bin-info' });
    const tabs = h('div', { class: 'bin-tabs', role: 'tablist' },
      h('button', { type: 'button', class: 'bin-tab', role: 'tab', dataset: { tab: 'media', i18n: 'slopedit.app.media' }, onclick: () => { B.tab = 'media'; B.render(); } }, U.t('slopedit.app.media')),
      h('button', { type: 'button', class: 'bin-tab', role: 'tab', dataset: { tab: 'effects', i18n: 'slopedit.app.effects' }, onclick: () => { B.tab = 'effects'; B.render(); } }, U.t('slopedit.app.effects')),
      h('button', { type: 'button', class: 'bin-tab', role: 'tab', dataset: { tab: 'templates', i18n: 'slopedit.cmd.templates' }, onclick: () => { B.tab = 'templates'; B.render(); } }, U.t('slopedit.cmd.templates')),
      SE.watermark ? h('button', { type: 'button', class: 'bin-tab', role: 'tab', dataset: { tab: 'watermark', i18n: 'slopedit.bin.watermark' }, onclick: () => { B.tab = 'watermark'; B.render(); } }, U.t('slopedit.bin.watermark')) : null,
      h('span', { class: 'tb-flex' }), info);
    const tools = h('div', { class: 'bin-tools' },
      h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.bin.import_files_ctrl_i'), 'data-i18n-attr': 'title:slopedit.bin.import_files_ctrl_i', onclick: A.openDialog }, SE.icon('plus'), h('span', { 'data-i18n': 'slopedit.bin.import' }, U.t('slopedit.bin.import'))), // i18n-ignore: key names and classes
      window.SlopHub ? h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.bin.import_from_slop_drive'), 'data-i18n-attr': 'title:slopedit.bin.import_from_slop_drive', onclick: A.openFromDrive, id: 'binDrive' }, SE.icon('drive'), h('span', { 'data-i18n': 'slopedit.bin.drive' }, U.t('slopedit.bin.drive'))) : null, // i18n-ignore: key names and classes
      search);
    list = h('div', { class: 'bin-list' });
    root.append(h('div', { class: 'pane-head' }, tabs), tools, list);
    SE.on('media', U.debounce(B.render, 60));
    SE.on('change', U.debounce(() => { if (B.tab !== 'effects') B.render(); }, 120));
    SE.on('doc', B.render);
    B.render();
  };
  B.show = function (tab) { B.tab = tab; B.render(); if (A.isPhone()) A.setPane(tab === 'effects' ? 'effects' : 'media'); };
  // Drop picked items that were removed from the bin.
  SE.on('doc', () => { B.picked = new Set([...B.picked].filter((id) => SE.doc.media.some((m) => m.id === id))); });
})();
