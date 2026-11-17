/* Slop Contacts: CSV import (Google, Outlook, Apple-style headers) and CSV export headers. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SC = () => window.SlopContacts;
  const headerOf = (s) => s.replace(/^﻿/, '').split('\r\n')[0];

  describe('CSV import', () => {
    it('reads the Google header: names, typed phones, labels as groups, quoted commas', () => {
      const r = SC().csv.read(CT.CSV_GOOGLE);
      expect(r.variant).toBe('Google');
      const [c] = r.contacts;
      expect(c.fn).toBe('Ann Lee');
      expect(c.name.given).toBe('Ann');
      expect(c.name.family).toBe('Lee');
      expect(c.org).toBe('Acme');
      expect(c.title).toBe('CTO');
      expect(c.phones).toEqual([{ value: '+44 7700 900123', types: ['CELL'] }, { value: '(020) 7946 0000', types: ['CUSTOM'] }]);
      expect(c.emails).toEqual([{ value: 'ann@example.com', types: ['HOME'] }]);
      expect(c.groups).toEqual(['Friends']);
      expect(c.note).toBe('Hi');
    });
    it('reads Outlook fixed columns: Business Phone is WORK, Mobile Phone CELL, Categories split on semicolons', () => {
      const r = SC().csv.read(CT.CSV_OUTLOOK);
      expect(r.variant).toBe('Outlook');
      const [c] = r.contacts;
      expect(c.name.prefix).toBe('Dr.');
      expect(c.org).toBe('Globex');
      expect(c.phones).toEqual([{ value: '555-0111', types: ['WORK'] }, { value: '555-0122', types: ['CELL'] }]);
      expect(c.emails).toEqual([{ value: 'bob@globex.com', types: [] }]);
      expect(c.bday).toBe('1985-03-07');
      expect(c.groups).toEqual(['Client', 'VIP']);
    });
    it('reads Apple-style headers (Phone (mobile), Email (home))', () => {
      const text = 'First Name,Last Name,Organization,Phone (mobile),Email (home)\r\nCara,Ng,Initech,+61 400 111 222,cara@example.com\r\n';
      const r = SC().csv.read(text);
      expect(r.variant).toBe('Apple');
      expect(r.contacts[0].phones).toEqual([{ value: '+61 400 111 222', types: ['CELL'] }]);
      expect(r.contacts[0].emails).toEqual([{ value: 'cara@example.com', types: ['HOME'] }]);
    });
    it('keeps line breaks inside quoted fields and doubled quotes', () => {
      const r = SC().csv.read('Name,Notes\r\n"Q ""Quoted"" Name","line one\r\nline two"\r\n');
      expect(r.contacts[0].fn).toBe('Q "Quoted" Name');
      expect(r.contacts[0].note).toBe('line one\nline two');
    });
    it('reads semicolon-delimited CSV', () => {
      const r = SC().csv.read('Given Name;Family Name;Phone 1 - Value\r\nEva;Lind;+46 70 123 45 67\r\n');
      expect(r.contacts[0].name.given).toBe('Eva');
      expect(r.contacts[0].phones[0].value).toBe('+46 70 123 45 67');
    });
  });

  describe('CSV export headers', () => {
    it('Google layout starts with the Google columns and a BOM', () => {
      const s = SC().csv.googleCsv(CT.sample());
      expect(s.charCodeAt(0)).toBe(0xfeff);
      expect(headerOf(s)).toMatch(/^Name,Given Name,Additional Name,Family Name,Name Prefix,Name Suffix,Birthday,Notes,Website 1 - Value,Organization 1 - Name,Organization 1 - Department,Organization 1 - Title,Group Membership,Phone 1 - Type,Phone 1 - Value,/);
    });
    it('Outlook layout has the Outlook header in order', () => {
      expect(headerOf(SC().csv.outlookCsv(CT.sample()))).toBe(SC().csv.OUTLOOK_HEAD.join(','));
      expect(SC().csv.OUTLOOK_HEAD[0]).toBe('First Name');
    });
    it('Google export writes the groups as "* name" joined by " ::: "', () => {
      const c = CT.make({ id: 'g', name: { given: 'G' }, groups: ['Work', 'Club'] });
      expect(SC().csv.googleCsv([c])).toContain(',* Work ::: * Club,');
    });
    it('a Google export imports back with the same names and phones', () => {
      const x = [CT.make({ id: 'r1', name: { given: 'Rita', family: 'Ro' }, phones: [{ value: '+1 555 0101', types: ['CELL'] }, { value: '+1 555 0102', types: ['HOME', 'FAX'] }] })];
      const back = SC().csv.read(SC().csv.googleCsv(x)).contacts;
      expect(back[0].fn).toBe('Rita Ro');
      expect(back[0].phones).toEqual(x[0].phones);
    });
  });
})();
