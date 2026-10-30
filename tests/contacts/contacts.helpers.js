/* Slop Contacts test fixtures and helpers. Exposes window.CT. The core scripts are loaded by app.test.html,
 * so window.SlopContacts is the library the real app uses. */
(function () {
  'use strict';
  const BS = '\\';
  const CT = window.CT = {};
  CT.SC = () => window.SlopContacts;

  /** vCard 3.0 with folding, escaped commas, semicolons and newlines, several TEL/EMAIL/ADR with TYPE. */
  CT.VCF30 = [
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Mueller;Jose' + BS + ', Maria;;Dr.;', 'FN:Dr. Jose' + BS + ', Maria Mueller',
    'ORG:Acme' + BS + '; Ltd;Sales', 'TITLE:Head of sales', 'TEL;TYPE=CELL:+49 170 1234567', 'TEL;TYPE=WORK,VOICE:+49 30 555 0100',
    'EMAIL;TYPE=WORK:jose@example.com', 'ADR;TYPE=HOME:;;Long Street 1' + BS + 'nApt 2;Berlin;;10115;Germany',
    'BDAY:1980-02-29', 'NOTE:Line one' + BS + 'nline two' + BS + ', with a comma' + BS + '; and a backslash ' + BS + BS + ' end',
    '  this continues the note (folded)', 'CATEGORIES:Friends,Work' + BS + ', Club', 'UID:abc-123', 'END:VCARD',
  ].join('\r\n') + '\r\n';

  /** vCard 2.1 with quoted-printable names, a QP note with a soft break, and bare TYPE words. */
  CT.VCF21 = [
    'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;Jos=C3=A9;;;',
    'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Jos=C3=A9 M=C3=BCller',
    'NOTE;ENCODING=QUOTED-PRINTABLE:Line one=0D=0ALine two =3D soft=', 'break',
    'TEL;CELL;VOICE:+49 170 1234567', 'TEL;WORK;FAX:+49 30 9999', 'EMAIL;INTERNET;HOME:jose@example.com',
    'ADR;HOME;ENCODING=QUOTED-PRINTABLE:;;Stra=C3=9Fe 5;Berlin;;10115;Deutschland', 'END:VCARD',
  ].join('\r\n') + '\r\n';

  /** Apple writes its labels as itemN.X-ABLabel. */
  CT.VCF_APPLE = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Apple Person', 'N:Person;Apple;;;', 'item1.TEL:+1 555 0100',
    'item1.X-ABLabel:_$!<Mobile>!$_', 'item2.TEL:+1 555 0200', 'item2.X-ABLabel:_$!<Work>!$_', 'CATEGORIES:VIP', 'END:VCARD'].join('\r\n') + '\r\n';

  CT.CSV_GOOGLE = 'Name,Given Name,Family Name,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Phone 2 - Type,Phone 2 - Value,' +
    'Organization 1 - Name,Organization 1 - Title,Labels,Notes\r\n' +
    '"Ann Lee",Ann,Lee,Home,ann@example.com,Mobile,"+44 7700 900123",* Custom,"(020) 7946 0000",Acme,CTO,"* myContacts ::: Friends",Hi\r\n';
  CT.CSV_OUTLOOK = 'First Name,Last Name,Title,Company,Job Title,Business Phone,Mobile Phone,E-mail Address,Birthday,Categories\r\n' +
    'Bob,Ray,Dr.,Globex,Engineer,555-0111,555-0122,bob@globex.com,03/07/1985,Client;VIP\r\n';

  /** A plain contact (already normalised) for export tests. */
  CT.make = (over) => CT.SC().model.normalise(Object.assign(CT.SC().model.blank(), over));

  /** The sample list: everything the parsers can give, plus some edge values. */
  CT.sample = () => {
    const SC = CT.SC();
    const a = SC.vcard.read(CT.VCF30), b = SC.vcard.read(CT.VCF21);
    const c = CT.make({ id: 'x-1', name: { given: 'Lone', family: 'Star' }, bday: '--03-14', url: 'https://example.com/lone',
      emails: [{ value: 'lone@example.com', types: ['HOME', 'WORK'] }], groups: ['Club'], note: 'Tab\tand, comma; semi' });
    return [...a, ...b, c];
  };

  /** Removes every live customer from the shared store (orders and invoices stay; tests use their own names). */
  CT.resetCustomers = async () => {
    try { localStorage.removeItem('slop-contacts.mode'); } catch (e) { /* blocked */ } // the card's mode is per device
    const r = await window.SlopData.store.list('customers');
    for (const c of r.value || []) await window.SlopData.store.remove('customers', c.id);
  };
  /** Writes customer records into the shared store, as the CRM and Orders apps do. Returns the saved records. */
  CT.seed = async (recs) => {
    const out = [];
    for (const rec of recs) {
      const r = await window.SlopData.store.put('customers', { stage: 'lead', ...rec });
      if (!r.ok) throw new Error(`seed failed: ${r.message}`);
      out.push(r.value);
    }
    return out;
  };
  CT.file = (text, name, type) => new File([text], name, { type: type || '' });
})();
