/* SlopSample, svenska: orden som exemplen görs av (shared/sample/rng.js beskriver filerna). Telefonnumren ligger i PTS
 * serier för fiktiv användning (08-465 004 xx, 031-390 06 xx, 040-628 04 xx, 0980-319 2xx, 070-174 06 xx), så inget
 * exempel ringer en verklig person; e-post och webbadresser slutar på .example. Priser i kronor (lo, hi). */
(function (g) {
  'use strict';
  const NS = g.SlopSample;
  if (!NS || !NS.addLocale) return;
  const two = (r, lo, hi) => String(r.int(lo, hi)).padStart(2, '0');
  NS.addLocale('sv', {
    name: 'Svenska',
    first: ['Anna', 'Erik', 'Maja', 'Lars', 'Elsa', 'Johan', 'Sara', 'Karl', 'Ebba', 'Oskar', 'Linnea', 'Nils', 'Ida', 'Gustav', 'Klara', 'Axel',
      'Saga', 'Viktor', 'Alva', 'Emil', 'Wilma', 'Hugo', 'Agnes', 'Leo', 'Freja', 'Amir', 'Leila', 'Samir', 'Ingrid', 'Mattias'],
    last: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Lindberg',
      'Lindqvist', 'Berg', 'Holm', 'Sandberg', 'Ek', 'Lund', 'Nyström', 'Åberg', 'Söderström', 'Hassan', 'Bergström', 'Wallin', 'Strand'],
    titles: [['Säljchef', 'Försäljning'], ['Säljare', 'Försäljning'], ['VD', ''], ['Grundare', ''], ['Kontorschef', 'Administration'],
      ['Driftansvarig', 'Drift'], ['Marknadschef', 'Marknad'], ['Grafisk formgivare', 'Design'], ['Utvecklare', 'Utveckling'],
      ['Projektledare', 'Projekt'], ['Ekonomichef', 'Ekonomi'], ['Redovisningsekonom', 'Ekonomi'], ['Kundansvarig', 'Kundtjänst'],
      ['Inköpare', 'Inköp'], ['Arkitekt', 'Design'], ['Konsult', '']],
    companyA: ['Nordljus', 'Björk', 'Fjäll', 'Granit', 'Lönn', 'Enbär', 'Glöd', 'Skiffer', 'Vide', 'Ekdal', 'Lärk', 'Havsbris', 'Tistel',
      'Gärdsmyg', 'Blå Dörren', 'Älvkant', 'Kopparbo', 'Sjöbod', 'Rönnbär', 'Solgård'],
    companyB: ['Studio', 'Verkstad', 'Design', 'Konsult', 'Bygg', 'Handel', 'Tryck', 'Kaffe', 'Snickeri', 'Partner', 'Labb', 'Förlag'],
    companyForm: ['AB', 'AB', 'AB', '& Co', 'HB'],
    streets: ['Storgatan', 'Kungsgatan', 'Drottninggatan', 'Sveavägen', 'Hamngatan', 'Kyrkogatan', 'Skolgatan', 'Järnvägsgatan', 'Torggatan',
      'Strandvägen', 'Västra Hamngatan', 'Ågatan', 'Bergsgatan', 'Industrivägen'],
    // [stad, postnummer (de tre första siffrorna, låg och hög), riktnummer för +46 (serierna för fiktiv användning)]
    cities: [['Stockholm', [111, 118], '8 465 004 '], ['Göteborg', [411, 417], '31 390 06 '], ['Malmö', [211, 217], '40 628 04 '], ['Kiruna', [981, 981], '980 319 2']],
    postcode: (r, span) => `${r.int(span[0], span[1])} ${two(r, 10, 99)}`,
    address: (no, street, city, post) => `${street} ${no}, ${post} ${city}`,
    phone: (r, prefix) => `+46 ${prefix}${two(r, 0, 99)}`,
    mobile: (r) => `+46 70 174 06 ${two(r, 5, 99)}`,
    priceScale: 10,
    taxRates: [2500, 2500, 2500, 1200, 600],
    products: [['Mässingsgångjärn', 'st', 3, 12], ['Hylla i ek', 'st', 25, 90], ['Servetter i linne', 'set', 12, 30], ['Keramikmugg', 'st', 6, 18],
      ['Vinkeljärn', 'st', 2, 9], ['Tygkasse', 'st', 8, 22], ['Ullfilt', 'st', 40, 120], ['Glasflaska 50 cl', 'st', 2, 6], ['Anteckningsbok A5', 'st', 4, 14],
      ['Skrivbordslampa', 'st', 30, 95], ['Kopieringspapper (kartong)', 'kartong', 18, 40], ['Kaffebönor 1 kg', 'påse', 14, 32], ['Packtejp', 'rulle', 2, 5]],
    services: [['Webbdesign', 'projekt', 900, 4500], ['Konsulttimme', 'tim', 70, 160], ['Installation', 'st', 80, 400], ['Supportavtal', 'år', 300, 1500],
      ['Frakt', 'st', 8, 45], ['Utbildningsdag', 'dag', 450, 1400], ['Logotyp', 'projekt', 300, 1800], ['Texter', 'tim', 45, 110],
      ['Fotografering', 'dag', 350, 1200], ['Webbhotell', 'mån', 10, 60], ['Bokföring', 'mån', 120, 600], ['Platsbesök', 'st', 90, 300]],
    notes: { quote: ['Offerten gäller i 30 dagar. Frakt tillkommer om inget annat anges.', 'Vi justerar gärna omfattningen.', 'Arbetet kan starta inom två veckor.'],
      invoice: ['Betala till bankgiro och ange fakturanumret.', 'Tack för förtroendet!', 'Betalningsvillkor 30 dagar netto.'],
      order: ['Lämnas i receptionen.', 'Ring före leverans.', 'Presentinslagning önskas.'],
      purchase: ['Leverans till bakre entrén.', 'Fakturan till ekonomi, tack.', 'Delleverans går bra.'] },
    cta: ['Boka ett samtal på 15 minuter', 'Se våra senaste uppdrag', 'Få en offert', 'Besök butiken'],
    legal: (company, r) => `${company}, org.nr ${r.int(550000, 559999)}-${r.int(1000, 9999)}, säte i Sverige.`,
    tasks: ['Ring {name} om offerten', 'Skicka avtalet till {company}', 'Påminn om faktura {n}', 'Boka lokalen', 'Beställ mer förpackningar',
      'Gör månadsrapporten', 'Förnya domänen', 'Uppdatera prislistan', 'Inventera lagret', 'Svara {name}'],
    events: ['Möte med {company}', 'Samtal med {name}', 'Platsbesök: {company}', 'Planering med teamet', 'Demo för {company}', 'Lunch med {name}'],
    places: ['Kontoret', 'Online', 'Hos kunden', 'Kaféet på hörnet', 'Mötesrum 2'],
    work: ['Designgranskning', 'Kundmöte', 'Utveckling', 'Research', 'Korrektur', 'Test', 'Planering', 'Bildbehandling'],
    projects: ['Ny webbplats', 'Vårkampanj', 'Butiksinredning', 'Grafisk profil', 'Ny katalog', 'Lansering av appen'],
    expenses: [['Kontorsmaterial', 'Kontor'], ['Tågbiljetter', 'Tåg'], ['Programvara', 'Mjukvara'], ['Kundlunch', 'Kök'],
      ['Bläckpatroner', 'Förbrukning'], ['Bud', 'Bud'], ['Mobilräkning', 'Mobil'], ['Drivmedel', 'Bränsle']],
    supplierWords: ['Snabb', 'Central', 'City', 'Express', 'Prima', 'Grön'],
    stages: ['lead', 'contacted', 'customer', 'customer'],
  });
})(typeof window !== 'undefined' ? window : globalThis);
