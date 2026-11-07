/* Slop Contacts: vCard reading (3.0, 2.1 quoted-printable, Apple labels), writing (CRLF, 75 octets) and round trips. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SC = () => window.SlopContacts;

  describe('vCard 3.0 import', () => {
    it('unfolds long lines and reads escaped commas, semicolons and newlines', () => {
      const [c] = SC().vcard.read(CT.VCF30);
      expect(c.note).toBe('Line one\nline two, with a comma; and a backslash \\ end this continues the note (folded)');
      expect(c.name).toEqual({ prefix: 'Dr.', given: 'Jose, Maria', additional: '', family: 'Mueller', suffix: '' });
      expect(c.org).toBe('Acme; Ltd');
      expect(c.dept).toBe('Sales');
      expect(c.adr[0].street).toBe('Long Street 1 Apt 2');
      expect(c.adr[0].locality).toBe('Berlin');
      expect(c.groups).toEqual(['Friends', 'Work, Club']);
      expect(c.bday).toBe('1980-02-29');
      expect(c.id).toBe('abc-123');
    });
    it('keeps every TEL and EMAIL with its TYPE and drops VOICE and PREF noise', () => {
      const [c] = SC().vcard.read(CT.VCF30);
      expect(c.phones).toEqual([{ value: '+49 170 1234567', types: ['CELL'] }, { value: '+49 30 555 0100', types: ['WORK'] }]);
      expect(c.emails).toEqual([{ value: 'jose@example.com', types: ['WORK'] }]);
    });
    it('reads several cards and skips empty ones', () => {
      const text = CT.VCF30 + 'BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n' + 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Four\r\nTEL;TYPE=work:tel:+1-555-0199\r\nEND:VCARD\r\n';
      const list = SC().vcard.read(text);
      expect(list).toHaveLength(2);
      expect(list[1].fn).toBe('Four');
      expect(list[1].phones).toEqual([{ value: '+1-555-0199', types: ['WORK'] }]);
    });
  });

  describe('vCard 2.1 quoted-printable', () => {
    it('decodes UTF-8 bytes and soft line breaks', () => {
      const [c] = SC().vcard.read(CT.VCF21);
      expect(c.name.given).toBe('José');
      expect(c.name.family).toBe('Müller');
      expect(c.fn).toBe('José Müller');
      expect(c.note).toBe('Line one\nLine two = softbreak');
      expect(c.adr[0].street).toBe('Straße 5');
    });
    it('reads bare 2.1 type words (CELL, WORK, FAX) as types', () => {
      const [c] = SC().vcard.read(CT.VCF21);
      expect(c.phones).toEqual([{ value: '+49 170 1234567', types: ['CELL'] }, { value: '+49 30 9999', types: ['WORK', 'FAX'] }]);
      expect(c.emails).toEqual([{ value: 'jose@example.com', types: ['HOME'] }]);
    });
  });

  describe('Apple labels', () => {
    it('maps itemN.X-ABLabel to the TEL types', () => {
      const [c] = SC().vcard.read(CT.VCF_APPLE);
      expect(c.phones).toEqual([{ value: '+1 555 0100', types: ['CELL'] }, { value: '+1 555 0200', types: ['WORK'] }]);
      expect(c.groups).toEqual(['VIP']);
    });
  });

  describe('vCard 3.0 export', () => {
    const out = () => SC().vcard.write(CT.sample());
    it('uses CRLF only and ends every card with CRLF', () => {
      const s = out();
      expect(/[^\r]\n/.test(s)).toBeFalsy();
      expect(s.endsWith('END:VCARD\r\n')).toBeTruthy();
      expect(s.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBeTruthy();
    });
    it('keeps every line at 75 octets or fewer (folded lines start with a space)', () => {
      const lines = out().split('\r\n').filter((l) => l.length);
      for (const l of lines) expect(SC().text.octets(l)).toBeLessThanOrEqual(75);
      expect(lines.some((l) => l.startsWith(' '))).toBeTruthy();
    });
    it('never splits a UTF-8 character across folds', () => {
      const c = CT.make({ id: 'u', name: { given: 'é'.repeat(60) } });
      const s = SC().vcard.write([c]);
      const back = SC().vcard.read(s)[0];
      expect(back.name.given).toBe('é'.repeat(60));
    });
    it('writes N and FN always, with TEL;TYPE= and CATEGORIES', () => {
      const s = SC().vcard.write([CT.make({ id: 'n1', name: { given: 'A' }, phones: [{ value: '+1 555', types: ['CELL', 'HOME'] }], groups: ['G1', 'G,2'] })]);
      expect(s).toMatch(/^N:;A;;;\r\n/m);
      expect(s).toMatch(/^FN:A\r\n/m);
      expect(s).toMatch(/^TEL;TYPE=CELL,HOME:\+1 555\r\n/m);
      expect(s).toMatch(/^CATEGORIES:G1,G\\,2\r\n/m);
    });
    it('writes BDAY as YYYY-MM-DD and escapes the note', () => {
      const s = SC().vcard.write([CT.make({ id: 'b1', name: { given: 'B' }, bday: '1990-01-02', note: 'a;b\nc' })]);
      expect(s).toContain('BDAY:1990-01-02\r\n');
      expect(s).toContain('NOTE:a\\;b\\nc\r\n');
    });
  });

  describe('round trip', () => {
    it('import(export(x)) equals x', () => {
      const x = CT.sample();
      const back = SC().vcard.read(SC().vcard.write(x));
      expect(back).toHaveLength(x.length);
      for (let i = 0; i < x.length; i++) expect(back[i]).toEqual(x[i]);
    });
    it('a second export of the import is byte-identical', () => {
      const once = SC().vcard.write(CT.sample());
      expect(SC().vcard.write(SC().vcard.read(once))).toBe(once);
    });
  });
})();
