/* Slop Contacts: the Slop Drive copy. The whole list is one file, contacts.vcf (core/bundle.js), in the app's own Drive
 * folder (Slop Contacts). Each change to the list marks it dirty; a save follows after about 3 seconds, and Save writes at
 * once. A save is a new version of the same Drive record, never a second file. Saves run one at a time and never block the
 * editing UI. The status line (#driveStatus) says Saving, Saved to Slop Drive at a time, or Could not save and why.
 * Adds SlopContacts.drive. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const APP = 'contacts', DELAY = 3000;
  let timer = 0, saving = null, again = false, lastRev = S.rev, driveId = null;

  const hub = () => window.SlopHub || null;
  const $ = (id) => document.getElementById(id);
  const at = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  /** The status line: kind is 'saving', 'saved' or 'error'. */
  function show(text, kind) {
    const el = $('driveStatus');
    if (!el) return;
    el.textContent = text;
    el.dataset.state = kind;
    el.hidden = !text;
  }

  /** The contacts.vcf record in the app's folder, or null. Trashed copies do not count. Never creates a folder. */
  async function find() {
    const h = hub();
    if (!h) return null;
    const folder = (await h.listFolders()).find((f) => f.app === APP && !f.trashedAt);
    if (!folder) return null;
    return (await h.list({ folderId: folder.id })).find((r) => r.name === SC.bundle.NAME) || null;
  }

  /** Writes the list (as it is now) to the Drive record: a new version of the same file, or the first copy. */
  async function write() {
    const h = hub();
    if (!h) throw new Error('Slop Drive is not available here');
    const blob = new Blob([SC.bundle.write(S.list)], { type: SC.bundle.MIME });
    const cur = driveId ? await h.get(driveId).catch(() => null) : null;
    const hit = cur && !cur.trashedAt ? cur : await find();
    const folderId = hit ? hit.folderId : await h.appFolderId(APP);
    driveId = await h.put(blob, { id: hit ? hit.id : undefined, name: SC.bundle.NAME, from: APP, folderId });
    return driveId;
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(save, DELAY);
  }

  /** Saves now. A call while a save runs waits for it, and a change made meanwhile is saved after it. */
  function save() {
    clearTimeout(timer);
    if (saving) { again = true; return saving; }
    show(SC.tr('contacts.dr.saving'), 'saving');
    saving = write().then(
      () => show(SC.tr('contacts.dr.saved', { time: at() }), 'saved'),
      (e) => show(SC.tr('contacts.dr.save_failed', { why: (e && e.message) || String(e) }), 'error'))
      .finally(() => {
        saving = null;
        if (again) { again = false; schedule(); }
      });
    return saving;
  }

  /** Called on every change to the list the person made (S.rev moved). */
  function onChange() {
    if (S.rev === lastRev) return;
    lastRev = S.rev;
    if (hub()) schedule();
  }

  /** Sets up the save: the toolbar Save button and status line show when Slop Drive is there. */
  function init() {
    const on = !!hub();
    for (const id of ['btnDriveSave', 'driveStatus']) { const el = $(id); if (el) el.hidden = !on; }
    if (!on) return;
    S.on('change', onChange);
  }

  SC.drive = { init, save, find, status: show, isOn: () => !!hub() };
})();
