/* Slop Serial counter for the assistant: SlopCmd commands with arguments (shared/commands/args.js), imported on demand by
 * SlopCmd.prepare() (app.js). On the page's own state (window.SlopSerials): new_count (a fresh count: no photos, the
 * pattern given or the default; destructive), add_photos (from Slop Drive), add_text (a
 * photo's label text typed or pasted instead of read, so its serials count without the reader), read_photos (the OCR
 * reader, as the Read photos button), add_serial and remove_serial (on one photo), set_pattern, export_serials (the unique
 * serials or the photos as CSV, to Slop Drive and/or a download) and clear_photos (destructive). */
const C = window.SlopCmd, X = () => window.SlopSerials;
const list = [];
const add = C.aiAdder('serials', list);   // shared/commands/commands.js
const PHOTO = { name: 'photo', type: 'string', maxLength: 200, description: 'photo name or number from 1; the last one when empty' };
function photo(q) {
  const ps = X().state.photos;
  if (!ps.length) throw new Error('No photos yet (add_photos)');
  if (q == null || q === '') return ps[ps.length - 1];
  const p = /^\d+$/.test(q) ? ps[+q - 1] : ps.find((x) => x.name.toLowerCase() === String(q).toLowerCase()) || ps.find((x) => x.name.toLowerCase().includes(String(q).toLowerCase()));
  if (!p) throw new Error(`No photo “${q}”`);
  return p;
}
const summary = () => { const t = X().tally().totals; return `${t.read} read, ${t.quantity} unique serial(s)`; };
async function save(text, name, to) {
  const blob = new Blob([text], { type: 'text/csv' }), out = [];
  if (to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'serials' })})`);
  if (to !== 'drive') { window.SlopAITools.download(name, text, 'text/csv;charset=utf-8'); out.push(`downloaded ${name}`); }
  return out.join(' and ') + '.';
}

add('new_count', 'Start a new count', [{ name: 'pattern', type: 'string', maxLength: 300, description: 'the serial pattern (a regular expression); the default when empty' }], (a) => {
  if (X().state.busy) throw new Error('The photos are being read; wait until that is done');
  const pat = a.pattern || '';
  if (pat) { try { new RegExp(pat); } catch (e) { throw new Error('That pattern is not valid: ' + e.message); } }
  const n = X().state.photos.length;
  X().state.photos = [];
  document.getElementById('pattern').value = pat || X().DEFAULT_PATTERN;
  X().render();
  return `Started a new count${n ? ` (cleared ${n} photo(s))` : ''} with ${pat ? 'your' : 'the default'} pattern. add_photos or add_text next.`;
}, { destructive: true, description: 'Start over: clear the photos and set the serial pattern (or the default), as for a new batch.' });
add('add_photos', 'Add photos from Slop Drive', [{ name: 'files', type: 'array', required: true, maxItems: 500, items: { type: 'string' }, description: 'Slop Drive names or ids' }], async (a) => {
  const H = window.SlopHub, all = await H.list(), files = [];   // intake-ok: an AI command looks a Drive file up by name or id (a lookup; the person's picker is SlopIntake.fromDrive)
  for (const q of a.files) {
    const s = String(q).toLowerCase(), hit = all.find((f) => f.id === q) || all.find((f) => f.name.toLowerCase() === s);
    if (!hit) throw new Error(`No Slop Drive file “${q}”`);
    const rec = await H.get(hit.id);
    files.push(new File([rec.blob], rec.name, { type: rec.type || rec.blob.type }));
  }
  const n = X().state.photos.length;
  await X().addFiles(files);
  return `Added ${X().state.photos.length - n} photo(s). read_photos reads them, or add_text gives a photo's text.`;
});
add('add_text', 'Give a photo its text', [PHOTO, { name: 'text', type: 'string', required: true, maxLength: 20000, description: 'the label text, as read or typed' }], (a) => {
  const p = photo(a.photo);
  p.text = a.text; p.read = true; p.error = null;
  X().render();
  return `“${p.name}”: ${X().serialsOf(p).length} serial(s) (${X().serialsOf(p).join(', ') || 'none'}). Totals: ${summary()}.`;
});
add('read_photos', 'Read the photos', [], async () => { await X().readAll(); return `Read: ${summary()}.`; }, { description: 'Read every unread photo with the on-device text reader (it may ask to install the model first).' });
add('add_serial', 'Add a serial to a photo', [PHOTO, { name: 'serial', type: 'string', required: true, maxLength: 80 }], (a) => {
  const p = photo(a.photo); X().changeSerial(p, a.serial.trim().toUpperCase(), true); return `Added ${a.serial.toUpperCase()} to “${p.name}”. Totals: ${summary()}.`;
});
add('remove_serial', 'Take a serial off a photo', [PHOTO, { name: 'serial', type: 'string', required: true, maxLength: 80 }], (a) => {
  const p = photo(a.photo); X().changeSerial(p, a.serial.trim().toUpperCase(), false); return `Took ${a.serial.toUpperCase()} off “${p.name}”. Totals: ${summary()}.`;
});
add('set_pattern', 'Set the serial pattern', [{ name: 'pattern', type: 'string', required: true, maxLength: 300, description: 'a regular expression; empty restores the default' }], (a) => {
  try { new RegExp(a.pattern); } catch (e) { throw new Error('That pattern is not valid: ' + e.message); }
  document.getElementById('pattern').value = a.pattern;
  X().render();
  return `Pattern set. Totals: ${summary()}.`;
});
add('export_serials', 'Export the serials', [{ name: 'list', type: 'enum', values: ['serials', 'photos'], default: 'serials' }, { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  (a) => save(a.list === 'photos' ? X().photosCsv() : X().serialsCsv(), a.list === 'photos' ? 'photos.csv' : 'serials.csv', a.to));
add('clear_photos', 'Clear the photos', [], () => { const n = X().state.photos.length; X().state.photos = []; X().render(); return `Cleared ${n} photo(s).`; }, { destructive: true });

C.register(list);
C.provide({
  state: () => { const t = X().tally(); return { app: 'Serial counter', pattern: X().pattern(), photos: X().state.photos.map((p) => ({ name: p.name, read: p.read, serials: p.read ? X().serialsOf(p) : [] })), unique: t.unique.slice(0, 100), totals: t.totals }; },
  checkpoint: () => {
    const snap = X().state.photos.map((p) => Object.assign({}, p, { manual: new Set(p.manual), removed: new Set(p.removed) })), pat = X().pattern();
    return () => { X().state.photos = snap; document.getElementById('pattern').value = pat; X().render(); return true; };
  },
});
