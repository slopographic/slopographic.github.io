/* Search data for the homepage finder and the corner dock search (shared/spotlight): the keywords people search for, and
 * a longer description, per app id. Every app in shared/apps.js needs an entry here and a description in the ui tables,
 * 'ui.appdesc.<id>' ('-' in an id written '_') in shared/i18n/ui/<code>/shell2.js (tests/node/app-search.test.mjs fails
 * otherwise). Keywords are matched like the name and tagline, so write the words someone would type: the job, the file
 * type, the old product name. Classic script: sets window.SLOP_APP_SEARCH = { [id]: { desc, keywords: [] } }, where desc
 * reads the chosen language each time (empty without SlopI18n), and window.slopAppDesc(id). */
(function () {
  'use strict';
  /** The app's long description in the chosen language: 'ui.appdesc.<id>', or '' when the page has no SlopI18n. */
  const desc = (id) => {
    const I = window.SlopI18n, k = 'ui.appdesc.' + id.replace(/-/g, '_');
    return I && I.has(k) ? I.t(k) : '';
  };
  window.slopAppDesc = desc;
  const KEYWORDS = {
    photoslop: ['photo', 'photoshop', 'image editor', 'retouch', 'layers', 'psd', 'filters', 'paint'],
    vector: ['illustrator', 'svg', 'logo', 'draw', 'vector graphics', 'icon', 'pen tool', 'shapes'],
    pdf: ['pdf', 'merge pdf', 'split pdf', 'sign', 'signature', 'watermark', 'compress', 'form'],
    label: ['label', 'barcode', 'sticker', 'zebra', 'zpl', 'thermal', 'print labels', 'gs1'],
    cutout: ['background remover', 'remove background', 'bulk background remover', 'batch background removal', 'transparent png', 'white background', 'cutout', 'isolate', 'remove bg'],
    aitools: ['ai', 'ocr', 'speech to text', 'transcribe', 'denoise', 'tags', 'portrait blur', 'subtitles'],
    ocr: ['ocr', 'scan', 'pdf', 'text recognition', 'extract text', 'searchable pdf', 'image to text', 'read text'],
    html2pdf: ['html to pdf', 'html', 'pdf', 'web page to pdf', 'print', 'convert', 'header', 'qr'],
    clean: ['exif', 'metadata', 'gps', 'privacy', 'strip', 'photo location', 'clean photo', 'scrub'],
    ai: ['chat', 'llm', 'assistant', 'chatbot', 'local ai', 'webgpu', 'offline ai', 'model'],
    docs: ['word', 'document', 'docx', 'letter', 'writer', 'report', 'google docs', 'markdown'],
    tables: ['excel', 'spreadsheet', 'xlsx', 'formulas', 'csv', 'pivot', 'google sheets', 'chart'],
    slides: ['powerpoint', 'presentation', 'pptx', 'deck', 'slides', 'keynote', 'slideshow', 'pitch', 'pdf', 'presenter view'],
    press: ['indesign', 'layout', 'desktop publishing', 'brochure', 'magazine', 'print layout', 'booklet', 'publishing'],
    remix: ['random edit', 'video remix', 'montage', 'reel', 'shorts', 'clips', 'slideshow video', 'edit'],
    slopedit: ['video editor', 'slop cut', 'video', 'timeline', 'trim', 'mp4', 'movie', 'cut video'],
    resize: ['resize', 'image size', 'compress image', 'scale', 'crop', 'thumbnail', 'instagram size', 'file size'],
    upscale: ['upscale', 'enlarge', 'bigger image', 'super resolution', 'upscaling', 'sharpen', 'enhance', 'esrgan'],
    reports: ['reports', 'profit', 'profit and loss', 'unpaid invoices', 'receivables', 'leads by stage', 'follow ups', 'vat', 'summary', 'analytics'],
    contacts: ['contacts', 'vcard', 'address book', 'vcf', 'csv', 'duplicates', 'import contacts', 'addresses'],
    inventory: ['stock', 'inventory', 'barcode', 'warehouse', 'products', 'reorder', 'sku', 'scanner'],
    orders: ['orders', 'sales orders', 'fulfilment', 'purchase', 'sales', 'customers', 'quote', 'shipping'],
    quotes: ['quotes', 'quote', 'estimate', 'estimates', 'proposal', 'quotation', 'bid', 'pricing'],
    purchases: ['purchase order', 'purchasing', 'po', 'suppliers', 'vendors', 'procurement', 'receiving', 'buying'],
    timesheets: ['timesheet', 'time tracking', 'timer', 'hours', 'billable hours', 'stopwatch', 'freelance', 'projects'],
    expenses: ['expenses', 'expense', 'receipts', 'bills', 'spending', 'costs', 'suppliers', 'tax reclaim', 'bookkeeping'],
    invoices: ['invoice', 'invoices', 'billing', 'bill', 'payments', 'receipts', 'overdue', 'accounts receivable'],
    notes: ['notes', 'notebook', 'markdown', 'journal', 'memo', 'write notes', 'tags', 'onenote'],
    paste: ['pastebin', 'paste', 'share text', 'share code', 'snippet', 'share link', 'gist', 'highlight'],
    effects: ['motion graphics', 'animation', 'keyframes', 'after effects', 'glow', 'glitch', 'motion design', 'effects'],
    img3d: ['3d', 'depth', 'picture to 3d', 'image to 3d', 'height map', 'model', 'glb', 'obj'],
    sheetview: ['spreadsheet viewer', 'excel viewer', 'csv viewer', 'open xlsx', 'sheets', 'tsv', 'view csv', 'table viewer'],
    hex: ['hex', 'hex editor', 'bytes', 'binary', 'ascii', 'debug file', 'raw file', 'offset'],
    eml: ['eml', 'email', 'mail', 'message', 'outlook', 'pdf', 'print email', 'attachments'],
    checksum: ['checksum', 'hash', 'sha256', 'sha-256', 'sha1', 'verify', 'integrity', 'file hash'],
    diff: ['diff', 'compare', 'difference', 'text compare', 'file compare', 'pdf compare', 'image compare', 'json diff', 'csv diff', 'patch'],
    nodes: ['node', 'graph', 'calculator', 'formula', 'spreadsheet', 'variables', 'wire', 'flow', 'live'],
    signature: ['email signature', 'signature generator', 'gmail signature', 'outlook signature', 'apple mail signature', 'html signature', 'business signature', 'email footer'],
    transcribe: ['transcribe', 'transcription', 'speech to text', 'voice to text', 'audio to text', 'mp3 to text', 'dictation', 'subtitles', 'srt', 'meeting notes'],
    recorder: ['screen recorder', 'record screen', 'screen capture', 'webcam recorder', 'voice recorder', 'loom', 'screencast', 'record tab'],
    sorter: ['photo sorter', 'image sorter', 'swipe photos', 'tinder for photos', 'cull photos', 'keep or delete', 'pick best photos', 'tag photos'],
    serials: ['serial', 'serial number', 'cisco', 'inventory', 'count', 'photos', 'ocr', 'asset', 'label', 'quantity'],
    qr: ['qr', 'qr code', 'barcode', 'wifi', 'wi-fi', 'vcard', 'link code', 'generate'],
    colors: ['color picker', 'colour picker', 'palette', 'eyedropper', 'contrast checker', 'wcag', 'hex to rgb', 'oklch', 'swatches', 'tailwind colors'],
    fontcreator: ['font maker', 'font creator', 'make a font', 'handwriting font', 'typeface', 'glyph editor', 'ttf', 'woff2', 'fontforge', 'kerning'],
    scan: ['scanner', 'document scanner', 'scan to pdf', 'photo to pdf', 'camera scanner', 'scan document', 'receipt scan', 'heic to pdf', 'crop document', 'black and white'],
    workflows: ['workflow', 'batch', 'automation', 'pipeline', 'macro', 'chain', 'bulk edit', 'actions'],
    convert: ['convert', 'converter', 'image converter', 'pdf to png', 'png to jpg', 'webp', 'csv to json', 'base64'],
    calculator: ['calculator', 'maths', 'math', 'units', 'currency', 'percent', 'tape', 'date calculator'],
    time: ['time zone', 'clock', 'world clock', 'meeting planner', 'timer', 'stopwatch', 'timezone', 'schedule'],
    crm: ['crm', 'customers', 'leads', 'pipeline', 'sales', 'follow up', 'contacts', 'clients'],
    calendar: ['calendar', 'events', 'meetings', 'ics', 'schedule', 'appointments', 'agenda', 'reminders'],
    todo: ['to-do', 'todo', 'tasks', 'checklist', 'lists', 'due dates', 'to do list', 'jobs'],
    projects: ['project management', 'kanban', 'gantt', 'board', 'timeline', 'tasks', 'trello', 'planner', 'dependencies'],
    reminders: ['reminders', 'alerts', 'notifications', 'snooze', 'timeline', 'due', 'nudge', 'alarm'],
    ledger: ['ledger', 'accounts', 'bookkeeping', 'double entry', 'trial balance', 'journal', 'accounting', 'gl'],
    admin: ['admin', 'settings', 'backup', 'restore', 'company profile', 'numbering', 'reset', 'setup'],
    drive: ['drive', 'files', 'file manager', 'storage', 'backup', 'duplicates', 'folders', 'explorer'],
    code: ['code', 'editor', 'ide', 'text editor', 'javascript', 'python', 'html editor', 'programming'],
    gallery: ['gallery', 'photos', 'library', 'albums', 'photo viewer', 'duplicates', 'pictures', 'favourites'],
    '3d': ['3d', '3d editor', 'model', 'blender', 'render', 'scene', 'obj', 'gltf'],
    music: ['music', 'audio', 'player', 'mp3', 'playlist', 'songs', 'listen', 'itunes'],
    authenticator: ['authenticator', 'ai detector', 'detector', 'certificate', 'slop', 'text check', 'fun', 'verify'],
    watermark: ['watermark', 'logo', 'bulk', 'batch', 'stamp', 'copyright', 'images', 'zip'],
    'paint-classic': ['paint', 'ms paint', 'classic', 'retro', '1998', 'drawing', 'pixels', 'nostalgia'],
  };
  const out = {};
  for (const id of Object.keys(KEYWORDS)) out[id] = Object.freeze({ get desc() { return desc(id); }, keywords: KEYWORDS[id] });
  window.SLOP_APP_SEARCH = Object.freeze(out);
})();
