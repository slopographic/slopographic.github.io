/* Slop Tables test helpers for charts, pivot tables and imports: the open dialog, typing into its fields, a data block,
   a pointer drag inside the app frame, and a save to Slop Drive followed by a reopen in the second frame. Extends TB. */
(function () {
  'use strict';
  const { waitFor, sleep } = SlopTest;

  /** The topmost open dialog box in the app (waits for it). */
  TB.dialog = () => waitFor(() => { const all = TB.doc.querySelectorAll('.sui-back:not(.sui-out) .sui-dlg'); return all[all.length - 1] || null; });
  TB.dialogGone = () => waitFor(() => !TB.doc.querySelector('.sui-back:not(.sui-out)'));
  /** Sets a field in the dialog by its aria-label and fires the events the dialog listens to. */
  TB.set = (box, label, value) => {
    const el = box.querySelector(`[aria-label="${label}"]`);
    if (!el) throw new Error('no field ' + label);
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el;
  };
  TB.ok = async (box) => { box.querySelector('.sui-primary').click(); await TB.dialogGone(); await sleep(60); };
  TB.button = (box, text) => [...box.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

  /** Types rows of text into the active sheet from A1. */
  TB.fill = (rows, T = TB.T) => rows.forEach((row, r) => row.forEach((v, c) => { if (v !== null) T.setCell(String.fromCharCode(65 + c) + (r + 1), String(v)); }));

  /** A pointer drag inside the app frame: down on el at its centre (or at a corner handle), move by dx, dy, up. */
  TB.drag = async (el, dx, dy) => {
    const W = TB.win, b = el.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    const ev = (type, px, py) => new W.PointerEvent(type, { bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, buttons: 1, pointerId: 1, isPrimary: true });
    el.dispatchEvent(ev('pointerdown', x, y));
    W.dispatchEvent(ev('pointermove', x + dx / 2, y + dy / 2));
    W.dispatchEvent(ev('pointermove', x + dx, y + dy));
    W.dispatchEvent(ev('pointerup', x + dx, y + dy));
    await sleep(60);
  };

  /** Saves the open workbook to Drive (folder picker stubbed to the root) and opens it again in the second frame. */
  TB.saveAndReopen = async () => {
    TB.hub.saveToDrive = (blob, name, o) => TB.hub.put(blob, { name, from: (o && o.from) || 'tables', folderId: null });
    await TB.T.save();
    const id = TB.T.S.file.driveId;
    if (!id) throw new Error('not saved');
    const win = await TB.boot('?drive=' + id, 'app2');
    await sleep(100);
    win.SlopTables.flush();
    return win;
  };
})();
