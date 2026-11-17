/* Slop Drive — ui/dnd: drag items (pointer events, so it also works in the Nodes view) onto anything with
 * data-drop: folders in the pane, the sidebar tree, breadcrumbs, Slop Drive (root), Starred and Trash.
 * Hold Alt (or Ctrl) to copy instead of move. Plus drag-and-drop upload of files and folders from the computer. */
'use strict';
(function (DR) {
  const S = DR.S, el = DR.el, $ = DR.$;
  let justEnded = 0;
  DR.dragJustEnded = () => Date.now() - justEnded < 60;

  /** Run a drop of items onto a data-drop value. Exposed for tests. */
  DR.dropOn = async function (target, items, copy = false) {
    if (!items.length) return 0;
    if (target === 'trash') return DR.trash(items);
    if (target === 'star') return DR.setStar(items, true);
    if (DR.isPvTarget(target)) return DR.dropToProvider(DR.internalEntries(items), target, copy);
    const dest = target === 'root' || target == null ? null : target;
    if (dest && !S.folders.has(dest)) return 0;
    if (copy) return DR.copy(items, dest);
    return DR.move(items, dest);
  };
  function targetAt(x, y, keys) {
    const t = document.elementFromPoint(x, y), d = t && t.closest('[data-drop]');
    if (!d) return null;
    const v = d.dataset.drop;
    if (keys.includes('d:' + v)) return null;
    return { node: d, value: v };
  }
  DR.wireDrag = function () {
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      const src = e.target.closest('#pane [data-key], #tree [data-key]');
      if (!src || e.target.closest('input, .twisty, .no-drag')) return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null, over = null, keys = null;
      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          const k = src.dataset.key;
          if (!S.sel.has(k)) DR.select([k]);
          keys = [...S.sel];
          const items = DR.items(keys);
          if (!items.length || items.some((i) => i.trashedAt)) { cleanup(); return; }
          ghost = el('div', { class: 'ghost' }, DR.badge(items[0], 'badge xs'), el('span', null, items.length === 1 ? items[0].name : DR.t('drive.app.items_n', { n: items.length })));
          document.body.append(ghost); document.body.classList.add('dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
        const t = targetAt(ev.clientX, ev.clientY, keys);
        if (over && (!t || t.node !== over.node)) over.node.classList.remove('drop');
        if (t) {
          const ok = DR.canDrop(DR.items(keys), t.value);
          if (ok) t.node.classList.add('drop');
          over = ok ? t : null;
        } else over = null;
        ghost.classList.toggle('copy', ev.altKey || ev.ctrlKey || ev.metaKey);
      };
      const up = (ev) => {
        const t = over, copy = ev.altKey || ev.ctrlKey || ev.metaKey, wasDrag = !!ghost;
        cleanup();
        if (wasDrag) { justEnded = Date.now(); if (t) DR.dropOn(t.value, DR.items(keys), copy); }
      };
      function cleanup() {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cleanup);
        if (over) over.node.classList.remove('drop');
        if (ghost) ghost.remove();
        document.body.classList.remove('dragging');
      }
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cleanup);
    });
  };

  /* ---------- upload by dropping files from the computer ---------- */
  // Files and folders go to the folder under the pointer (or the open folder). SlopDrop (shared/drop) takes the drop,
  // shows the progress strip above the pane, and uploads each file; a lone Slop backup opens in Backup & restore.
  DR.wireDropUpload = function () {
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
    const isFolder = (t) => t && t.dataset.drop !== 'trash' && t.dataset.drop !== 'star';
    // The folder under the pointer lights up while files are dragged over it (the drop lands on the same element).
    addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      document.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
      const d = document.elementFromPoint(e.clientX, e.clientY), t = d && d.closest('[data-drop]');
      if (isFolder(t)) t.classList.add('drop');
    });
    // The folder a drop lands in: the data-drop element it was dropped on, else the open folder.
    const dropDest = (e) => {
      const t = e && e.target && e.target.closest ? e.target.closest('[data-drop]') : null;
      if (!isFolder(t)) return DR.dest();
      return t.dataset.drop === 'root' ? null : t.dataset.drop;
    };
    let batchDest = null;
    // The one way in (shared/intake, spec 'drive'): a drop (files and folders), Upload files… / Upload a folder… (Ctrl+U),
    // and what the page was opened with (?drive=<id>: that file is shown; launchQueue files are uploaded). The
    // whole batch is uploaded at once into its folder (a drop's folder, else the open one); the strip shows each file.
    window.SlopIntake.register({
      id: 'drive', accept: { any: true, allowEmpty: true, noun: 'drive.dlg.a_file' }, paste: false, // Ctrl+V is Drive's own clipboard
      processAll: async (files, ctx) => {
        const rec = ctx.drive && S.files.get(ctx.drive.id);
        if (ctx.source === 'launch' && rec && files.length === 1) { DR.reveal(rec); return [rec.id]; } // Open in Slop Drive
        const dest = files[0].slopDest !== undefined ? files[0].slopDest : ctx.data && 'dest' in ctx.data ? ctx.data.dest : DR.dest();
        return DR.importFiles(files.map((f) => ({ file: f, path: f.slopPath || f.webkitRelativePath || f.name })), dest);
      },
    });
    // SlopDrop (shared/drop): the zone is the strip above the pane, shown only while files are added (drive/css/base.css);
    // the drops are taken by the pane and the tree.
    window.SlopDrop.attach(document.getElementById('drvDrop'), {
      intake: 'drive',
      compact: true,
      targets: [document.getElementById('main'), document.getElementById('tree')],
      files: async (dt, e) => {
        document.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop'));
        batchDest = dropDest(e);
        const list = await DR.readDrop(dt);
        if (DR.isPvTarget(batchDest)) { await DR.uploadToProvider(list, batchDest); return []; }
        const bext = (window.SlopBackup && window.SlopBackup.EXT || '').toLowerCase();   // the backup ZIP's extension (shared/backup/index.js)
        if (list.length === 1 && bext && list[0].file.name.toLowerCase().endsWith(bext)) {
          if (await window.SlopUI.confirm(DR.t('drive.dlg.restore_q'), DR.t('drive.dlg.restore_body', { name: list[0].file.name }), DR.t('drive.dlg.open_backup'), { cancel: DR.t('drive.dlg.just_upload') })) {
            if (window.SlopBackupUI) window.SlopBackupUI.open.choose = null;
            DR.backupDialog();
            for (let i = 0; i < 100 && !(window.SlopBackupUI && window.SlopBackupUI.open.choose); i++) await new Promise((r) => setTimeout(r, 50));
            if (window.SlopBackupUI && window.SlopBackupUI.open.choose) window.SlopBackupUI.open.choose(list[0].file);
            return [];
          }
        }
        return list.map((r) => Object.assign(r.file, { slopPath: r.path, slopDest: batchDest }));
      },
    });
  };
})(window.DR);
