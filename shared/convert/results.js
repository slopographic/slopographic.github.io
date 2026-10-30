/* The Convert dialog's results: next to each converted file's Download (drawn by the tool), Save to Slop Drive and
 * Open in… (the apps that open that type, through Slop Hub's Send to: the file goes to Slop Drive and the app opens on it
 * in a new tab). The tool's own "Download all as zip" stays for several files.
 *   addActions(listEl, outputs, { from })   outputs: [{ name, blob }] in the list's order */
import { hub } from './load.js';

const TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html', json: 'application/json',
  xml: 'application/xml', yaml: 'text/yaml', toml: 'text/plain', srt: 'text/plain', vtt: 'text/vtt', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
  m4a: 'audio/mp4', opus: 'audio/opus', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', vcf: 'text/vcard', ics: 'text/calendar' };

/** The file's type: the blob's own, else the one its extension names. */
export function typeOf(o) {
  if (o.blob && o.blob.type) return o.blob.type.split(';')[0];
  const ext = String(o.name).split('.').pop().toLowerCase();
  return TYPES[ext] || 'application/octet-stream';
}

function button(label, cls, act) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cv-btn cv-small ' + cls; b.textContent = label;
  b.addEventListener('click', act);
  return b;
}
const toast = (m) => { if (window.SlopUI && window.SlopUI.toast) window.SlopUI.toast(m); };
/** The words (shared/i18n/ui/<code>/ai2.js and the base table). */
const T = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);

export async function addActions(listEl, outputs, { from = 'convert' } = {}) {
  let H;
  try { H = await hub(); } catch (e) { return; }   // offline single file: Download only
  if (!H) return;
  const rows = [...listEl.querySelectorAll('li')];
  outputs.forEach((o, i) => {
    const li = rows[i];
    if (!li || li.querySelector('.sl-cvt-save')) return;
    const type = typeOf(o);
    const save = button(T('ui.convert.save_drive'), 'sl-cvt-save', async () => {
      save.disabled = true;
      try {
        const id = await H.saveToDrive(o.blob, o.name, { from, title: T('ui.convert.save_title', { name: o.name }) });
        if (id) { save.textContent = T('ui.convert.saved'); return; }
      } catch (e) { toast(T('ui.convert.save_failed', { error: String((e && e.message) || e) })); }
      save.disabled = false;
    });
    // Open in…: the one outbound menu (SlopOuttake, shared/intake/outtake.js): every app that takes the type, and the
    // handovers and shared items others register. Save to Slop Drive is the button beside it.
    const O = window.SlopOuttake;
    const openIn = O && H.appsAccepting(type).length
      ? O.button({ get: () => o.blob, name: o.name, type, from, folder: false }, { label: T('ui.outtake.open_in_dots'), cls: 'cv-btn cv-small sl-cvt-open' }) : null;
    li.append(save, ...(openIn ? [openIn] : []));
  });
}
