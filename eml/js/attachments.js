/* Slop EML: saving attachments together. One attachment is saved as it is; two or more go into one ZIP named after the
 * message. Names are cleaned of path characters and made unique inside the ZIP (eml/js/batch.js). Classic script:
 * window.EmlAttachments.
 *   EmlAttachments.uniqueNames(names)        -> the same names, with duplicates made distinct ("a (2).pdf")
 *   EmlAttachments.packageOf(doc, indexes)   -> Promise<{ blob, name }> for those attachments, or null when none */
(function () {
  'use strict';
  const B = window.EmlBatch;
  const safe = (n) => B.safeName(n, 'attachment');
  const uniqueNames = (names) => B.uniqueNames(names, 'attachment');

  async function packageOf(doc, indexes) {
    const atts = doc.msg.attachments;
    const picked = indexes.filter((i) => atts[i]).map((i) => atts[i]);
    if (!picked.length) return null;
    if (picked.length === 1) return { blob: new Blob([picked[0].bytes], { type: B.typeOf(picked[0].name, picked[0].type) }), name: safe(picked[0].name) };
    const names = uniqueNames(picked.map((a) => a.name));
    const blob = await window.SlopZip.zip(picked.map((a, k) => ({ name: names[k], data: a.bytes })));
    const stem = safe(String(doc.name || 'message').replace(/\.eml$/i, ''));
    return { blob, name: stem + ' attachments.zip' };
  }

  window.EmlAttachments = { uniqueNames, packageOf };
})();
