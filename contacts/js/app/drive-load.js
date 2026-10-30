/* Slop Contacts: opens contacts.vcf from Slop Drive. When the list is empty at start-up, the file is offered. Opening it
 * with contacts already in the list asks first. The file is read by the bundle reader (core/bundle.js) and goes to the
 * same import preview as a dropped .vcf (importPreview.show, the same plan and apply), so every contact is listed, matched
 * on X-SLOP-ID, phone or e-mail, and nothing changes until Import is pressed. An X-SLOP-ID is kept for a new contact (so a
 * later import matches it), unless the store already holds a record with that id: a deleted one cannot be written over.
 * Adds SlopContacts.driveLoad. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const UI = window.SlopUI;
  const tr = (k, v) => SC.tr(k, v);

  /** Gives a fresh id to each incoming contact whose id the store already holds (deleted records included) and that is
   *  not in the list (a list match keeps its id, so it still matches). */
  async function freeIds(contacts) {
    const inList = new Set(S.list.map((c) => c.id));
    for (const c of contacts) {
      if (inList.has(c.id) || !c.id) continue;
      const r = await window.SlopData.store.get('customers', c.id, { includeDeleted: true });
      if (r.ok && r.value) c.id = SC.records.newId();
    }
    return contacts;
  }

  /** Reads the Drive record and shows it in the preview. Asks first when the list already has contacts. Resolves with true when imported. */
  async function openRecord(rec) {
    const n = S.list.length;
    if (n && !(await UI.confirm(tr('contacts.dr.merge_q'), tr('contacts.dr.merge_body', { n, file: SC.bundle.NAME }), tr('contacts.dr.merge')))) return false;
    try {
      const contacts = await freeIds(SC.bundle.read(await rec.blob.text()));
      if (!contacts.length) { UI.alert(tr('contacts.dr.nothing'), tr('contacts.dr.empty', { file: SC.bundle.NAME })); return false; }
      return await SC.importPreview.show(contacts, SC.bundle.NAME, [], { keepIds: true });
    } catch (e) {
      UI.toast(tr('contacts.dr.open_failed', { file: SC.bundle.NAME, why: e.message || String(e) }));
      return false;
    }
  }

  /** File > Open contacts from Slop Drive. */
  async function open() {
    let rec = null;
    try { rec = await SC.drive.find(); } catch (e) { UI.alert(tr('contacts.dr.could_not'), tr('contacts.dr.unreadable', { why: e.message || String(e) })); return false; }
    if (!rec) { UI.alert(tr('contacts.dr.none_title'), tr('contacts.dr.none', { file: SC.bundle.NAME })); return false; }
    return openRecord(rec);
  }

  /** At start-up, with an empty list and a copy in Slop Drive: offers to open it. Resolves with true when imported. */
  async function offerAtStart() {
    if (S.list.length || !SC.drive.isOn()) return false;
    let rec = null;
    try { rec = await SC.drive.find(); } catch (e) { return false; }
    if (!rec) return false;
    const ok = await UI.confirm(tr('contacts.dr.open_q'), tr('contacts.dr.open_body', { file: SC.bundle.NAME }), tr('contacts.dr.open'));
    return ok ? openRecord(rec) : false;
  }

  SC.driveLoad = { open, offerAtStart };
})();
