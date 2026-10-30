/* SlopCut: the application shell. Elements, status line, selection, theme, imports, drag and drop
   of files onto the window, and the mobile panel tabs. Exposes SE.app. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, E = SE.edit;
  const A = SE.app = { sel: new Set() };
  const $ = U.$;
  A.els = {};
  A.ACCEPT = 'video/*,audio/*,image/*,.mp4,.m4v,.mov,.webm,.mkv,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.png,.jpg,.jpeg,.gif,.webp,.svg';

  A.status = function (msg) { const s = A.els.statusMsg; if (!s) return; s.textContent = msg || ''; clearTimeout(A._st); if (msg) A._st = setTimeout(() => { s.textContent = ''; }, 5000); };

  /* ------------------------------------------------------------ selection */
  A.select = function (ids, { add = false, toggle = false } = {}) {
    if (!add && !toggle) A.sel.clear();
    for (const id of ids) { if (toggle && A.sel.has(id)) A.sel.delete(id); else A.sel.add(id); }
    for (const id of [...A.sel]) if (!M.clip(SE.doc, id)) A.sel.delete(id);
    SE.emit('select', {});
  };
  /** The first selected clip (for the inspector). */
  A.primary = () => { for (const id of A.sel) { const c = M.clip(SE.doc, id); if (c) return c; } return null; };
  A.selectedIds = () => [...A.sel].filter((id) => M.clip(SE.doc, id));
  SE.on('change', () => { for (const id of [...A.sel]) if (!M.clip(SE.doc, id)) A.sel.delete(id); });

  /* ------------------------------------------------------------ import */
  A.importFiles = async function (files, opts) {
    files = [...files];
    if (!files.length) return [];
    const proj = files.find((f) => /\.slopedit$/i.test(f.name));
    if (proj) { await SE.project.openFile(proj, proj.slopDrive ? proj.slopDrive.id : null); return []; } // a Drive project stays linked
    const wasEmpty = !SE.doc.clips.length;
    A.status(U.t('slopedit.app.importing', { n: files.length }));
    const metas = await SE.media.importFiles(files, opts);
    if (!metas.length) { A.status(''); return metas; }
    if (wasEmpty && !SE.doc.clips.length) {
      const v = metas.find((m) => m.kind === 'video' && m.w && m.h);
      if (v) SE.doc = Object.assign(SE.doc, { w: v.w + (v.w % 2), h: v.h + (v.h % 2) });
      A.appendToTimeline(metas);
      if (v) A.status(U.t('slopedit.app.seq_set', { w: String(SE.doc.w), h: String(SE.doc.h), name: v.name }));
      SE.emit('settings', {});
      if (A.isPhone()) A.setPane('timeline');
    } else A.status(U.t('slopedit.app.imported', { n: metas.length }));
    return metas;
  };
  // Import media… and Import from Slop Drive: sources of the one intake (io/intake.js), whose reader is importFiles.
  A.openDialog = () => SE.intake.importMedia();
  A.openFromDrive = () => SE.intake.fromDrive();
  /** Put media at the end of the timeline (V1 for pictures, A1 for sound). */
  A.appendToTimeline = function (metas, at) {
    SE.change(U.t('slopedit.app.add_to_timeline'), (p) => {
      let ids = [];
      for (const m of metas) {
        const tk = m.kind === 'audio' ? M.audioTracks(p)[0] : M.videoTracks(p)[0];
        const start = at != null ? at : M.clipsOn(p, tk.id).reduce((x, c) => Math.max(x, M.end(c)), 0);
        const got = E.addMedia(p, m, tk.id, start);
        ids = ids.concat(got);
        if (at != null && got.length) at = M.end(M.clip(p, got[0]));
      }
      A.select(ids);
    });
  };

  /* ------------------------------------------------------------ theme */
  /* The app's names and the shared theme ids (shared/theme/theme.js): the choice is saved through SlopTheme.set. */
  const THEMES = [['pro', 'slopedit.app.pro_dark', 'dark'], ['light', 'slopedit.app.light', 'light'], ['classic', 'slopedit.app.classic_98', 'classic']] // the names are keys (U.t at use)
    .filter((x) => !window.SlopTheme || SlopTheme.has(x[2]));   // only the themes the site offers
  A.THEMES = THEMES;
  /* The choice is saved for every page by the shared switcher; this page only shows it. */
  A.paintMeta = function () {
    const meta = document.querySelector('meta[name="theme-color"]');
    const id = document.documentElement.getAttribute('data-slop-theme');
    if (meta) meta.setAttribute('content', id === 'light' ? '#f1ede4' : id === 'classic' ? '#c0c0c0' : '#0e0e10');
  };
  A.setTheme = function (t, silent) {
    const row = THEMES.find((x) => x[0] === t) || THEMES[0];
    const r = window.SlopTheme ? SlopTheme.set(row[2]) : { ok: false, error: U.t('slopedit.app.the_theme_script_did_not') };
    if (!r.ok) { if (window.SlopTheme) SlopTheme.apply(row[2]); A.status(r.error, 'err'); }
    else if (!silent) A.status(U.t('slopedit.cmd.theme', { name: U.t(row[1]) }));
    A.paintMeta();
    SE.emit('theme', { t: row[0] });
  };
  A.cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ------------------------------------------------------------ mobile panes */
  A.isPhone = () => window.innerWidth <= 760;
  A.setPane = function (pane) {
    if (pane === 'insp' && A.inspSheet && A.isPhone()) { A.inspSheet.open(); return; }   // a bottom sheet over the pane (ui/layout.js)
    A.els.app.dataset.pane = pane;
    if (SE.bin && (pane === 'media' || pane === 'effects') && SE.bin.tab !== pane) { SE.bin.tab = pane; SE.bin.render(); }
    U.$$('.mtab', A.els.mtabs).forEach((b) => b.classList.toggle('on', b.dataset.pane === pane));
    SE.emit('layout', {});
  };
  function buildTabs() {
    const tabs = [['media', 'bin', 'slopedit.app.media'], ['effects', 'sparkle', 'slopedit.app.effects'], ['insp', 'sliders', 'slopedit.app.inspector'], ['timeline', 'film', 'slopedit.cmd.timeline']]; // keys: the labels follow a language change (data-i18n)
    for (const [id, ic, key] of tabs) A.els.mtabs.append(U.h('button', { type: 'button', class: 'mtab', dataset: { pane: id }, onclick: () => { if (!(id === 'insp' && A.inspSheet && A.isPhone())) A.setPane(id); } }, SE.icon(ic), U.h('span', { dataset: { i18n: key } }, U.t(key))));
  }

  /* ------------------------------------------------------------ drag and drop of files */
  // A drop on a timeline lane takes the batch where it is dropped; anywhere else the strip over the monitor (the intake's
  // zone, io/intake.js) imports it, as Import media… does.
  function wireDrop() {
    const zone = document.createElement('div');
    zone.id = 'scDrop'; zone.className = 'sc-dropstrip';
    document.getElementById('monitor').append(zone);
    SE.intake.attachDrops(zone);
  }

  /* ------------------------------------------------------------ resizable timeline */
  function wireSplit() {
    const s = A.els.tlSplit;
    const h0 = U.store.get('tlh', 300);
    document.documentElement.style.setProperty('--tl-h', U.clamp(h0, 160, innerHeight - 220) + 'px');
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault(); s.setPointerCapture(e.pointerId); // touch-ok: .tl-split has touch-action: none (css/timeline.css)
      const y0 = e.clientY, start = A.els.timeline.getBoundingClientRect().height;
      const mv = (ev) => { const h = U.clamp(start - (ev.clientY - y0), 140, innerHeight - 200); document.documentElement.style.setProperty('--tl-h', h + 'px'); U.store.set('tlh', h); SE.emit('layout', {}); };
      s.addEventListener('pointermove', mv);
      s.addEventListener('pointerup', () => s.removeEventListener('pointermove', mv), { once: true });
    });
  }

  A.init = function () {
    for (const id of ['app', 'menus', 'btnUndo', 'btnRedo', 'btnSearch', 'btnExport', 'btnMore', 'projName', 'bin', 'monitor', 'monStage', 'preview', 'overlay', 'monMsg', 'transport', 'insp', 'timeline', 'tlSplit', 'tlBar', 'tlBody', 'tlHeads', 'tlLanes', 'tlCanvas', 'mtabs', 'statusLeft', 'statusMsg', 'statusCaps', 'dropOverlay']) A.els[id] = document.getElementById(id);
    A.els.btnUndo.append(SE.icon('undo')); A.els.btnRedo.append(SE.icon('redo')); A.els.btnSearch.append(SE.icon('zoomin'));
    A.els.btnExport.append(SE.icon('export'), U.h('span', null, U.t('slopedit.app.export')));
    A.els.btnMore.append(SE.icon('more'));
    A.paintMeta(); // the shared theme script has already painted the page
    buildTabs(); wireDrop(); wireSplit();
    A.setPane(A.els.app.dataset.pane || 'media');
    A.els.projName.addEventListener('change', () => { SE.doc.name = A.els.projName.value.trim() || 'Untitled project'; SE.emit('autosave'); }); // i18n-ignore: the project's own name
    SE.on('doc', () => { A.els.projName.value = SE.doc.name; });
    addEventListener('resize', () => SE.emit('layout', {}));
  };
})();
