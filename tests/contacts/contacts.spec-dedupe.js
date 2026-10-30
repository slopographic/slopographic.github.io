/* Slop Contacts: duplicates (phone, e-mail, name plus organisation), merging, E.164 with a country, bulk fixes. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SC = () => window.SlopContacts;
  const ids = (groups) => groups.map((g) => g.map((c) => c.id));

  describe('duplicates', () => {
    it('finds duplicates by normalised phone digits (E.164 with the default country)', () => {
      const list = [
        CT.make({ id: 'p1', name: { given: 'Ann' }, phones: [{ value: '+44 7700 900123' }] }),
        CT.make({ id: 'p2', name: { given: 'Ann B' }, phones: [{ value: '07700-900-123' }] }),
        CT.make({ id: 'p3', name: { given: 'Other' }, phones: [{ value: '+44 20 7946 0000' }] }),
      ];
      expect(ids(SC().dedupe.findGroups(list, '44'))).toEqual([['p1', 'p2']]);
      // without a default country the national form does not match the international one
      expect(SC().dedupe.findGroups(list, '')).toHaveLength(0);
    });
    it('finds duplicates by normalised e-mail (case and spaces ignored)', () => {
      const list = [
        CT.make({ id: 'e1', name: { given: 'Ann' }, emails: [{ value: 'Ann@Example.com' }] }),
        CT.make({ id: 'e2', name: { given: 'Zoe' }, emails: [{ value: ' ann@example.COM ' }] }),
        CT.make({ id: 'e3', name: { given: 'Lou' }, emails: [{ value: 'lou@example.com' }] }),
      ];
      expect(ids(SC().dedupe.findGroups(list, ''))).toEqual([['e1', 'e2']]);
    });
    it('finds the same name plus organisation, and needs both', () => {
      const list = [
        CT.make({ id: 'n1', name: { given: 'Sam', family: 'Ko' }, org: 'Acme' }),
        CT.make({ id: 'n2', name: { given: 'sam', family: 'KO' }, org: ' acme ' }),
        CT.make({ id: 'n3', name: { given: 'Sam', family: 'Ko' } }),
      ];
      expect(ids(SC().dedupe.findGroups(list, ''))).toEqual([['n1', 'n2']]);
    });
    it('groups chain through shared keys (A with B by phone, B with C by e-mail)', () => {
      const list = [
        CT.make({ id: 'a', name: { given: 'A' }, phones: [{ value: '+1 555 010 0100' }] }),
        CT.make({ id: 'b', name: { given: 'B' }, phones: [{ value: '+1 555 010 0100' }], emails: [{ value: 'k@x.io' }] }),
        CT.make({ id: 'c', name: { given: 'C' }, emails: [{ value: 'K@x.io' }] }),
      ];
      expect(ids(SC().dedupe.findGroups(list, ''))).toEqual([['a', 'b', 'c']]);
    });
    it('auto-merges exact copies only', () => {
      const same = (id) => CT.make({ id, name: { given: 'Dup' }, phones: [{ value: '+1 555 0111', types: ['CELL'] }] });
      const list = [same('x1'), same('x2'), CT.make({ id: 'y', name: { given: 'Dup' }, org: 'Other', phones: [{ value: '+1 555 0999' }] })];
      const r = SC().dedupe.autoMergeExact(list, '');
      expect(r.merged).toBe(1);
      expect(r.list.map((c) => c.id)).toEqual(['x1', 'y']);
    });
  });

  describe('merge', () => {
    it('keeps every phone and e-mail, unions the types and groups, and keeps the richest name', () => {
      const a = CT.make({ id: 'm1', name: { given: 'Ann', family: 'Lee' }, phones: [{ value: '+44 7700 900123', types: ['CELL'] }],
        emails: [{ value: 'ann@example.com', types: ['HOME'] }], groups: ['Work'] });
      const b = CT.make({ id: 'm2', name: { given: 'Ann' }, phones: [{ value: '07700 900123', types: ['WORK'] }, { value: '020 7946 0000', types: ['WORK'] }],
        emails: [{ value: 'ANN@example.com', types: ['WORK'] }, { value: 'ann.lee@work.example', types: ['WORK'] }], groups: ['Club', 'Work'], org: 'Acme' });
      const m = SC().dedupe.mergeGroup([b, a], '44');
      expect(m.id).toBe('m2');
      expect(m.name.family).toBe('Lee');
      expect(m.org).toBe('Acme');
      expect(m.phones).toEqual([{ value: '+44 7700 900123', types: ['WORK', 'CELL'] }, { value: '020 7946 0000', types: ['WORK'] }]);
      expect(m.emails.map((e) => e.value)).toEqual(['ANN@example.com', 'ann.lee@work.example']);
      expect(m.emails[0].types).toEqual(['WORK', 'HOME']);
      expect(m.groups).toEqual(['Club', 'Work']);
    });
    it('applyMerges puts the merged contact where its first member was', () => {
      const list = [CT.make({ id: 'q1', name: { given: 'Q' }, emails: [{ value: 'q@x.io' }] }), CT.make({ id: 'z', name: { given: 'Z' } }),
        CT.make({ id: 'q2', name: { given: 'Q2' }, emails: [{ value: 'Q@x.io' }] })];
      const out = SC().dedupe.applyMerges(list, SC().dedupe.findGroups(list, ''), '');
      expect(out.map((c) => c.id)).toEqual(['q1', 'z']);
      expect(out[0].emails).toHaveLength(1);
    });
  });

  describe('E.164 with a chosen country', () => {
    it('turns a UK national number into +44 form', () => {
      expect(SC().phone.toE164('(07700) 900 123', '44')).toBe('+447700900123');
      expect(SC().phone.toE164('07700 900123', '+44')).toBe('+447700900123');
    });
    it('turns 00 prefixes and already-international numbers into +', () => {
      expect(SC().phone.toE164('0044 7700 900123', '44')).toBe('+447700900123');
      expect(SC().phone.toE164('+1 (555) 010-0100', '44')).toBe('+15550100100');
    });
    it('with no country chosen, keeps the number as typed', () => {
      expect(SC().phone.toE164('07700 900123', '')).toBe('07700 900123');
    });
    it('the cleanup applies the chosen country to every phone in scope', () => {
      const list = [CT.make({ id: 'c1', name: { given: 'C' }, phones: [{ value: '(07700) 900 123' }] }), CT.make({ id: 'c2', name: { given: 'D' }, phones: [{ value: '020 7946 0000' }] })];
      const r = SC().bulk.cleanup(list, new Set(['c1']), { e164: true, cc: '44' });
      expect(r.list[0].phones[0].value).toBe('+447700900123');
      expect(r.list[1].phones[0].value).toBe('020 7946 0000');
      expect(r.changed).toBe(1);
    });
  });

  describe('bulk fixes', () => {
    it('trims, collapses spaces, title-cases names (keeping particles) and lowercases e-mails', () => {
      const list = [CT.make({ id: 'b1', name: { given: '  anna   maria ', family: 'de la cruz' }, emails: [{ value: ' Anna@Example.COM ' }] })];
      const r = SC().bulk.cleanup(list, null, { trim: true, titleCase: true, lowerEmail: true });
      expect(r.list[0].name.given).toBe('Anna Maria');
      expect(r.list[0].name.family).toBe('De la Cruz');
      expect(r.list[0].emails[0].value).toBe('anna@example.com');
    });
    it('title case keeps McDonald and iPhone, and fixes ALL CAPS and O\'Neil', () => {
      const tc = SC().bulk.titleCase;
      expect(tc('MCDONALD')).toBe('Mcdonald');
      expect(tc('mcDonald')).toBe('mcDonald');
      expect(tc('jOHN iPhone van der Berg')).toBe('John iPhone van der Berg');
      expect(tc("o'neil")).toBe("O'Neil");
    });
    it('removes empty phones and e-mails', () => {
      const r = SC().bulk.cleanup([CT.make({ id: 'r1', name: { given: 'R' }, phones: [{ value: '   ' }, { value: '+1 555' }] })], null, { removeEmpty: true });
      expect(r.list[0].phones).toEqual([{ value: '+1 555', types: [] }]);
    });
    it('find and replace is plain text, optionally case-sensitive, and scoped', () => {
      const list = [CT.make({ id: 'f1', name: { given: 'Ann' }, org: 'Ann Corp' }), CT.make({ id: 'f2', name: { given: 'Ann' } })];
      const r = SC().bulk.findReplace(list, new Set(['f1']), { field: 'org', find: 'Ann', replace: 'Anne.$&' });
      expect(r.count).toBe(1);
      expect(r.list[0].org).toBe('Anne.$& Corp');
      expect(r.list[1].name.given).toBe('Ann');
      expect(SC().bulk.findReplace(list, null, { find: 'ann', matchCase: true }).count).toBe(0);
    });
    it('adds and removes a group on the selection only', () => {
      const list = [CT.make({ id: 'g1', name: { given: 'G' } }), CT.make({ id: 'g2', name: { given: 'H' }, groups: ['Work'] })];
      const add = SC().bulk.addGroup(list, new Set(['g1']), '  Clients ');
      expect(add.list[0].groups).toEqual(['Clients']);
      expect(add.list[1].groups).toEqual(['Work']);
      const rm = SC().bulk.removeGroup(add.list, null, 'Work');
      expect(rm.list[1].groups).toEqual([]);
      expect(rm.changed).toBe(1);
    });
  });
})();
