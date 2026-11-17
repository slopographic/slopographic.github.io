/* QR SLOP for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by SlopCmd.prepare()
 * (js/commands.js). They work through the app's own state (QRState: kind, values, style, logo), logos (QRLogo), exports
 * (QRExport, QRPreview) and Slop Drive saving (QRSave: the PNG beside its .qr.json settings). The checkpoint is the
 * settings record (QRState.snapshot), put back with restore. Pictures come through shared/commands/sources.js. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || window.QRAI) return;
  const Q = window.QRState, A = window.QRApp, S = () => Q.S;
  const TYPES = window.QRPayload.TYPES;
  const MARKS = window.QRLogo.marks().map((m) => m.id);
  const FIELDS = Object.fromEntries(Object.entries(window.QRForms.FIELDS || {}).map(([k, list]) => [k, list.map((f) => f.k)]));
  const fieldHelp = Object.entries(FIELDS).map(([k, f]) => `${k}: ${f.join(', ')}`).join('; ');
  const STYLE = [
    { name: 'size', type: 'number', min: 64, max: 4096, integer: true, description: 'picture size in px' },
    { name: 'ec', type: 'enum', values: ['L', 'M', 'Q', 'H'], description: 'error correction (a logo forces H)' },
    { name: 'fg', type: 'color', description: 'dark modules colour' }, { name: 'bg', type: 'color', description: 'background colour' },
    { name: 'transparent', type: 'boolean', description: 'no background' }, { name: 'shape', type: 'enum', values: Q.SHAPES, description: 'module shape' },
    { name: 'gradient', type: 'boolean', description: 'fade the modules from fg to fg2' }, { name: 'fg2', type: 'color', description: 'second gradient colour' },
    { name: 'quiet', type: 'number', min: 0, max: 16, integer: true, description: 'quiet zone in modules' },
  ];
  const CONTENT = [{ name: 'kind', type: 'enum', values: TYPES, description: 'what the code holds' },
    { name: 'values', type: 'object', description: 'the fields of that kind: ' + fieldHelp },
    { name: 'text', type: 'string', maxLength: 2953, description: 'shortcut: the text (kind text) or the address (kind url)' },
    { name: 'raw', type: 'string', maxLength: 2953, description: 'encode exactly this text instead of a form' }];
  const list = [];
  const add = C.aiAdder('qr', list);   // shared/commands/commands.js

  function content(a) {
    if (a.raw != null && a.raw !== '') { Q.setRaw(a.raw); return; }
    if (a.kind) Q.setKind(a.kind);
    const kind = S().kind;
    if (a.text != null && a.text !== '') Q.setValue(kind === 'url' ? 'url' : 'text', a.text);
    for (const [k, v] of Object.entries(a.values || {})) {
      if (FIELDS[kind] && !FIELDS[kind].includes(k)) throw new Error(`A ${kind} code has no field “${k}” (it has ${FIELDS[kind].join(', ')})`);
      Q.setValue(k, v);
    }
  }
  function style(a) {
    for (const s of STYLE) if (a[s.name] != null) S().style[s.name] = a[s.name];
  }
  /** Redraws the page and says what the code holds now, or why it cannot be made. */
  function result(done) {
    A.edit(); A.redrawAll();
    const r = Q.encodedText(), last = A.last();
    if (!r.ok) throw new Error(r.error);
    if (!last) throw new Error('The text does not fit in a QR code at this error correction');
    const o = Q.renderOpts();
    return `${done} It encodes ${window.QRPayload.byteLength(r.text)} bytes (${S().kind}), ${o.size} px, error correction ${o.ec}${S().logo.href ? ', with a logo' : ''}.`;
  }

  add('new_qr', 'New QR code', [{ name: 'label', type: 'string', maxLength: 80, description: 'a name for the code (file names use it)' }].concat(CONTENT, STYLE),
    (a) => { Q.reset(); if (a.label) Q.setLabel(a.label); content(a); style(a); return result('Made a new QR code.'); },
    { description: 'Start a new QR code: its content (text, url, email, phone, sms, wifi, vcard, geo, event) and its look.' });
  add('set_content', 'Set the QR content', CONTENT, (a) => { content(a); return result('Changed the content.'); });
  add('set_design', 'Set the QR design', STYLE, (a) => { style(a); return result('Changed the design.'); });
  add('add_logo', 'Add a logo', [{ name: 'mark', type: 'enum', values: MARKS, description: 'a built-in mark' },
    { name: 'file', type: 'string', maxLength: 300, description: 'or a picture in Slop Drive (name or id)' }, { name: 'url', type: 'string', maxLength: 500, description: 'or a picture on this site' },
    { name: 'width', type: 'number', min: 5, max: 30, description: 'logo width, % of the code' }],
  async (a) => {
    const L = S().logo;
    if (a.mark) { L.href = await window.QRLogo.fromMark(a.mark); L.mark = a.mark; L.name = ''; }
    else if (a.file || a.url) {
      await sources();
      const p = await window.SlopCmdSources.picture({ file: a.file, url: a.url });
      L.href = await window.QRLogo.fromFile(new File([p.blob], p.name, { type: p.blob.type || 'image/png' })); L.name = p.name; L.mark = '';
    } else throw new Error('Give mark, file or url');
    if (a.width != null) L.frac = window.QRRender.clampLogo(a.width / 100);
    return result('Added the logo.');
  }, { description: 'Put a logo in the middle of the code (error correction goes to H so it still scans).' });
  add('remove_logo', 'Remove the logo', [], () => { Object.assign(S().logo, { href: null, name: '', mark: '' }); return result('Removed the logo.'); });

  const sources = () => C.sources();   // shared/commands/sources.js, loaded once (commands.js)
  add('export_qr', 'Export the QR code', [{ name: 'format', type: 'enum', values: ['png', 'svg', 'pdf'], default: 'png' },
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const last = A.last();
    if (!last) throw new Error('There is no code yet: give it content first');
    const base = window.QRSave.baseName(S()), px = Q.renderOpts().size, out = [];
    const png = a.format === 'svg' ? null : await window.QRPreview.pngFor(last.svg, px);
    const blob = a.format === 'svg' ? new Blob([last.svg], { type: 'image/svg+xml' }) : a.format === 'pdf' ? await window.QRExport.toPdf(png, { title: S().label || 'QR code', line: last.text }) : png;
    const name = base + (a.format === 'pdf' ? '-print.pdf' : '.' + a.format);
    if (a.to !== 'download') {
      if (a.format === 'png') { const r = await window.QRSave.saveTo(null, png, Q.snapshot(), base); out.push(`Saved ${name} to Slop Drive (id ${r.pngId}) with its settings`); }
      else { await sources(); out.push(`Saved ${name} to Slop Drive (id ${await window.SlopCmdSources.put(blob, name, 'qr')})`); }
    }
    if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save the code as PNG (with its settings, to open again), SVG or a print page PDF, to Slop Drive and/or a download.' });

  function state() {
    const r = Q.encodedText();
    return { app: 'QR SLOP', settings: Q.snapshot(), encoded: r.ok ? r.text.slice(0, 500) : null, problem: r.ok ? null : r.error, ready: !!A.last(), kinds: TYPES, fields: FIELDS, marks: MARKS };
  }
  function checkpoint() {
    const snap = Q.snapshot();
    return () => { Q.restore(snap); A.redrawAll(); return true; };
  }

  C.register(list);
  C.provide({ state, checkpoint });
  window.QRAI = { list };
})();
