/* Slop Drive — ui/dupes-ui: the duplicate finder dialog. Groups of identical files (SHA-256) with the space
 * they waste; pick the one to keep per group, or keep the newest / oldest everywhere, and trash the rest.
 * Every trash step opens a review list first (SlopReview): one checkbox per file, the copies to remove checked,
 * the copy to keep unchecked. Only the files left checked are moved to the Trash.
 * Near-duplicate images (dHash) are listed separately, for review only. */
'use strict';
(function (DR) {
  const el = DR.el;
  const t = DR.t;
  const where = (r) => (r.parent ? DR.pathOf(r.parent).map((f) => f.name).join(' / ') : DR.rootName());

  /** One review item per file in the groups. pick(group) gives the copies to remove; the others are kept. */
  function itemsFor(groups, pick) {
    return groups.flatMap((g, i) => {
      const victims = new Set(pick(g).map((r) => r.id));
      const label = t('drive.dupes.group_label', { i: String(i + 1), n: g.files.length, name: g.files[0].name });
      return g.files.map((r) => ({ id: r.id, label: r.name, detail: victims.has(r.id) ? where(r) : t('drive.dupes.kept_detail', { where: where(r) }),
        size: r.size, group: label, checked: victims.has(r.id) }));
    });
  }

  DR.dupesDialog = async function ({ near = true } = {}) {
    const UI = window.SlopUI;
    const status = el('p', { class: 'sui-p', role: 'status' }, t('drive.dupes.looking'));
    const body = el('div', { class: 'dupes' }, status);
    const keep = new Map();
    let res = null;
    const d = UI.dialog({ title: t('drive.dupes.title'), cls: 'sui-wide dupes-dlg', body, buttons: [
      { label: t('drive.dupes.keep_newest'), act: () => applyAll('newest') },
      { label: t('drive.dupes.keep_oldest'), act: () => applyAll('oldest') },
      { label: t('menu.close'), primary: true },
    ] });
    d.box.dataset.dupes = '1';
    /** Opens the review list for these groups, and moves the files left checked to the Trash. Keeps the dialog open. */
    async function reviewAndTrash(groups, pick, title) {
      const ids = await window.SlopReview.open({ title, items: itemsFor(groups, pick),
        intro: t('drive.dupes.intro'),
        confirmLabel: (n) => t('drive.dupes.trash_n', { n }), danger: false });
      if (!ids) return false;
      const want = new Set(ids);
      await DR.trash(groups.flatMap((g) => g.files).filter((r) => want.has(r.id)));
      await scan();
      return false;
    }
    function applyAll(mode) {
      if (!res || !res.groups.length) return false;
      return reviewAndTrash(res.groups, (g) => DR.dupesToTrash(g, mode), t('drive.dupes.trash_q'));
    }
    function thumb(r) { const box = el('span', { class: 'dthumb' }, DR.badge(r, 'badge xs')); DR.fillThumb(box, r); return box; }
    function group(g, i) {
      const name = 'keep-' + i;
      if (!keep.has(g.hash)) keep.set(g.hash, g.files[0].id);
      const rows = g.files.map((r) => {
        const radio = el('input', { type: 'radio', name, value: r.id, checked: keep.get(g.hash) === r.id, 'aria-label': t('drive.dupes.keep_name', { name: r.name }) });
        radio.addEventListener('change', () => keep.set(g.hash, r.id));
        const show = el('button', { type: 'button', class: 'linkish' }, t('drive.dupes.show'));
        show.addEventListener('click', () => { d.close(); DR.reveal(r); });
        return el('label', { class: 'drow' }, radio, thumb(r), el('span', { class: 'dn' }, el('b', null, r.name), el('small', null, `${where(r)} · ${DR.fmtFull(r.modified || r.time)} · ${DR.appName(r.from)}`)), show);
      });
      const go = el('button', { type: 'button', class: 'sui-btn' }, t('drive.dupes.trash_others'));
      go.addEventListener('click', () => reviewAndTrash([g], (x) => DR.dupesToTrash(x, keep.get(x.hash)), t('drive.dupes.trash_others_q')));
      return el('section', { class: 'dgroup', 'data-hash': g.hash }, el('div', { class: 'dhead' }, el('b', null, t('drive.dupes.copies_each', { n: g.files.length, size: DR.fmtSize(g.size) })), el('span', null, t('drive.dupes.wasted', { size: DR.fmtSize(g.wasted) })), go), ...rows);
    }
    async function scan() {
      body.replaceChildren(status);
      res = await DR.findDupes({ near, onProgress: (msg) => { status.textContent = msg; } });
      const kids = [];
      kids.push(el('div', { class: 'dsum' }, el('b', null, res.groups.length ? t('drive.dupes.groups_n', { n: res.groups.length }) : t('drive.dupes.none')),
        el('span', null, t('drive.dupes.summary', { size: DR.fmtSize(res.wasted), n: res.scanned }))));
      res.groups.forEach((g, i) => kids.push(group(g, i)));
      if (res.near.length) {
        kids.push(el('h3', { class: 'dh3' }, t('drive.dupes.similar')), el('p', { class: 'sui-p' }, t('drive.dupes.similar_p')));
        for (const n of res.near) kids.push(el('section', { class: 'dgroup near' }, el('div', { class: 'dhead' }, el('b', null, t('drive.dupes.similar_n', { n: n.files.length })), el('span', null, n.distance ? t('drive.dupes.difference', { d: String(n.distance) }) : t('drive.dupes.almost'))),
          ...n.files.map((r) => { const show = el('button', { type: 'button', class: 'linkish' }, t('drive.dupes.show')); show.addEventListener('click', () => { d.close(); DR.reveal(r); }); return el('div', { class: 'drow' }, thumb(r), el('span', { class: 'dn' }, el('b', null, r.name), el('small', null, DR.fmtSize(r.size))), show); })));
      }
      body.replaceChildren(...kids);
      return res;
    }
    DR.dupesScan = scan;
    return scan();
  };
})(window.DR);
