/* Slop Drive — ui/info: the details panel (right side on desktop, a bottom sheet on phones): a live preview
 * plus size, kind, type, dates, the app that made it, location, dimensions and tags. The grip and the width: info-width.js. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, $ = DR.$;
  let shownKey = null, urls = [];
  const free = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
  const objUrl = (b, sink = urls) => { const u = URL.createObjectURL(b); sink.push(u); return u; };
  const rows = (pairs) => el('dl', { class: 'facts' }, pairs.filter((p) => p && p[1] != null && p[1] !== '').flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));

  /** A live preview element for a file (Quick Look, the details panel and the columns). Images and PDFs use the shared
   * viewer (ui/viewer.js: zoom, pan, open in a new tab). 3D scenes get a live 3D view (ui/preview-3d.js), CSV a table,
   * text its start, and any other kind its card (ui/preview-kinds.js). big: the Quick Look variant. sink: the array that
   * keeps its object URLs (the info panel frees its own on each change; a column keeps its own). */
  DR.previewOf = function (r, big = false, sink = urls) {
    const kind = DR.kindOf(r), box = el('div', { class: 'pv pv-' + kind });
    if (kind === 'image' || kind === 'pdf' || DR.isAi(r)) box.append(DR.viewerFor(r, big, sink).el);
    else if (kind === 'model' && DR.ext(r.name) === 's3d') box.append(DR.preview3d(r, big));
    else if (kind === 'audio') box.append(DR.audioView(r, big));
    else if (kind === 'video') box.append(el('video', { src: objUrl(r.blob, sink), controls: true, preload: 'metadata', playsinline: true }));
    else if (kind === 'text' && ['csv', 'tsv'].includes(DR.ext(r.name))) box.append(DR.csvPreview(r, big));
    else if (kind === 'text') box.append(DR.textPreview(r, big));
    else box.append(...DR.cardPreview(r));
    return box;
  };
  function dims(r) {
    const m = DR.mediaInfo(r);
    if (!m) return null;
    if (m.pages) return DR.t('drive.info.pages_pt', { n: m.pages, w: String(m.w), h: String(m.h) });
    const parts = [];
    if (m.w) parts.push(`${m.w} × ${m.h} px`);
    if (m.duration) parts.push(`${Math.floor(m.duration / 60)}:${String(Math.round(m.duration % 60)).padStart(2, '0')}`);
    return parts.join(' · ') || null;
  }
  /** The other actions under the preview; the main ones (open, download, restore) are at the panel's foot (ui/info-foot.js). */
  function actions(r) {
    const b = (label, act, cls = '') => { const x = el('button', { type: 'button', class: 'btn ' + cls }, label); x.addEventListener('click', act); return x; };
    if (r.trashedAt) return null;
    const apps = DR.orderedAppsFor(r), d = apps[0];
    const openIn = r.isFolder ? [] : d ? [b(DR.t('drive.info.open_in'), (e) => { const x = e.currentTarget.getBoundingClientRect(); window.SlopUI.menu(DR.openInRows(r), x.left, x.bottom + 4); })] : [el('span', { class: 'muted' }, DR.t('drive.menu.no_app'))];
    return el('div', { class: 'acts' }, ...openIn,
      r.isFolder || !d ? null : b(DR.t('drive.menu.quick_look'), () => DR.quickLook(r)), b(DR.t(r.starred ? 'drive.info.unstar' : 'drive.info.star'), () => DR.setStar([r], !r.starred)),
      DR.isCleanable(r) ? b(DR.t('drive.clean.menu'), () => DR.openInClean(r)) : null,
      DR.isFaceable(r) ? b(DR.t('drive.menu.find_faces'), () => DR.findFaces([r])) : null,
      DR.isFaceable(r) ? b(DR.t('drive.menu.faces_people'), () => DR.openFaces()) : null);
  }
  /** The face row for a picture, when face detection is on: the badge with the count (it draws the boxes on the preview
   * when opened, shared/faces/view.js), or "Not checked yet". With the mode Off, the count as text. */
  function faceRow(r, facts, preview) {
    if (!DR.isFaceable(r) || !window.SlopFaces || !window.SlopFaces.enabled()) return;
    const cell = el('dd', { class: 'faces-n' }, DR.t('drive.info.not_checked'));
    facts.append(el('dt', null, DR.t('drive.info.faces')), cell);
    DR.facesOf(r).then((row) => {
      if (!row) return;
      if (window.SlopFaces.view.mode() === 'off') { cell.textContent = DR.faceText(row.faces.length); return; }
      cell.textContent = '';
      DR.attachFaces(preview, r, cell).then((h) => { if (h) faceH = h; });
    });
  }
  let faceH = null; // the badge and boxes of the shown picture (destroyed when the panel is rebuilt)
  function single(r) {
    const head = el('div', { class: 'info-h' }, DR.badge(r, 'badge sm'), el('h2', { title: r.name }, r.name));
    const loc = r.parent ? DR.pathOf(r.parent).map((f) => f.name).join(' / ') : DR.rootName(), t = DR.t;
    if (r.isFolder) {
      const c = DR.children(r.id), sub = DR.descendants(r.id);
      return [head, el('div', { class: 'pv pv-folder' }, DR.icon('folder', 'ic huge')), actions(r),
        rows([[t('drive.info.kind'), t('drive.kind.one_folder')], [t('drive.info.contains'), t('drive.info.contains_v', { folders: t('drive.app.folders_n', { n: c.folders.length }), files: t('drive.app.files_n', { n: c.files.length }) })], [t('drive.info.all_inside'), t('drive.app.files_n', { n: sub.files.filter((x) => !DR.hidden(x)).length })], [t('drive.col.size'), DR.fmtSize(DR.sizeOf(r))],
          [t('drive.col.location'), loc], [t('drive.info.created'), DR.fmtFull(r.time)], [t('drive.col.modified'), DR.fmtFull(r.modified)], r.trashedAt ? [t('drive.col.trashed'), DR.fmtFull(r.trashedAt)] : null])];
    }
    const dd = el('dd', { class: 'dims' }, dims(r) || '—');
    if (!dims(r)) DR.thumb(r).then(() => { const v = dims(r); dd.textContent = v || '—'; });
    const nv = DR.versionCount(r);
    const facts = rows([[t('drive.info.kind'), DR.kindLabel(r)], [t('drive.info.mime'), r.type], [t('drive.col.size'), t('drive.info.size_bytes', { size: DR.fmtSize(r.size), n: r.size || 0 })], [t('drive.info.made_by'), DR.appName(r.from)],
      [t('drive.col.location'), loc], [t('drive.col.added'), DR.fmtFull(r.time)], [t('drive.col.modified'), DR.fmtFull(r.modified)], [t('drive.col.opened'), r.opened ? DR.fmtFull(r.opened) : t('drive.info.never')],
      nv ? [t('drive.info.versions'), t('drive.info.versions_v', { n: nv })] : null, r.trashedAt ? [t('drive.col.trashed'), DR.fmtFull(r.trashedAt)] : null]);
    if (['image', 'video', 'pdf'].includes(DR.kindOf(r))) facts.append(el('dt', null, t(DR.kindOf(r) === 'pdf' ? 'drive.info.pages' : 'drive.info.dimensions')), dd);
    const pv = DR.previewOf(r);
    faceRow(r, facts, pv);
    return [head, pv, DR.pvGrip(), actions(r), facts, tagBox(r)];
  }
  /** A file's tags: a chip per tag with a remove button, and a box that adds more (Enter or a comma). */
  function tagBox(r) {
    const focusTags = () => { const i = DR.$('info') && DR.$('info').querySelector('.tag-in'); if (i) i.focus(); };
    const chips = DR.tagsOf(r).map((tag) => {
      const x = el('button', { type: 'button', class: 'tag-x', title: DR.t('drive.info.remove_tag_tip', { tag: tag }), 'aria-label': DR.t('drive.info.remove_tag', { tag: tag }) }, DR.icon('x'));
      x.addEventListener('click', async () => { await DR.removeTag([r], tag); focusTags(); });
      return el('span', { class: 'tag' }, tag, x);
    });
    const input = el('input', { type: 'text', class: 'tag-in', placeholder: DR.t('drive.info.add_tag'), 'aria-label': DR.t('drive.info.add_tag'), autocomplete: 'off', maxlength: '200' });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' && e.key !== ',') return;
      e.preventDefault();
      if (input.value.trim()) { await DR.addTags([r], input.value); focusTags(); }
    });
    return el('div', { class: 'tags-box' }, el('h3', { class: 'tags-h' }, DR.t('drive.col.tags')),
      el('div', { class: 'tag-chips' }, ...(chips.length ? chips : [el('span', { class: 'muted' }, DR.t('drive.info.no_tags'))])), input);
  }
  function many(items) {
    const by = new Map();
    for (const it of items) { const k = DR.KIND[DR.kindOf(it)]; by.set(k, (by.get(k) || 0) + 1); }
    return [el('div', { class: 'info-h' }, el('h2', null, DR.t('drive.app.items_n', { n: items.length }))),
      el('div', { class: 'kinds' }, [...by].map(([k, n]) => el('span', { class: 'chip', style: `--k:${k.color}` }, DR.t(`drive.kind.count_${k.id}`, { n })))),
      rows([[DR.t('drive.info.total_size'), DR.fmtSize(items.reduce((n, it) => n + DR.sizeOf(it), 0))]])];
  }
  function place() {
    const it = S.section === 'folder' && S.cwd ? S.folders.get(S.cwd) : null;
    if (it) return single(it);
    const list = DR.lastVisible || [];
    return [el('div', { class: 'info-h' }, el('h2', null, DR.placeName())), el('p', { class: 'muted' }, DR.t('drive.info.select_hint')),
      rows([[DR.t('drive.info.items_here'), String(list.length)], [DR.t('drive.col.size'), DR.fmtSize(list.reduce((n, x) => n + DR.sizeOf(x), 0))]])];
  }
  DR.renderInfo = function (force) {
    const box = $('info'), open = S.info || (DR.sheetUI && DR.sheetUI.isOpen());
    box.hidden = !open && !DR.isMobile();   // on a phone the closed sheet is out of sight, ready to slide up
    document.body.classList.toggle('info-on', !!S.info);
    if (DR.renderFoot) DR.renderFoot();   // the main buttons at the foot (ui/info-foot.js): a phone's closed sheet shows them
    if (!open) { shownKey = null; free(); return; }
    const items = DR.selected();
    const key = DR.version() + '|' + (items.length ? items.map(DR.keyOf).join(',') : 'place:' + S.section + ':' + S.cwd + ':' + (DR.lastVisible || []).length);
    if (key === shownKey && !force) return;
    shownKey = key; free();
    if (faceH) { faceH.destroy(); faceH = null; }
    box.replaceChildren(DR.$('infoGrip'), ...(items.length === 1 ? single(items[0]) : items.length ? many(items) : place()).filter(Boolean));
    if (DR.renderFoot) DR.renderFoot();
  };
  /** Phones: the details panel is a bottom sheet (SlopSheet, shared/ui/sheet.js: the Info button, ×, Escape, a tap
   * outside, swipe down). Its × is the panel's close on a wide screen too. */
  DR.wireSheet = function () {
    DR.sheetUI = SlopSheet.attach({ root: document.body, panel: $('info'), phone: '(max-width: 760px)', toggles: [$('btnInfo')], label: 'drive.info.details',
      closeWide: () => DR.toggleInfo(false), onChange: () => DR.renderInfo(true) });
    matchMedia('(max-width: 760px)').addEventListener('change', () => DR.renderInfo(true));
  };
  DR.sheet = (open) => (open ? DR.sheetUI.open() : DR.sheetUI.close());
})(window.DR);
