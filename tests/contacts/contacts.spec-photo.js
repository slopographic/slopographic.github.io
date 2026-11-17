/* Slop Contacts photos (core): PHOTO in vCard 2.1, 3.0 and 4.0 (base64 JPEG or PNG, and a URL kept as text),
 * the round trip (import then export gives the same PHOTO), the .scontacts file, dedupe merges and the CSV layouts. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SC = () => window.SlopContacts;
  const JPG = '/9j/4AAQSkZJRgABAQ' + 'AAAABAAB'.repeat(12);
  const PNG = 'iVBORw0KGgoAAAANSUhEUg' + 'AAAAAQABAAAA'.repeat(10);
  const CR = '\r\n';
  /** A vCard with one PHOTO property, folded the way a writer folds it (75 octets, then continuation lines). */
  const card = (photoLine, extra = []) => ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Photo Person', 'N:Person;Photo;;;', ...extra,
    ...SC().text.fold(photoLine).split(CR), 'END:VCARD'].join(CR) + CR;
  /** Logical PHOTO lines of a vCard text (unfolded). */
  const photoLines = (text) => text.replace(/\r\n[ \t]/g, '').split(CR).filter((l) => /^PHOTO/.test(l));

  describe('text.html, the one HTML escape of the views', () => {
    // Covers: contacts/js/core/text.js
    it('escapes & < > " and \' and reads null and undefined as nothing', () => {
      expect(SC().text.html(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;');
      expect([SC().text.html(null), SC().text.html(undefined), SC().text.html(42)]).toEqual(['', '', '42']);
    });
  });

  describe('PHOTO on import', () => {
    it('reads a base64 JPEG (3.0 form) as a data URI, joining the folded lines', () => {
      const [c] = SC().vcard.read(card(`PHOTO;ENCODING=b;TYPE=JPEG:${JPG}`));
      expect(c.photo).toBe('data:image/jpeg;base64,' + JPG);
      expect(SC().photo.isImage(c.photo)).toBeTruthy();
    });
    it('reads a base64 PNG with ENCODING=BASE64 and with the 2.1 bare type word', () => {
      const [a] = SC().vcard.read(card(`PHOTO;ENCODING=BASE64;TYPE=PNG:${PNG}`));
      expect(a.photo).toBe('data:image/png;base64,' + PNG);
      const v21 = ['BEGIN:VCARD', 'VERSION:2.1', 'FN:Old', 'PHOTO;PNG;ENCODING=BASE64:' + PNG, 'END:VCARD'].join(CR) + CR;
      expect(SC().vcard.read(v21)[0].photo).toBe('data:image/png;base64,' + PNG);
    });
    it('reads a 4.0 data URI and a 2.1 JPEG with no TYPE (the type comes from the bytes)', () => {
      const v40 = ['BEGIN:VCARD', 'VERSION:4.0', 'FN:Four', 'PHOTO:data:image/jpeg;base64,' + JPG, 'END:VCARD'].join(CR) + CR;
      expect(SC().vcard.read(v40)[0].photo).toBe('data:image/jpeg;base64,' + JPG);
      const v21 = ['BEGIN:VCARD', 'VERSION:2.1', 'FN:Two', 'PHOTO;ENCODING=BASE64:' + JPG, 'END:VCARD'].join(CR) + CR;
      expect(SC().vcard.read(v21)[0].photo).toBe('data:image/jpeg;base64,' + JPG);
    });
    it('keeps a URL as text only (the value is stored, never loaded)', () => {
      const url = 'https://example.com/faces/ann.jpg';
      const [c] = SC().vcard.read(card(`PHOTO;VALUE=uri:${url}`));
      expect(c.photo).toBe(url);
      expect(SC().photo.isImage(c.photo)).toBeFalsy();
    });
    it('drops formats other than JPEG and PNG, and anything that is not an image', () => {
      const gif = card('PHOTO;ENCODING=b;TYPE=GIF:R0lGODlhAQABAIAAAP8AAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');
      expect(SC().vcard.read(gif)[0].photo).toBe('');
      expect(SC().photo.normPhoto('javascript:alert(1)')).toBe('');
      expect(SC().photo.normPhoto('data:text/html;base64,PGgxPg==')).toBe('');
      expect(SC().photo.normPhoto('data:image/jpeg;base64,AA AA')).toBe('');
      expect(SC().photo.normPhoto(' https://example.com/a.png ')).toBe('https://example.com/a.png');
    });
  });

  describe('PHOTO on export and the round trip', () => {
    it('writes a base64 photo as ENCODING=b with its TYPE, every line at most 75 octets', () => {
      const out = SC().vcard.write([SC().model.normalise({ id: 'p', name: { given: 'P' }, photo: 'data:image/png;base64,' + PNG })]);
      expect(out).toContain(`PHOTO;ENCODING=b;TYPE=PNG:${PNG.slice(0, 20)}`);
      for (const l of out.split(CR).filter(Boolean)) expect(SC().text.octets(l)).toBeLessThanOrEqual(75);
    });
    it('writes a link with VALUE=uri, unescaped', () => {
      const out = SC().vcard.write([SC().model.normalise({ id: 'u', name: { given: 'U' }, photo: 'https://example.com/a,b.jpg' })]);
      expect(out).toContain('PHOTO;VALUE=uri:https://example.com/a,b.jpg' + CR);
    });
    it('import then export gives the same PHOTO line (JPEG)', () => {
      const text = card(`PHOTO;ENCODING=b;TYPE=JPEG:${JPG}`);
      const out = SC().vcard.write(SC().vcard.read(text));
      expect(photoLines(out)).toEqual(photoLines(text));
    });
    it('import then export gives the same PHOTO line (PNG and a link), and the same contacts back', () => {
      const text = card(`PHOTO;ENCODING=b;TYPE=PNG:${PNG}`) + card('PHOTO;VALUE=uri:https://example.com/x.png');
      const list = SC().vcard.read(text);
      const out = SC().vcard.write(list);
      expect(photoLines(out)).toEqual(photoLines(text));
      expect(SC().vcard.read(out)).toEqual(list);
    });
    it('keeps the photo in the .scontacts file and through a dedupe merge', () => {
      const a = SC().model.normalise({ id: 'a', name: { given: 'Ann' }, phones: [{ value: '+1 555 0100' }] });
      const b = SC().model.normalise({ id: 'b', name: { given: 'Ann', family: 'Lee' }, phones: [{ value: '+1 555 0100' }], photo: 'data:image/jpeg;base64,' + JPG });
      const merged = SC().dedupe.mergeGroup([a, b], '');
      expect(merged.photo).toBe('data:image/jpeg;base64,' + JPG);
      const back = SC().format.fromScontacts(SC().format.toScontacts([merged]));
      expect(back[0].photo).toBe(merged.photo);
    });
    it('CSV has no photo column in either layout', () => {
      const list = [SC().model.normalise({ id: 'c', name: { given: 'C' }, photo: 'data:image/jpeg;base64,' + JPG })];
      expect(SC().csv.googleCsv(list).toLowerCase()).not.toContain('photo');
      expect(SC().csv.outlookCsv(list).toLowerCase()).not.toContain('photo');
    });
  });

  describe('initials for the avatar', () => {
    it('uses given and family initials, else the first letters of the display name', () => {
      expect(SC().photo.initials({ name: { given: 'jose', family: 'Mueller' }, fn: 'x' })).toBe('JM');
      expect(SC().photo.initials({ name: {}, fn: 'Acme Corp Ltd' })).toBe('AC');
      expect(SC().photo.initials({ name: {}, fn: '' })).toBe('?');
    });
  });
})();
