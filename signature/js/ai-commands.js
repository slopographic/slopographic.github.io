/* Slop Signature for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (js/app.js). An email signature is the form's state (model.js FIELDS and STYLE); every command fills
 * the form through SlopSignature.form.fill and redraws through app.render, so the page, the copy and the download all show
 * the same signature. Pictures come from Slop Drive or this site (shared/commands/sources.js) and are kept inside the
 * signature, as the "picture from this device" button does. random_signature (a seeded sample, js/sample.js), make_logo
 * (js/logo.js) and copy_signature (js/copy.js: a "Copy now" button when the browser wants a click). The checkpoint is the state before. */
(function (g) {
  'use strict';
  const C = g.SlopCmd, NS = g.SlopSignature;
  if (!C || !NS || NS.ai) return;
  const M = NS.model, F = NS.form, A = NS.app;
  const FIELDS = M.FIELDS.map((f) => ({ name: f.key, type: 'string', maxLength: f.max, description: f.label }));
  const LINKS = Object.keys(M.SOCIAL);
  const STYLE = [{ name: 'template', type: 'enum', values: NS.templates.LIST.map((t) => t[0]), description: 'the layout' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'accent', type: 'color', description: 'the accent colour' }, { name: 'font', type: 'enum', options: F.FONTS.map(([v, l]) => [v, l]), description: 'the font' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'image_size', type: 'number', min: 32, max: 160, integer: true, description: 'picture size in px' }, { name: 'round', type: 'boolean', description: 'a round picture' }];   // i18n-ignore: the assistant's tools and replies (English: API)
  const list = [];
  const add = (tool, title, args, run, extra) => list.push(Object.assign({ id: 'signature.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args,
    run: (a) => run(a || g.SlopCmdArgs.defaults(args)) }, extra));

  /** The state with the given fields and style applied, filled into the form and drawn. */
  function apply(base, a) {
    const s = Object.assign({}, base);
    for (const f of M.FIELDS) if (a[f.key] != null) s[f.key] = String(a[f.key]);
    if (a.template) s.template = a.template;
    if (a.accent) s.accent = a.accent;
    if (a.font) s.font = a.font;
    if (a.image_size != null) s.imageSize = a.image_size;
    if (a.round != null) s.round = a.round;
    F.fill(s); A.render();
    const probs = M.problems(A.state);
    return probs.length ? ' Check: ' + probs.map((p) => p.text).join('; ') + '.' : '';   // i18n-ignore: the assistant's tools and replies (English: API)
  }
  const summary = () => { const s = M.clean(A.state); return [s.name, s.title, s.company].filter(Boolean).join(', ') || 'no name yet'; };   // i18n-ignore: the assistant's tools and replies (English: API)

  add('new_signature', 'New signature', FIELDS.concat(STYLE), (a) => { const note = apply(M.blank(), a); return `Made a new signature (${summary()}).${note}`; },   // i18n-ignore: the assistant's tools and replies (English: API)
    { description: 'Start a new email signature from your details (name, title, company, contact, links) and a template.' });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('set_fields', 'Change signature details', FIELDS, (a) => { const note = apply(A.state, a); return `Changed the details (${summary()}).${note}`; });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('set_style', 'Change signature style', STYLE, (a) => { apply(A.state, a); const s = M.clean(A.state); return `Template ${s.template}, colour ${s.accent}.`; });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('add_links', 'Add social links', [{ name: 'links', type: 'object', required: true, description: `addresses by network: ${LINKS.join(', ')}` }],   // i18n-ignore: the assistant's tools and replies (English: API)
    (a) => {
      const bad = Object.keys(a.links).filter((k) => !LINKS.includes(k));
      if (bad.length) throw new Error(`Unknown network ${bad.join(', ')}; use ${LINKS.join(', ')}`);
      const note = apply(A.state, a.links);
      return `${M.clean(A.state).socials.length} social links in the signature.${note}`;
    });
  let srcP = null;
  const sources = () => (g.SlopCmdSources ? Promise.resolve() : (srcP = srcP || new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: new URL('../shared/commands/sources.js', location.href).href, onload: res, onerror: () => { srcP = null; rej(new Error('Could not load sources.js')); } })))));
  add('add_picture', 'Add a logo or photo', [{ name: 'file', type: 'string', maxLength: 300, description: 'a picture in Slop Drive (name or id)' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'url', type: 'string', maxLength: 2000, description: 'or a web address of the picture (mail programs load it), or a picture on this site' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'image_size', type: 'number', min: 32, max: 160, integer: true }, { name: 'round', type: 'boolean' }],
  async (a) => {
    let image;
    if (a.url && /^https?:/i.test(a.url) && new URL(a.url).origin !== location.origin) image = a.url;
    else {
      await sources();
      const p = await g.SlopCmdSources.picture({ file: a.file, url: a.url });
      const k = Math.min(1, 240 / p.w), c = document.createElement('canvas'), im = new Image();
      im.src = p.dataUrl; await im.decode();
      c.width = Math.max(1, Math.round(p.w * k)); c.height = Math.max(1, Math.round(p.h * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      image = c.toDataURL('image/png');
    }
    const note = apply(A.state, { image, image_size: a.image_size, round: a.round });
    return `Added the picture${image.startsWith('data:') ? ' (kept inside the signature: Gmail does not show those, use a web address for Gmail)' : ''}.${note}`;   // i18n-ignore: the assistant's tools and replies (English: API)
  });
  add('export_signature', 'Export the signature', [{ name: 'format', type: 'enum', values: ['html', 'txt'], default: 'html' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const cur = A.current;
    if (!cur.html) throw new Error('The signature is empty: give a name first');
    const s = M.clean(A.state), stem = (s.name || 'signature').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signature';
    const name = `${stem}-signature.${a.format}`;
    const blob = a.format === 'txt' ? new Blob([cur.text], { type: 'text/plain' })
      : new Blob([`<!doctype html>\n<html><head><meta charset="utf-8"><title>${M.esc(s.name || 'Signature')}</title></head><body>\n${cur.html}\n</body></html>\n`], { type: 'text/html' });
    const out = [];
    if (a.to !== 'download') { await sources(); out.push(`Saved ${name} to Slop Drive (id ${await g.SlopCmdSources.put(blob, name, 'signature')})`); }   // i18n-ignore: the assistant's tools and replies (English: API)
    if (a.to !== 'drive') { g.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '. To use it, copy it into the mail program (Copy signature does that).';
  }, { description: 'Save the signature as an HTML page or plain text, to Slop Drive and/or a download.' });   // i18n-ignore: the assistant's tools and replies (English: API)

  add('random_signature', 'Make a random sample signature', [{ name: 'seed', type: 'string', maxLength: 40, description: 'the same seed makes the same signature; empty for a new one' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'locale', type: 'enum', values: ['en', 'sv'], description: 'English or Swedish names, addresses and phone numbers' }],   // i18n-ignore: the assistant's tools and replies (English: API)
  async (a) => { const r = await A.random(a.seed, a.locale); return `Made sample seed ${r.seed} (${summary()}, template ${r.state.template}, colour ${r.state.accent}${r.logo ? ', with a logo' : ''}). Give the seed again to get the same signature.`; },   // i18n-ignore: the assistant's tools and replies (English: API)
  { description: 'Fill the signature with a realistic random sample (person, company, template, colour, font, a logo) from a seed.' });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('make_logo', 'Make a logo', [{ name: 'text', type: 'string', maxLength: 24, description: 'the letters (a monogram, up to 3) or a short name (a wordmark); the company initials when empty' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'kind', type: 'enum', values: ['monogram', 'wordmark'], default: 'monogram' }, { name: 'shape', type: 'enum', values: NS.logo.SHAPES.map((x) => x[0]), description: 'the shape behind the letters' },   // i18n-ignore: the assistant's tools and replies (English: API)
    { name: 'seed', type: 'string', maxLength: 40, description: 'the look (style, typeface, mark); the same seed gives the same logo' },
    { name: 'accent', type: 'color', description: 'the colour; the signature colour when empty' }],
  async (a) => {
    if (a.accent) apply(A.state, { accent: a.accent });
    const o = await NS.logoUI.use({ text: a.text, kind: a.kind, shape: a.shape, seed: a.seed || g.SlopSample.newSeed() });
    return `Made a ${o.kind} logo "${o.text}" (${o.shape}, look ${o.seed}) and put it in the signature, kept inside it: Outlook and Apple Mail show it; for Gmail the logo needs a web address (Download logo gives the PNG to put on a website).`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }, { description: 'Draw a logo (initials or a short name in a circle, rounded square, square or no shape, in the signature colour) and use it as the signature picture.' });   // i18n-ignore: the assistant's tools and replies (English: API)
  add('copy_signature', 'Copy the signature', [{ name: 'client', type: 'enum', values: ['gmail', 'outlook', 'apple', 'html'], default: 'gmail', description: 'the mail program, or html for the code' }],   // i18n-ignore: the assistant's tools and replies (English: API)
  async (a) => {
    if (!A.current.html) throw new Error('The signature is empty: give a name first');
    const C2 = NS.copy, out = C2.output(a.client, M.clean(A.state)), ua = g.navigator.userActivation;
    const ok = ua && !ua.isActive ? false : await C2.copyFor(a.client);
    if (!ok) { C2.ask(a.client); return `The browser lets a page copy only after a click, so the page now shows a "Copy now" button: click it to copy for ${C2.CLIENTS[a.client]}.${out.dropped ? ' The picture is left out for Gmail (it needs a web address).' : ''}`; }   // i18n-ignore: the assistant's tools and replies (English: API)
    return `Copied for ${C2.CLIENTS[a.client]}.${out.notes.length ? ' ' + out.notes.join(' ') : ''}`;   // i18n-ignore: the assistant's tools and replies (English: API)
  }, { description: 'Copy the signature for Gmail, Outlook or Apple Mail (or the HTML code). Without a click the page shows a one-click "Copy now" button.' });   // i18n-ignore: the assistant's tools and replies (English: API)

  function state() {
    const s = M.clean(A.state);
    return { app: 'Slop Signature', fields: Object.fromEntries(M.FIELDS.map((f) => [f.key, f.key === 'image' && s.image.startsWith('data:') ? '(picture kept inside)' : s[f.key]])),   // i18n-ignore: the assistant's tools and replies (English: API)
      template: s.template, accent: s.accent, font: s.font, problems: M.problems(A.state).map((p) => p.text), empty: !A.current.html,
      sample_seed: g.document.getElementById('sgSeed').value || null, picture: NS.copy.pictureNote(s) || 'none' };
  }
  function checkpoint() {
    const snap = JSON.parse(JSON.stringify(A.state));
    return () => { F.fill(snap); A.render(); return true; };
  }
  C.register(list);
  C.provide({ state, checkpoint });
  NS.ai = { list };
})(typeof window !== 'undefined' ? window : globalThis);
