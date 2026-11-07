/* Slop Drive: "Remove metadata" for pictures. The menu and the details panel open SlopClean on the file (Open in,
 * with ?drive=<id>). "Remove metadata now" reads what the picture holds, asks with a list of what will be removed,
 * then writes a cleaned copy next to the original as "<name> (clean).<ext>". The original is never changed here.
 * Loads the SlopClean core (clean/js/core) on first use. Classic script; adds to window.DR. */
'use strict';
(function (DR) {
  const H = () => window.SlopHub;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
  const CORE = ['bytes', 'tags', 'xmp', 'tiff', 'jpeg', 'png', 'webp', 'index'].map((n) => `clean/js/core/${n}.js`);
  let coreP = null;

  /** A picture SlopClean can open: by type, or by a picture extension when the type is generic. */
  DR.isCleanable = (r) => !!r && !r.isFolder && !r.trashedAt &&
    (TYPES.includes((r.type || '').toLowerCase()) || /\.(jpe?g|png|webp|tiff?)$/i.test(r.name || ''));

  /** The SlopClean core, loaded once. */
  function loadCore() {
    if (window.SlopClean && window.SlopClean.strip) return Promise.resolve(window.SlopClean);
    if (!coreP) {
      coreP = CORE.reduce((p, rel) => p.then(() => H().loadScript(rel)), Promise.resolve())
        .then(() => window.SlopClean)
        .catch((e) => { coreP = null; throw e; });
    }
    return coreP;
  }
  /** "photo.jpg" -> "photo (clean).jpg" */
  const copyName = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? `${name.slice(0, i)} (clean)${name.slice(i)}` : `${name} (clean)`; };

  /** The confirmation body: what goes, what stays, and where the copy lands. */
  function body(plans, C) {
    const el = window.SlopUI.el;
    const rows = [];
    for (const p of plans) {
      const removed = p.before.filter((f) => f.cat !== 'struct' && p.remove[f.cat]);
      const kept = p.before.filter((f) => f.cat !== 'struct' && !p.remove[f.cat]);
      rows.push(el('h3', { class: 'clean-h' }, p.r.name));
      rows.push(removed.length
        ? el('ul', { class: 'clean-list' }, removed.map((f) => el('li', null, `${f.label}${f.value && f.value !== 'present' ? ': ' + f.value : ''}`)))
        : el('p', { class: 'muted' }, DR.t('drive.clean.nothing')));
      if (kept.length) rows.push(el('p', { class: 'muted' }, DR.t('drive.clean.kept', { list: [...new Set(kept.map((f) => f.label))].join(', ') })));
      rows.push(el('p', { class: 'muted' }, DR.t('drive.clean.copy_note', { name: copyName(p.r.name) })));
    }
    return el('div', { class: 'clean-confirm' }, rows);
  }

  /** Remove metadata from pictures now: confirm, then write "<name> (clean).<ext>" next to each original. */
  DR.removeMetadataNow = async function (items) {
    const files = items.filter(DR.isCleanable);
    if (!files.length) return DR.toast(DR.t('drive.clean.pick'));
    let C;
    try { C = await loadCore(); } catch (e) { return DR.toast(DR.t('drive.clean.na')); }
    const plans = [], skipped = [];
    for (const r of files) {
      const bytes = new Uint8Array(await r.blob.arrayBuffer());
      const ins = C.inspect(bytes);
      if (!ins.supported) { skipped.push(ins.format ? DR.t('drive.clean.unsupported', { name: r.name, format: ins.label }) : DR.t('drive.clean.not_picture', { name: r.name })); continue; }
      const res = C.strip(bytes);
      plans.push({ r, res, before: res.before, remove: C.resolve(), name: copyName(r.name) });
    }
    if (skipped.length) DR.toast(skipped[0]);
    if (!plans.length) return;
    const ok = await window.SlopUI.confirm(
      DR.t('drive.clean.confirm_n', { n: plans.length }),
      body(plans, C), DR.t('drive.clean.write'), { cancel: DR.t('menu.cancel') });
    if (!ok) return;
    for (const p of plans) {
      await H().put(new Blob([p.res.bytes], { type: p.res.mime }), { name: p.name, from: 'clean', folderId: p.r.folderId == null ? null : p.r.folderId });
    }
    await DR.refresh();
    DR.render();
    DR.toast(plans.length === 1 ? DR.t('drive.toast.saved_q', { name: plans[0].name }) : DR.t('drive.clean.saved_n', { n: plans.length }));
  };

  /** Opens SlopClean on the file (the same path as Open in). */
  DR.openInClean = (r) => { if (DR.isCleanable(r)) return DR.openWith(r, 'clean', { remember: false }); };
  DR.cleanRows = (items) => {
    const files = items.filter(DR.isCleanable);
    if (!files.length || items.some((i) => i.isFolder)) return [];
    const one = files.length === 1 && items.length === 1;
    return [
      one ? { label: DR.t('drive.clean.menu'), act: () => DR.openInClean(files[0]) } : null,
      { label: files.length === 1 ? DR.t('drive.clean.now') : DR.t('drive.clean.from_n', { n: files.length }), act: () => DR.removeMetadataNow(files) },
    ].filter(Boolean);
  };
})(window.DR);
