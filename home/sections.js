/* Homepage sections: the six sections in order, the placement map (SECTIONS, keyed by app id), the fallback for apps
 * the map does not name, the Print card, the file-type and tour facets. Classic script: window.SlopHomeSections.
 * An app may sit in more than one section: give SECTIONS[id] an array. Converter lines say what goes in and what comes out. */
(function () {
  'use strict';
  /* The profile's tone (shared/theme/theme.js): a plain build has no Experiments shelf (an experiment sits in its group's
   * section), neutral status labels (no label for a ready app, "Preview" for one still in development) and its own wording
   * (the i18n keys plain.<key>). */
  const PLAIN = !!(window.SlopTheme && window.SlopTheme.tone === 'plain');
  /* The iPhone/iPad app (shared/native-app.js): an App Store app shows no development stages (App Review 2.2: no beta or
   * demo look), so no status badges, no Status board (index.html marks it data-web-only) and no Experiments shelf. */
  const STORE = !!(window.SlopNative && window.SlopNative.isStoreApp && window.SlopNative.isStoreApp());
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
  /** The text for an i18n key in the chosen language: plain.<key> first in a plain build, then the key, then en. */
  function tr(key, en, vars) {
    const I = window.SlopI18n;
    if (!I || typeof I.t !== 'function') return fill(en, vars);
    if (PLAIN) { const p = I.t('plain.' + key, vars); if (p !== 'plain.' + key) return p; }
    const s = I.t(key, vars);
    return s === key ? fill(en, vars) : s;
  }
  const STATUS_EN = { live: 'Live', beta: 'Beta', building: 'In development' };
  /** The status words: on a card badge ('' = no badge) and in the status table. */
  const statusLabel = (status) => tr('status.' + status, STATUS_EN[status] || status);
  const badgeLabel = (status, always) => (STORE || (status === 'live' && (PLAIN || !always)) ? '' : statusLabel(status));
  const def = (id, title, desc, extra) => Object.assign({ id, title: tr('home.sec_' + id, title), desc: tr('home.sec_' + id + '_d', desc) }, extra);
  const SECTION_DEFS = [
    def('documents', 'Documents and PDF', 'Write, sheet, slide, read and sign. Files open and save on this device.'),
    def('converters', 'Converters', 'Each tool takes one kind of file in and gives another out. Nothing is uploaded.'),
    def('labels', 'Labels, print and QR', 'Barcode labels, QR codes and the print dialog that every app shares.'),
    def('business', 'Business', 'Slop 365: orders, invoices, customers, stock and the books, sharing one local drive.'),
    def('creative', 'Creative and media', 'Photo, vector, video, 3D and music tools for making things.'),
    def('tools', 'Tools and AI', 'Calculators, clocks, code, bytes, on-device AI and the Authenticator.'),
  ];
  /** Shown after the six, only when it has apps (an experiment no section names lands here). None in a plain build. */
  const EXPERIMENTS = def('experiments', 'Experiments', 'Playful extras. Try them, no promises.', { tiles: true });
  const SHELVES = PLAIN || STORE ? SECTION_DEFS : SECTION_DEFS.concat([EXPERIMENTS]);
  const cv = (key, en) => tr('home.cv_' + key, en);
  const TITLES = Object.fromEntries(SECTION_DEFS.concat([EXPERIMENTS]).map((d) => [d.id, d.title]));
  const FALLBACK = { business: 'business', creative: 'creative' };

  const SECTIONS = {
    docs: { section: 'documents', order: 1 },
    slides: { section: 'documents', order: 2 },
    tables: { section: 'documents', order: 3 },
    pdf: { section: 'documents', order: 4 },
    ocr: [{ section: 'documents', order: 5 }, { section: 'converters', order: 3, line: cv('ocr', 'Scanned images or PDFs in; text, Word or a searchable PDF out.') }],
    eml: { section: 'documents', order: 6 },
    html2pdf: [{ section: 'documents', order: 7 }, { section: 'converters', order: 2, line: cv('html2pdf', 'HTML files or pasted HTML in; a PDF with header and QR out.') }],
    notes: { section: 'documents', order: 8 },
    sheetview: [{ section: 'documents', order: 9 }, { section: 'converters', order: 7, line: cv('sheetview', 'XLSX, CSV or TSV in; a browsable, sortable table out.') }],
    paste: { section: 'documents', order: 10 },
    convert: { section: 'converters', order: 1, line: cv('convert', 'Images, PDFs, CSV, JSON or Markdown in; PNG, PDF, XLSX or JSON out.') },
    img3d: [{ section: 'converters', order: 4, line: cv('img3d', 'A picture in; an OBJ or GLB 3D model out.') }, { section: 'creative', order: 10 }],
    resize: { section: 'converters', order: 5, line: cv('resize', 'Pictures or videos in; resized files out, to a size or a file limit.') },
    upscale: { section: 'converters', order: 6, line: cv('upscale', 'Pictures or short videos in; 2x or 4x files out.') },
    contacts: [{ section: 'converters', order: 8, line: cv('contacts', 'vCard or CSV in; a cleaned address book out.') }, { section: 'business', order: 4 }],
    label: { section: 'labels', order: 1 },
    qr: { section: 'labels', order: 2 },
    orders: { section: 'business', order: 1 },
    invoices: { section: 'business', order: 2 },
    crm: { section: 'business', order: 3 },
    inventory: { section: 'business', order: 5 },
    ledger: { section: 'business', order: 6 },
    calendar: { section: 'business', order: 7 },
    todo: { section: 'business', order: 8 },
    reminders: { section: 'business', order: 9 },
    drive: { section: 'business', order: 10 },
    admin: { section: 'business', order: 11 },
    photoslop: { section: 'creative', order: 1 },
    vector: { section: 'creative', order: 2 },
    slopedit: { section: 'creative', order: 3 },
    cutout: { section: 'creative', order: 4 },
    remix: { section: 'creative', order: 5 },
    gallery: { section: 'creative', order: 6 },
    music: { section: 'creative', order: 7 },
    '3d': { section: 'creative', order: 8 },
    effects: { section: 'creative', order: 9 },
    calculator: { section: 'tools', order: 1 },
    time: { section: 'tools', order: 2 },
    hex: { section: 'tools', order: 3 },
    code: { section: 'tools', order: 4 },
    aitools: { section: 'tools', order: 5 },
    authenticator: { section: 'tools', order: 6 },
    // Not an app: the central print dialog, shown as a card that opens the first app that has it.
    print: { section: 'labels', order: 3 },
  };
  const PRINT = { id: 'print', kind: 'app', group: 'business', name: tr('home.print', 'Print'), path: 'html2pdf/', status: 'live', icon: 'doc', features: [],
    tagline: tr('home.print_d', 'The central print dialog: the same print look in every app. Try it in Slop HTML to PDF.') };

  /** Where an app sits: its map entries, or (for an app the map does not name) its old group, so it never disappears. */
  function placements(app) {
    const map = SECTIONS[app.id];
    if (map) return [].concat(map);
    // an experiment: the Experiments shelf, or in a plain build its group's section (creative when it has none)
    const section = app.kind === 'experiment' ? (PLAIN ? FALLBACK[app.group] || 'creative' : EXPERIMENTS.id) : FALLBACK[app.group] || 'business';
    return [{ section, order: 1000 }];
  }
  const titleOf = (id) => TITLES[id] || id;
  /** The file-type groups an app's accepted MIME types fall in (the finder's "File types" facet). */
  const TYPES = { any: 'Any file', images: 'Images', video: 'Video', audio: 'Audio', pdf: 'PDF', models: '3D models', data: 'Spreadsheets and data',
    office: 'Word and slides', email: 'Email', web: 'Web pages', contacts: 'Contacts', design: 'Design files', text: 'Text', other: 'Other', none: 'No upload' };
  const kind = (k) => tr('type.' + k, TYPES[k]);
  function typeKinds(accepts) {
    const out = new Set();
    for (const t of accepts || []) {
      if (t === '*') out.add(kind('any'));
      else if (t.startsWith('image/')) out.add(kind('images'));
      else if (t.startsWith('video/')) out.add(kind('video'));
      else if (t.startsWith('audio/')) out.add(kind('audio'));
      else if (t === 'application/pdf') out.add(kind('pdf'));
      else if (t.startsWith('model/')) out.add(kind('models'));
      else if (/spreadsheet|excel|csv|tab-separated|json/.test(t)) out.add(kind('data'));
      else if (/wordprocessing|presentation|opendocument\.text|powerpoint/.test(t)) out.add(kind('office'));
      else if (/rfc822|\.eml/.test(t)) out.add(kind('email'));
      else if (/html|\.htm/.test(t)) out.add(kind('web'));
      else if (/vcard/.test(t)) out.add(kind('contacts'));
      else if (/illustrator|photoshop|openraster|svg/.test(t)) out.add(kind('design'));
      else if (t.startsWith('text/')) out.add(kind('text'));
      else out.add(kind('other'));
    }
    return out.size ? [...out] : [kind('none')];
  }
  /** Apps with a guided tour: keep in step with TOURS in shared/tour/mount.js. */
  const TOUR_DIRS = new Set(['photoslop', 'slopvector', 'slopcut', 'remix', 'slopisolate', 'drive', 'orders', 'invoices', 'crm', 'calendar', 'todo', 'notes', 'paste', 'resize', 'upscale', 'aitools', '3d', 'img3d', 'effects', 'docs', 'slides', 'tables', 'label', 'gallery', 'hex', 'code']);

  window.SlopHomeSections = { PLAIN, STORE, SECTION_DEFS, EXPERIMENTS, SHELVES, SECTIONS, PRINT, TOUR_DIRS, placements, titleOf, typeKinds, tr, statusLabel, badgeLabel };
})();
