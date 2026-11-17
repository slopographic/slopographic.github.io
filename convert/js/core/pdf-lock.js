/* Two PDF conversions with the site's PDF security handler (shared/pdf-crypto/): Protect PDF with a password (AES-256,
 * with the permissions to print, copy and edit) and Remove PDF password. Spread into CONVERSIONS by catalog.js.
 * Their entries say secret: true, so their password options (type 'password') are never shown in a summary, the live
 * preview does not run them, and the tool forgets the passwords after Convert (ui/file-opts.js forgetSecrets).
 * The passwords live only in the file's options while the page is open; nothing logs or stores them. Browser only.
 *   protectPdf(bytes, { password, confirm, allowPrint, allowCopy, allowEdit }) -> Uint8Array
 *   unlockPdf(bytes, { password }) -> Uint8Array */
import { loadPdfLib } from './lib.js';
import { stemOf as base } from '../io/files.js';
import { tr } from './i18n.js';

const SHARED = new URL('../../../shared/pdf-crypto/', import.meta.url).href;
const PARTS = ['legacy', 'aes256', 'security', 'decrypt', 'encrypt'];
let ready = null;

function script(src) {
  return new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src, async: false });
    s.onload = res; s.onerror = () => { s.remove(); rej(new Error(tr('convert.pdf.load_failed'))); };
    document.head.append(s);
  });
}
/** pdf-lib and window.SlopPdfCrypto, once. */
export function crypto() {
  if (!ready) {
    ready = (async () => {
      await loadPdfLib();
      const C = globalThis.SlopPdfCrypto;
      if (!C || !C.encryptPdf) for (const p of PARTS) await script(`${SHARED}${p}.js`);
      return globalThis.SlopPdfCrypto;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

const notPdf = (e) => /parse|PDF|header|trailer/i.test(String(e && e.message)) && !e.code;
function readable(e) {
  if (e && e.code === 'password') return new Error(tr('convert.pdf.wrong_password'));
  if (e && e.code === 'unsupported') return new Error(e.message);
  if (notPdf(e)) return new Error(tr('convert.pdf.not_valid'));
  return e instanceof Error ? e : new Error(String(e));
}

export async function protectPdf(bytes, o = {}) {
  const pw = String(o.password ?? '');
  if (!pw) throw new Error(tr('convert.pdf.type_password'));
  if (pw !== String(o.confirm ?? '')) throw new Error(tr('convert.pdf.mismatch_options'));
  const C = await crypto();
  try {
    return await C.encryptPdf(bytes, { userPassword: pw, permissions: {
      print: o.allowPrint !== false, copy: o.allowCopy !== false,
      modify: o.allowEdit !== false, annotate: o.allowEdit !== false, assemble: o.allowEdit !== false } });
  } catch (e) {
    if (e && e.code === 'password') throw new Error(tr('convert.pdf.already_protected'));
    throw readable(e);
  }
}

export async function unlockPdf(bytes, o = {}) {
  const C = await crypto();
  let out;
  try { out = await C.decryptPdf(bytes, String(o.password ?? ''), { useObjectStreams: false }); }
  catch (e) {
    if (e && e.code === 'password' && !o.password) throw new Error(tr('convert.pdf.needs_password'));
    throw readable(e);
  }
  if (!out) throw new Error(tr('convert.pdf.no_password'));
  return out;
}

const PERM = (key, label) => ({ key, type: 'checkbox', get label() { return label(); }, value: true });
/** A copy of an option with its getters kept (a spread would read the label once). */
const like = (o, more) => Object.defineProperties(Object.defineProperties({}, Object.getOwnPropertyDescriptors(o)), Object.getOwnPropertyDescriptors(more));
const pdfOut = (name, bytes) => ({ name, blob: new Blob([bytes], { type: 'application/pdf' }) });
const read = async (f) => new Uint8Array(await f.file.arrayBuffer());

export const PDF_LOCK = [
  { id: 'pdf-protect', get label() { return tr('convert.pdf.protect_pdf_with_a_password'); }, group: 'PDF', from: ['pdf'], ext: 'pdf', mode: 'each', secret: true, chain: false,
    keywords: ['password', 'encrypt', 'lock', 'secure', 'aes', 'protect'],
    get note() { return tr('convert.pdf.aes_256_the_strongest_pdf_encryption'); },
    check: (o = {}) => (!o.password ? tr('convert.pdf.type_a_password') : o.password !== o.confirm ? tr('convert.pdf.mismatch') : ''),   // before a workflow runs
    options: [
      { key: 'password', type: 'password', get label() { return tr('convert.pdf.password'); }, get hint() { return tr('convert.pdf.needed_to_open_the_pdf_the'); } },
      { key: 'confirm', type: 'password', get label() { return tr('convert.pdf.type_the_password_again'); } },
      PERM('allowPrint', () => tr('convert.pdf.allow_printing')), PERM('allowCopy', () => tr('convert.pdf.allow_copying')),
      like(PERM('allowEdit', () => tr('convert.pdf.allow_editing')), { get hint() { return tr('convert.pdf.pdf_readers_that_follow_the_permissions'); } }),
    ],
    run: async (files, o) => [pdfOut(`${base(files[0].name)}-protected.pdf`, await protectPdf(await read(files[0]), o))] },
  { id: 'pdf-unlock', get label() { return tr('convert.pdf.remove_pdf_password'); }, group: 'PDF', from: ['pdf'], ext: 'pdf', mode: 'each', secret: true, chain: false,
    keywords: ['password', 'decrypt', 'unlock', 'unprotect', 'remove'],
    get note() { return tr('convert.pdf.makes_a_copy_with_no_password'); },
    options: [
      { key: 'password', type: 'password', get label() { return tr('convert.pdf.password'); }, get hint() { return tr('convert.pdf.the_password_that_opens_the_pdf'); } },
    ],
    run: async (files, o) => [pdfOut(`${base(files[0].name)}-unlocked.pdf`, await unlockPdf(await read(files[0]), o))] },
];
