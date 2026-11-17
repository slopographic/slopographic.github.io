/* Slop Contacts: the one way files come in (shared/intake, spec 'contacts'). vCards, CSV, TSV and .scontacts files
 * dropped on the contact list (or chosen with the zone's button), chosen with Import ▸ Choose files…, pasted, or handed
 * over from Slop Drive (?drive=<id>, a PWA launch) go to the import flow together (one preview, which waits for the
 * person: the intake does not wait for it). Other files are refused with their names. A contact's photo is a part of its
 * own ('contacts.photo'). Adds SlopContacts.dropImport: mount(), pick(), pickPhoto(), launch(). */
(function () {
  'use strict';
  const SC = window.SlopContacts, SI = window.SlopIntake;
  const RULES = {
    types: ['text/vcard', 'text/x-vcard', 'text/csv', 'application/csv', 'text/comma-separated-values', 'text/plain', 'text/tab-separated-values', 'application/json'],
    exts: ['.vcf', '.vcard', '.csv', '.tsv', '.txt', '.scontacts'],
    get noun() { return SC.tr('contacts.imp.noun'); },
  };
  const ACCEPT = '.vcf,.vcard,.csv,.tsv,.txt,.scontacts,text/vcard,text/csv,application/json';
  SI.register({
    id: 'contacts', accept: RULES,
    processAll: (files) => {
      SC.importFlow.run(files).catch((e) => window.SlopUI.toast(SC.tr('contacts.imp.failed', { why: e.message })));
      return files.map((f) => f.name);
    },
  });
  SI.register({
    id: 'contacts.photo', main: false, paste: false, toast: false, limit: 1, accept: { types: ['image/*'], get noun() { return SC.tr('contacts.ph.noun'); } },
    process: (file) => SC.photoUi.toJpegDataUri(file),
  });

  function mount() {
    const column = document.querySelector('.col-list');
    const zone = document.getElementById('ctDrop');
    if (!column || !zone || !window.SlopDrop) return;
    SlopDrop.attach(zone, { intake: 'contacts', compact: true, label: 'contacts.imp.drop', targets: [column] });
  }
  /** Import ▸ Choose files…. */
  const pick = () => SI.pick({ to: 'contacts', accept: ACCEPT });
  /** Choose photo…: resolves the photo as a JPEG data URI, or null. Throws the reason when it could not be read. */
  async function pickPhoto() {
    const r = await SI.pick({ to: 'contacts.photo', multiple: false, accept: 'image/*' });
    if (r.added[0]) return r.added[0].value;
    if (r.skipped[0]) throw new Error(r.skipped[0].reason);
    return null;
  }
  /** What the page was opened with. Resolves true when something was handed over. */
  const launch = async () => { const r = await SI.launch({ to: 'contacts' }); return !!(r && r.added && r.added.length); };

  SC.dropImport = { mount, pick, pickPhoto, launch };
})();
