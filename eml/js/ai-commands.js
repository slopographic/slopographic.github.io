/* Slop EML for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (commands.js). Through EmlApp and the export module (export.js make): open_file (an .eml or .mbox from
 * Slop Drive), new_message (an .eml written from the fields, opened like any file), add_recipient and add_attachment
 * (the message's own file is rewritten and read again, EmlApp.replace), select_message, search_messages, close_message
 * and export_messages (PDF, text, HTML, Markdown, CSV list, .eml or attachments, to Slop Drive and/or a download).
 * state() lists the open messages; the checkpoint puts back the files it changed and closes the messages it opened. */
(function () {
  'use strict';
  const C = window.SlopCmd, A = () => window.EmlApp, X = () => window.EmlExport;
  if (!C || C.get('eml.ai.export-messages')) return;
  const list = [], opened = [], edits = [];   // edits: { id, bytes } before each rewrite, for the checkpoint
  const add = C.aiAdder('eml', list);   // shared/commands/commands.js
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 300, description }, extra);
  const MSG = S('message', 'subject, file name or id; the open one when empty');
  const find = (q) => {
    if (!q) { const d = A().current(); if (!d) throw new Error('No message is open'); return d; }
    const s = String(q).toLowerCase(), all = A().docs();
    const d = all.find((x) => String(x.id) === String(q)) || all.find((x) => x.name.toLowerCase() === s) || all.find((x) => String(x.summary.subject || '').toLowerCase().includes(s));
    if (!d) throw new Error(`No open message “${q}”`);
    return d;
  };
  const enc = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(v))) + '?=');
  async function driveFile(q) {
    const H = window.SlopHub, s = String(q).toLowerCase(), all = await H.list();   // intake-ok: an AI command looks a Drive file up by name or id (a lookup; the person's picker is SlopIntake.fromDrive)
    const hit = all.find((f) => f.id === q) || all.find((f) => f.name.toLowerCase() === s) || all.find((f) => f.name.toLowerCase().includes(s));
    if (!hit) throw new Error(`No Slop Drive file “${q}”`);
    return H.get(hit.id);
  }
  /** A message's own file as header entries (folded lines kept) and the body, as bin strings (one char per byte). */
  function partsOf(d) {
    const { head, body } = window.EmlMime.splitHeaders(window.EmlCodec.bytesToBin(d.bytes)), eol = /\r\n/.test(head) ? '\r\n' : '\n', hs = [];
    for (const line of head.split(/\r?\n/)) {
      if ((line[0] === ' ' || line[0] === '\t') && hs.length) hs[hs.length - 1].text += eol + line;
      else if (line) hs.push({ name: line.slice(0, Math.max(0, line.indexOf(':'))).trim().toLowerCase(), text: line });
    }
    return { hs, body, eol };
  }
  const valueOf = (h) => h.text.slice(h.text.indexOf(':') + 1).replace(/\r?\n[ \t]+/g, ' ').trim();
  function rewrite(d, hs, body, eol) {
    edits.push({ id: d.id, bytes: d.bytes });
    return A().replace(d.id, window.EmlCodec.binToBytes(hs.map((h) => h.text).join(eol) + eol + eol + body));
  }
  /** An attachment part: base64 in lines of 76, the name as RFC 2231 when it is not plain ASCII. */
  function attachmentPart(bytes, name, type, eol) {
    const b64 = (btoa(window.EmlCodec.bytesToBin(bytes)).match(/.{1,76}/g) || []).join(eol);
    const plain = /^[\x20-\x7e]*$/.test(name), q = '"' + name.replace(/["\\]/g, '_') + '"';
    return [`Content-Type: ${type}${plain ? '; name=' + q : ''}`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; ${plain ? 'filename=' + q : "filename*=UTF-8''" + encodeURIComponent(name)}`, '', b64].join(eol);
  }
  /** The body with one more part: added before the closing boundary of a multipart/mixed message, else the message is
   *  wrapped in a new multipart/mixed (its Content-* headers move to the first part). Changes hs in place. */
  function withPart(hs, body, eol, part) {
    const ctH = hs.find((h) => h.name === 'content-type'), ct = window.EmlCodec.parseParams(ctH ? valueOf(ctH) : 'text/plain');
    if (ct.value === 'multipart/mixed' && ct.params.boundary) {
      const i = body.lastIndexOf('--' + ct.params.boundary + '--');
      if (i < 0) throw new Error('The message has no closing boundary, so it cannot take an attachment');
      const lead = body.slice(0, i);
      return lead + (/\n$/.test(lead) ? '' : eol) + '--' + ct.params.boundary + eol + part + eol + body.slice(i);
    }
    const b = 'slop-' + Math.random().toString(36).slice(2), moved = hs.filter((h) => h.name.startsWith('content-'));
    const rest = hs.filter((h) => !h.name.startsWith('content-'));
    if (!rest.some((h) => h.name === 'mime-version')) rest.push({ name: 'mime-version', text: 'MIME-Version: 1.0' });
    rest.push({ name: 'content-type', text: `Content-Type: multipart/mixed; boundary="${b}"` });
    hs.splice(0, hs.length, ...rest);
    return `--${b}${eol}${moved.map((h) => h.text + eol).join('')}${eol}${body}${eol}--${b}${eol}${part}${eol}--${b}--${eol}`;
  }
  /** A plain RFC 5322 message: headers, then the text (quoted-printable is not needed: UTF-8, 8bit). */
  function emlText(a) {
    const lines = [`From: ${a.from || 'me@example.com'}`, `To: ${a.to}`];
    if (a.cc) lines.push(`Cc: ${a.cc}`);
    lines.push(`Subject: ${enc(a.subject || '')}`, `Date: ${new Date(a.date || Date.now()).toUTCString().replace('GMT', '+0000')}`, 'MIME-Version: 1.0');
    if (a.html) {
      const b = 'slop-' + Math.random().toString(36).slice(2);
      lines.push(`Content-Type: multipart/alternative; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', a.text || '',
        `--${b}`, 'Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', a.html, `--${b}--`, '');
    } else lines.push('Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: 8bit', '', a.text || '', '');
    return lines.join('\r\n');
  }

  add('open_file', 'Open messages from Slop Drive', [S('file', 'Slop Drive name or id (.eml or .mbox)', { required: true })], async (a) => {
    const rec = await driveFile(a.file), n0 = A().docs().length;
    const d = await A().openFile(new File([rec.blob], rec.name));
    opened.push(...A().docs().slice(n0).map((x) => x.id));
    return `Opened ${rec.name}: ${A().docs().length - n0} message(s); the first is “${d.summary.subject || '(no subject)'}”.`;
  });
  add('new_message', 'Write a new message', [S('to', 'addresses', { required: true }), S('from', 'the sender'), S('cc', 'copies'), S('subject', 'the subject', { default: '' }),
    S('text', 'the plain text body', { maxLength: 200000 }), S('html', 'an HTML body too', { maxLength: 200000 }), S('name', 'file name', { default: 'message.eml' })], async (a) => {
    const name = /\.eml$/i.test(a.name) ? a.name : a.name + '.eml';
    const d = await A().openFile(new File([emlText(a)], name, { type: 'message/rfc822' }));
    opened.push(d.id);
    return `Wrote “${d.summary.subject || '(no subject)'}” to ${d.summary.to || a.to} as ${name} (open now; export_messages saves it).`;
  }, { description: 'Write an e-mail as an .eml file (headers and a text or HTML body) and open it.' });
  add('add_recipient', 'Add a recipient', [S('address', 'an address, like ada@example.com or Ada Lovelace <ada@example.com>', { required: true }),
    { name: 'field', type: 'enum', values: ['to', 'cc', 'bcc'], default: 'to' }, MSG], (a) => {
    const d = find(a.message), { hs, body, eol } = partsOf(d), addr = String(a.address).trim();
    if (!/@/.test(addr) || /[\r\n]/.test(addr)) throw new Error('Give one e-mail address');
    const m = /^(.*?)\s*<([^>]+)>$/.exec(addr), text = m && m[1] ? `${enc(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : addr;
    const h = hs.find((x) => x.name === a.field), bare = (m ? m[2] : addr).toLowerCase();
    if (h && valueOf(h).toLowerCase().includes(bare)) return `${bare} is already in ${a.field.toUpperCase()}.`;
    if (h) h.text += ',' + eol + ' ' + text;
    else {
      const at = hs.reduce((n, x, i) => (['from', 'to', 'cc'].includes(x.name) ? i + 1 : n), 0);
      hs.splice(at, 0, { name: a.field, text: `${{ to: 'To', cc: 'Cc', bcc: 'Bcc' }[a.field]}: ${text}` });
    }
    const nd = rewrite(d, hs, body, eol);
    return `Added ${text} to ${a.field.toUpperCase()} of “${nd.summary.subject || nd.name}”.`;
  }, { description: 'Add an address to the To, Cc or Bcc of a message (its .eml file is rewritten; export_messages with format eml saves it).' });
  add('add_attachment', 'Attach a Slop Drive file', [S('file', 'Slop Drive name or id', { required: true }), S('name', 'the attachment\'s name; the file\'s own when empty'), MSG], async (a) => {
    const d = find(a.message), rec = await driveFile(a.file), name = a.name || rec.name;
    const type = window.EmlBatch.typeOf(name, rec.blob.type || 'application/octet-stream');
    const { hs, body, eol } = partsOf(d), part = attachmentPart(new Uint8Array(await rec.blob.arrayBuffer()), name, type, eol);
    const nd = rewrite(d, hs, withPart(hs, body, eol, part), eol);
    return `Attached ${name} (${rec.blob.size} bytes) to “${nd.summary.subject || nd.name}”; it has ${nd.attachments.length} attachment(s) now.`;
  }, { description: 'Attach a Slop Drive file to a message (its .eml file is rewritten; export_messages with format eml saves it).' });
  add('select_message', 'Show a message', [Object.assign({}, MSG, { required: true })], (a) => { const d = find(a.message); A().select(d.id); return `Showing “${d.summary.subject || d.name}”.`; });
  add('search_messages', 'Search the messages', [S('query', 'words in the subject, sender, text…', { default: '' })], (a) => {
    A().setList({ query: a.query }); return `${A().visible().length} message(s) match.`;
  });
  add('close_message', 'Close a message', [MSG], (a) => { const d = find(a.message); A().close(d.id); return `Closed “${d.summary.subject || d.name}”.`; });
  add('export_messages', 'Export messages', [{ name: 'format', type: 'enum', values: ['pdf', 'pdfzip', 'txt', 'html', 'md', 'csv', 'eml', 'atts'], default: 'pdf' },
    { name: 'scope', type: 'enum', values: ['current', 'checked', 'all'], default: 'current' }, { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' },
    { name: 'attachments', type: 'boolean', default: false, description: 'PDF: add the attachments after the message' }], async (a) => {
    const docs = X().scope(a.scope);
    if (!docs.length) throw new Error('No messages to export');
    const f = await X().make(a.format, docs, { attachments: a.attachments });
    if (!f) throw new Error('The export failed');
    const out = [];
    if (a.to !== 'download') out.push(`Saved ${f.name} to Slop Drive (id ${await window.SlopHub.put(f.blob, { name: f.name, from: 'eml' })})`);
    if (a.to !== 'drive') { window.SlopUI.download(f.blob, f.name); out.push(`downloaded ${f.name}`); }
    return out.join(' and ') + '.' + (f.info ? ' ' + f.info : '');
  }, { description: 'Save one, the ticked or all messages as PDF (one file or one each), text, HTML, Markdown, a CSV list, the .eml files or their attachments.' });

  C.register(list);
  C.provide({
    state: () => ({ app: 'Slop EML', messages: A().visible().slice(0, 50).map((d) => ({ id: d.id, name: d.name, subject: d.summary.subject, from: d.summary.from, date: d.summary.date, to: d.summary.to, attachments: d.attachments.length })),
      current: A().current() ? { subject: A().current().summary.subject, text: String(A().current().msg.text || '').slice(0, 2000) } : null }),
    checkpoint: () => {
      const mark = opened.length, emark = edits.length;
      return () => {
        for (const e of edits.splice(emark).reverse()) if (A().find(e.id)) A().replace(e.id, e.bytes);
        for (const id of opened.splice(mark)) if (A().find(id)) A().close(id);
        return true;
      };
    },
  });
})();
