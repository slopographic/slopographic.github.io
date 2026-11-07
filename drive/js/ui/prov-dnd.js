/* Slop Drive — ui/prov-dnd: drag a folder or file of the Drives tree onto a target: a Drives folder or drive, a Slop Drive
 * folder, or Slop Drive's root. Hold Alt, Ctrl or ⌘ to copy. Dragging Slop Drive items onto a Drives row is handled by
 * dnd.js (DR.dropOn), which calls DR.dropToProvider. Pointer events, like dnd.js, so touch screens are left alone. */
'use strict';
(function (DR) {
  const el = DR.el, $ = DR.$;
  let endedAt = 0;
  DR.provDragEnded = () => Date.now() - endedAt < 60;

  DR.wireProvDrag = function () {
    const box = $('providers'); if (!box) return;
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      const src = e.target.closest('[data-pkey]');
      if (!src || e.target.closest('.linkish, .twisty')) return;
      const entry = DR.provEntryFor(src.dataset.pkey);
      if (!entry || entry.root) return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost = null, over = null;
      const targetAt = (x, y) => {
        const t = document.elementFromPoint(x, y), d = t && t.closest('[data-drop]');
        if (!d || d === src) return null;
        return { node: d, value: d.dataset.drop };
      };
      const move = (ev) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          ghost = el('div', { class: 'ghost' }, DR.icon(entry.isFolder ? 'folder' : 'file'), el('span', null, entry.name));
          document.body.append(ghost);
          document.body.classList.add('dragging');
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
        ghost.classList.toggle('copy', ev.altKey || ev.ctrlKey || ev.metaKey);
        const t = targetAt(ev.clientX, ev.clientY);
        if (over && (!t || t.node !== over.node)) over.node.classList.remove('drop');
        over = t && t.value !== 'trash' && t.value !== 'star' ? t : null;
        if (over) over.node.classList.add('drop');
      };
      const cleanup = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cleanup);
        if (over) over.node.classList.remove('drop');
        if (ghost) ghost.remove();
        document.body.classList.remove('dragging');
      };
      const up = (ev) => {
        const t = over, copy = ev.altKey || ev.ctrlKey || ev.metaKey, was = !!ghost;
        cleanup();
        if (!was) return;
        endedAt = Date.now();
        if (t) DR.dropToProvider([entry], t.value, copy).catch((err) => window.SlopUI.alert(DR.t('drive.prov.not_copied'), (err && err.message) || String(err)));
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cleanup);
    });
  };
})(window.DR);
