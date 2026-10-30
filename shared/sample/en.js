/* SlopSample, English: the words samples are made of (shared/sample/rng.js says how the files fit together). Addresses are
 * British; phone numbers are in Ofcom's ranges kept for drama (020 7946 0xxx, 0117 496 0xxx, 07700 900xxx…), so no sample
 * rings a real person; e-mail and web addresses end in .example (RFC 2606), which never reaches anyone.
 * Prices are in major units of the currency (lo, hi); the record maker scales them (priceScale) and makes minor units. */
(function (g) {
  'use strict';
  const NS = g.SlopSample;
  if (!NS || !NS.addLocale) return;
  NS.addLocale('en', {
    name: 'English',
    first: ['Alex', 'Sam', 'Priya', 'Tom', 'Grace', 'Oliver', 'Amelia', 'Kofi', 'Hannah', 'Daniel', 'Leila', 'James', 'Sophie', 'Marcus', 'Chloe',
      'Ethan', 'Isla', 'Noah', 'Maya', 'Lucas', 'Zara', 'Ben', 'Erin', 'Ravi', 'Freya', 'Owen', 'Nadia', 'Felix', 'Ruby', 'Jonas', 'Aisha', 'Callum'],
    last: ['Morgan', 'Patel', 'Hughes', 'Okafor', 'Bennett', 'Clarke', 'Shah', 'Turner', 'Ward', 'Fletcher', 'Ellis', 'Mensah', 'Reid', 'Harper',
      'Lawson', 'Brennan', 'Chen', 'Adeyemi', 'Foster', 'Murray', 'Doyle', 'Khan', 'Price', 'Sutton', 'Walsh', 'Hale', 'Barker', 'Lindqvist'],
    // [job title, department]
    titles: [['Sales manager', 'Sales'], ['Account executive', 'Sales'], ['Managing director', ''], ['Founder', ''], ['Office manager', 'Operations'],
      ['Operations lead', 'Operations'], ['Marketing manager', 'Marketing'], ['Brand designer', 'Design'], ['Senior developer', 'Engineering'],
      ['Project manager', 'Delivery'], ['Finance manager', 'Finance'], ['Bookkeeper', 'Finance'], ['Customer success lead', 'Support'],
      ['Head of partnerships', 'Business development'], ['Studio director', ''], ['Architect', 'Design'], ['Consultant', ''], ['Buyer', 'Purchasing']],
    companyA: ['Northwind', 'Harbour', 'Copper', 'Granite', 'Maple', 'Juniper', 'Ember', 'Slate', 'Willow', 'Quarry', 'Atlas', 'Cedar', 'Lumen',
      'Kestrel', 'Orchard', 'Bramble', 'Fable', 'Larch', 'Meridian', 'Saltmarsh', 'Thistle', 'Wren', 'Blue Door', 'Riverside'],
    companyB: ['Studio', 'Works', 'Supply', 'Labs', 'Goods', 'Trading', 'Design', 'Press', 'Foundry', 'Consulting', 'Partners', 'Joinery', 'Coffee', 'Print'],
    companyForm: ['Ltd', 'Ltd', '& Co', 'Ltd', ''],
    streets: ['Harbour Street', 'King Street', 'Victoria Road', 'Mill Lane', 'Church Street', 'Station Road', 'Queen Square', 'Park Row',
      'Bridge Street', 'Market Place', 'Castle Street', 'Wharf Road', 'Orchard Way', 'Union Street'],
    // [city, postcode area letters, phone prefix for +44 (the drama ranges)]
    cities: [['London', 'EC1', '20 7946 0'], ['Bristol', 'BS1', '117 496 0'], ['Manchester', 'M1', '161 496 0'], ['Leeds', 'LS1', '113 496 0'],
      ['Edinburgh', 'EH1', '131 496 0'], ['Glasgow', 'G1', '141 496 0'], ['Cardiff', 'CF10', '29 2018 0'], ['Sheffield', 'S1', '114 496 0']],
    postcode: (r, area) => `${area} ${r.int(1, 9)}${r.pick('ABDEFGHJLNPQRSTUWXYZ'.split(''))}${r.pick('ABDEFGHJLNPQRSTUWXYZ'.split(''))}`,
    address: (no, street, city, post) => `${no} ${street}, ${city} ${post}`,
    phone: (r, prefix) => `+44 ${prefix}${String(r.int(0, 999)).padStart(3, '0')}`,
    mobile: (r) => `+44 7700 900${String(r.int(0, 999)).padStart(3, '0')}`,
    priceScale: 1,
    taxRates: [2000, 2000, 2000, 500, 0],
    // [name, unit, lo, hi] in major units
    products: [['Brass hinge', 'each', 3, 12], ['Oak shelf', 'each', 25, 90], ['Linen napkin set', 'set', 12, 30], ['Ceramic mug', 'each', 6, 18],
      ['Steel bracket', 'each', 2, 9], ['Canvas tote bag', 'each', 8, 22], ['Wool throw', 'each', 40, 120], ['Glass bottle 500 ml', 'each', 2, 6],
      ['Notebook A5', 'each', 4, 14], ['Desk lamp', 'each', 30, 95], ['Printer paper (box)', 'box', 18, 40], ['Coffee beans 1 kg', 'bag', 14, 32],
      ['Packing tape', 'roll', 2, 5], ['Storage crate', 'each', 9, 28]],
    services: [['Website design', 'project', 900, 4500], ['Consulting', 'hour', 70, 160], ['Installation', 'each', 80, 400], ['Annual support plan', 'year', 300, 1500],
      ['Delivery', 'each', 8, 45], ['Training workshop', 'day', 450, 1400], ['Logo design', 'project', 300, 1800], ['Copywriting', 'hour', 45, 110],
      ['Photography', 'day', 350, 1200], ['Hosting', 'month', 10, 60], ['Bookkeeping', 'month', 120, 600], ['Site survey', 'each', 90, 300]],
    notes: { quote: ['Valid for 30 days. Prices exclude delivery unless listed.', 'Happy to adjust the scope: just ask.', 'Work can start within two weeks of acceptance.'],
      invoice: ['Payment by bank transfer, please quote the invoice number.', 'Thank you for your business.', 'Net 30.'],
      order: ['Please leave at reception.', 'Call before delivery.', 'Gift wrap requested.'],
      purchase: ['Deliver to the back entrance.', 'Invoice to accounts, please.', 'Part delivery is fine.'] },
    cta: ['Book a 15-minute call', 'See our latest work', 'Get a free quote', 'Read our customer stories', 'Visit the shop'],
    legal: (company, r) => `${company}, registered in England and Wales, company number ${String(r.int(1000000, 9999999)).padStart(8, '0')}.`,
    tasks: ['Call {name} about the quote', 'Send the contract to {company}', 'Follow up on invoice {n}', 'Book the venue', 'Order more packaging',
      'Prepare the monthly report', 'Renew the domain', 'Update the price list', 'Check the stock count', 'Reply to {name}'],
    events: ['Meeting with {company}', 'Call with {name}', 'Site visit: {company}', 'Team planning', 'Product demo for {company}', 'Lunch with {name}'],
    places: ['Office', 'Online', 'Client site', 'Café on the corner', 'Meeting room 2'],
    work: ['Design review', 'Client meeting', 'Development', 'Research', 'Copy edits', 'Testing', 'Planning', 'Photo editing'],
    projects: ['Website refresh', 'Spring campaign', 'Shop fit-out', 'Brand guidelines', 'New catalogue', 'App launch'],
    // [what was bought, the kind of supplier]
    expenses: [['Office supplies', 'Stationers'], ['Train tickets', 'Rail'], ['Software subscription', 'Software'], ['Client lunch', 'Kitchen'],
      ['Printer ink', 'Supplies'], ['Courier', 'Couriers'], ['Phone bill', 'Mobile'], ['Fuel', 'Fuel']],
    supplierWords: ['Swift', 'Central', 'City', 'Express', 'Prime', 'Greenline'],
    stages: ['lead', 'contacted', 'customer', 'customer'],
  });
})(typeof window !== 'undefined' ? window : globalThis);
