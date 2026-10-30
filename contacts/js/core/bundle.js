/* Slop Contacts: the Slop Drive bundle. The whole list is one vCard 4.0 file (contacts.vcf, UTF-8, CRLF). Each contact is
 * one VCARD block: the standard properties (N, FN, ORG, TITLE, TEL, EMAIL, ADR, BDAY, URL, NOTE) and the Slop properties
 * that vCard does not have: X-SLOP-ID (the stable id, so a re-import updates the same record), X-SLOP-GROUP (one line per
 * group), X-SLOP-STAGE, X-SLOP-FOLLOWUP (ISO date) and X-SLOP-TAGS (one line, comma separated). Photos are not written.
 * Other apps ignore the X-SLOP lines. Reading goes through the vCard reader, so a bundle imports like any .vcf.
 * Classic script. Adds SlopContacts.bundle. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const T = SC.text, M = SC.model;
  const NAME = 'contacts.vcf', MIME = 'text/vcard';
  const STAGES = ['lead', 'contacted', 'customer', 'lost'];
  const esc = T.escVal;

  /** The X-SLOP lines of one contact (already normalised). */
  function slopLines(c) {
    const out = [`X-SLOP-ID:${esc(c.id)}`];
    for (const g of c.groups || []) out.push(`X-SLOP-GROUP:${esc(g)}`);
    if (c.stage) out.push(`X-SLOP-STAGE:${esc(c.stage)}`);
    if (c.followUp) out.push(`X-SLOP-FOLLOWUP:${esc(c.followUp)}`);
    if ((c.tagIds || []).length) out.push(`X-SLOP-TAGS:${c.tagIds.map(esc).join(',')}`);
    return out;
  }

  /** The whole list as one bundle string. */
  function write(list) {
    return (list || []).map((x) => {
      const c = M.normalise(x);
      return SC.vcard.one(c, '4.0', { slop: true, extra: slopLines(c) });
    }).join('');
  }

  /** Reads a bundle (or any vCard text) back. A stage that is not a pipeline stage and a follow-up date that is not
   *  YYYY-MM-DD are dropped, so a bad value cannot stop a save. */
  function read(text) {
    return SC.vcard.read(text, { photos: false }).map((c) => {
      if (!STAGES.includes(c.stage)) delete c.stage;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(c.followUp || '')) delete c.followUp;
      return c;
    });
  }

  SC.bundle = { NAME, MIME, STAGES, write, read, slopLines };
})();
