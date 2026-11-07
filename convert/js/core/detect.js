/* Work out what kind of file a dropped File is: magic bytes first, then extension, then MIME type,
 * then a text sniff. Pure: no DOM, no network. Kinds: png jpg webp bmp gif svg pdf csv json md txt html bin, and the
 * finance files sie ofx qif camt053 mt940 (judged by what they say first: shared/finance/index.js sniffFinance), and the
 * camera RAW kinds cr2 cr3 nef arw dng raf orf rw2 and the rest (shared/raw/detect.js: by content, then by extension). */
import { sniffFinance, FINANCE_EXT } from '../../../shared/finance/index.js';
import '../../../shared/raw/tiff.js';
import '../../../shared/raw/detect.js';
import { tr } from './i18n.js';
const RAW = globalThis.SlopRawDetect;
const MAGIC = [
  ['pdf', [0x25, 0x50, 0x44, 0x46]],        // %PDF
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpg', [0xff, 0xd8, 0xff]],
  ['gif', [0x47, 0x49, 0x46, 0x38]],        // GIF8
  ['tif', [0x49, 0x49, 0x2a, 0x00]],        // TIFF, little endian
  ['tif', [0x4d, 0x4d, 0x00, 0x2a]],        // TIFF, big endian
  ['ico', [0x00, 0x00, 0x01, 0x00]],        // ICO
  ['zip', [0x50, 0x4b, 0x03, 0x04]],        // ZIP (also docx, xlsx, pptx, odt, epub: the extension says which)
];
/** Zip-based formats: the extension (or MIME type) names the kind, not the zip signature. */
const ZIP_KINDS = ['docx', 'pptx', 'xlsx', 'odt', 'ods', 'odp', 'epub', '3mf', 'usdz'];
const EXT = {
  png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', bmp: 'bmp', gif: 'gif', svg: 'svg',
  pdf: 'pdf', csv: 'csv', json: 'json', md: 'md', markdown: 'md', txt: 'txt', text: 'txt',
  html: 'html', htm: 'html', xhtml: 'html', vcf: 'vcf', vcard: 'vcf', xlsx: 'xlsx', tsv: 'csv',
  eml: 'eml', ics: 'ics', ical: 'ics', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml', srt: 'srt', vtt: 'vtt', xls: 'xls',
  jsonl: 'jsonl', ndjson: 'jsonl', ass: 'ass', ssa: 'ass', sbv: 'sbv', gpx: 'gpx', kml: 'kml', geojson: 'geojson',
  docx: 'docx', pptx: 'pptx', odt: 'odt', ods: 'ods', odp: 'odp', epub: 'epub', zip: 'zip',
  ico: 'ico', tif: 'tif', tiff: 'tif', avif: 'avif', heic: 'heic', heif: 'heic',
  mp4: 'mp4', m4v: 'mp4', webm: 'webm', mov: 'mov', m4a: 'm4a', mp3: 'mp3', wav: 'wav', ogg: 'ogg', oga: 'ogg', opus: 'ogg', flac: 'flac',
  obj: 'obj', stl: 'stl', ply: 'ply', gltf: 'gltf', glb: 'glb', '3mf': '3mf', dae: 'dae', fbx: 'fbx', usdz: 'usdz', mtl: 'mtl', tga: 'tga', ktx2: 'ktx2',   // a .bin (a glTF buffer) needs no entry: unknown files are 'bin'
  ...FINANCE_EXT,
  ...Object.fromEntries(RAW.EXTS.map((e) => [e, e])),   // camera RAW: the kind is the extension
};
const MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/x-ms-bmp': 'bmp',
  'image/gif': 'gif', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'text/csv': 'csv', 'text/tab-separated-values': 'csv', 'application/json': 'json',
  'text/markdown': 'md', 'text/plain': 'txt', 'text/html': 'html', 'text/vcard': 'vcf', 'text/x-vcard': 'vcf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'video/ogg': 'ogg', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'message/rfc822': 'eml', 'text/calendar': 'ics', 'text/xml': 'xml', 'application/xml': 'xml', 'application/x-yaml': 'yaml', 'text/yaml': 'yaml', 'application/yaml': 'yaml', 'application/toml': 'toml', 'text/vtt': 'vtt', 'application/x-subrip': 'srt', 'application/vnd.ms-excel': 'xls',
  'application/x-ndjson': 'jsonl', 'application/jsonl': 'jsonl', 'application/gpx+xml': 'gpx', 'application/vnd.google-earth.kml+xml': 'kml', 'application/geo+json': 'geojson', 'text/x-ssa': 'ass',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/tiff': 'tif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heic',
  'application/zip': 'zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx', 'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods', 'application/vnd.oasis.opendocument.presentation': 'odp', 'application/epub+zip': 'epub',
  'model/gltf-binary': 'glb', 'model/gltf+json': 'gltf', 'model/obj': 'obj', 'model/stl': 'stl', 'model/x.stl-binary': 'stl', 'model/3mf': '3mf',
  'model/vnd.collada+xml': 'dae', 'model/vnd.usdz+zip': 'usdz', 'model/mtl': 'mtl', 'application/x-ply': 'ply',
  'application/x-ofx': 'ofx', 'application/ofx': 'ofx', 'application/vnd.intu.qfx': 'ofx', 'application/qif': 'qif', 'application/x-qif': 'qif',
};
/** Extension used when a file of this kind is saved. */
export const EXT_OF_KIND = { glb: 'glb', fbx: 'fbx', ply: 'ply', mp4: 'mp4', webm: 'webm', mov: 'mov', m4a: 'm4a', mp3: 'mp3', wav: 'wav', ogg: 'ogg', flac: 'flac', png: 'png', jpg: 'jpg', webp: 'webp', bmp: 'bmp', gif: 'gif', svg: 'svg', pdf: 'pdf', csv: 'csv', json: 'json', md: 'md', txt: 'txt', html: 'html', vcf: 'vcf', xlsx: 'xlsx', docx: 'docx', pptx: 'pptx', ods: 'ods', zip: 'zip', yaml: 'yaml', toml: 'toml', xml: 'xml', srt: 'srt', vtt: 'vtt', heic: 'heic', bin: 'bin', jsonl: 'jsonl', ass: 'ass', sbv: 'sbv', gpx: 'gpx', kml: 'kml', geojson: 'geojson' };
export const TEXT_KINDS = ['csv', 'json', 'md', 'txt', 'html', 'vcf', 'yaml', 'toml', 'xml', 'srt', 'vtt', 'jsonl', 'ass', 'sbv', 'gpx', 'kml', 'geojson'];

const startsWith = (head, sig) => sig.every((b, i) => head[i] === b);
const HEAD_LIMIT = 512;   // the bytes detectKind is given (readHead in io/files.js)
const ascii = (head, from, len) => String.fromCharCode(...head.subarray(from, from + len));

/** A Word or PowerPoint file with no name to go by: its first entries are under word/ or ppt/ (when Word or the apps
 *  here wrote it, the first entry or two say so), or null. */
export function officeOfZip(head) {
  const t = head ? ascii(head, 0, head.length) : '';
  return /\x50\x4b\x03\x04[\s\S]{26}word\//.test(t) ? 'docx' : /\x50\x4b\x03\x04[\s\S]{26}ppt\//.test(t) ? 'pptx' : null;
}
/** Kind from the first bytes of a file, or null when the bytes do not say. */
export function kindFromMagic(head) {
  if (!head || !head.length) return null;
  for (const [kind, sig] of MAGIC) if (startsWith(head, sig)) return kind;
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp';
  if (head.length >= 14 && head[0] === 0x42 && head[1] === 0x4d) return 'bmp';
  if (head.length >= 12 && ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
    return brand === 'M4A ' ? 'm4a' : brand === 'qt  ' ? 'mov' : 'mp4';
  }
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return 'wav';
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  if (head.length >= 4 && ascii(head, 0, 4) === 'OggS') return 'ogg'; // i18n-ignore: file signatures
  if (head.length >= 4 && ascii(head, 0, 4) === 'fLaC') return 'flac';
  if (head.length >= 3 && ascii(head, 0, 3) === 'ID3') return 'mp3';
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3';
  // 3D models with a signature: GLB (binary glTF), binary FBX and PLY (ASCII or binary, the header is text)
  if (head.length >= 12 && ascii(head, 0, 4) === 'glTF') return 'glb';
  if (head.length >= 20 && ascii(head, 0, 18) === 'Kaydara FBX Binary') return 'fbx'; // i18n-ignore: file signatures
  if (head.length >= 10 && /^ply\r?\nformat /.test(ascii(head, 0, 12))) return 'ply';
  return null;
}

const EML_FIELD = /^[A-Za-z][A-Za-z0-9-]*:/;
const EML_MUST = /^(From|Received|Return-Path|MIME-Version|Message-ID|Delivered-To):/i;

/** Text that is a mail message: a block of header fields (with From, Received or similar) at the top. The last line of a
 *  head that was cut at its end is not judged. */
export function looksLikeEml(head) {
  if (!head || !head.length) return false;
  const cut = head.length >= HEAD_LIMIT;
  const lines = ascii(head, 0, head.length).split(/\r?\n/);
  if (cut) lines.pop();
  let fields = 0, must = false;
  for (const line of lines) {
    if (line === '') break;             // the blank line ends the header block
    if (/^[ \t]/.test(line)) continue;  // a folded continuation of the field above
    if (!EML_FIELD.test(line)) return false;
    fields++;
    if (EML_MUST.test(line)) must = true;
  }
  return fields >= 2 && must;
}

/** Text that is an iCalendar file. */
export function looksLikeIcs(head) {
  return !!head && ascii(head, 0, Math.min(head.length, 1024)).includes('BEGIN:VCALENDAR');
}

/** Text that is an XML document (with its declaration; SVG and HTML are judged elsewhere). */
export function looksLikeXml(head) {
  return !!head && /^\s*<\?xml[\s>]/i.test(ascii(head, 0, Math.min(head.length, 256)));
}

/** Text that is a subtitle file: WebVTT says so on its first line; SubRip starts with a cue number and a time line. */
export function looksLikeSubs(head) {
  const t = head ? ascii(head, 0, Math.min(head.length, 256)).replace(/^\uFEFF|^\xEF\xBB\xBF/, '') : '';
  if (/^WEBVTT(\s|$)/.test(t)) return 'vtt';
  return /^\s*\d+\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/.test(t) ? 'srt' : null;
}

/** The kind of a text file from what it says, or null: 'eml', 'ics', 'xml', 'vtt' or 'srt'. */
export function sniffText(head) {
  if (!head || !head.length) return null;
  const subs = looksLikeSubs(head);
  if (subs) return subs;
  if (looksLikeIcs(head)) return 'ics';
  if (looksLikeEml(head)) return 'eml';
  if (looksLikeXml(head)) return 'xml';
  return null;
}

/** True when the bytes contain no NUL and decode as UTF-8 (a sniff for plain text). */
export function looksLikeText(head) {
  if (!head) return false;
  for (let i = 0; i < head.length; i++) if (head[i] === 0) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(head); return true; } catch (e) { return false; }
}

/** Detect the kind of a file. name and type are strings; head is the first ~512 bytes (Uint8Array) or null. */
export function detectKind(name = '', type = '', head = null) {
  // camera RAW first: a CR3 is ISO-BMFF and most others are TIFF inside, so the magic alone would call them mp4 or tif
  const raw = head && head.length >= 12 ? RAW.sniff(head, name) : null;
  if (raw) return raw.ext;
  const fromMagic = kindFromMagic(head);
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  const fromExt = name.includes('.') ? EXT[ext] : undefined;
  const mime = String(type || '').toLowerCase().split(';')[0].trim();
  const fromMime = MIME[mime];
  if (fromMagic === 'zip') {
    if (ZIP_KINDS.includes(fromExt)) return fromExt;
    if (ZIP_KINDS.includes(fromMime)) return fromMime;
    return (fromExt !== 'zip' && officeOfZip(head)) || 'zip';
  }
  if (fromMagic) return fromMagic;
  if (fromExt === 'svg' || mime === 'image/svg+xml') return 'svg';
  // A finance file says what it is in its first lines (an SIE #FLAGGA, an OFX header, an MT940 :20:): that wins over a
  // plain .txt, .xml, .csv or .dat name and over a finance extension that names another format.
  const fin = sniffFinance(head);
  if (fin && (!fromExt || ['txt', 'xml', 'csv', 'dat', 'asc'].includes(fromExt) || FINANCE_EXT[ext])) return fin;
  // A text file (or one with no name) that says it is a mail message, a calendar or XML is judged by what it says.
  const said = sniffText(head);
  if (said && (!fromExt || fromExt === 'txt')) return said;
  if (fromExt && fromExt !== 'svg') return fromExt;
  if (fromMime) return fromMime;
  if (head && head.length) {
    const t = ascii(head, 0, Math.min(head.length, 256)).trimStart();
    if (/^<svg[\s>]/i.test(t) || (/^<\?xml/i.test(t) && /<svg[\s>]/i.test(ascii(head, 0, head.length)))) return 'svg';
  }
  if (head && looksLikeText(head)) return 'txt';
  return 'bin';
}

/** Human label for a kind: KIND_LABEL[kind], read in the chosen language (convert.detect.kind_<kind>, or kind_raw). */
const KINDS = [
  'mp4', 'webm', 'mov', 'm4a', 'mp3', 'wav', 'ogg', 'flac', 'png', 'jpg', 'webp', 'bmp', 'gif', 'svg', 'pdf', 'csv',
  'json', 'md', 'txt', 'html', 'vcf', 'xlsx', 'bin', 'eml', 'ics', 'xml', 'yaml', 'toml', 'srt', 'vtt', 'xls', 'ico',
  'tif', 'avif', 'heic', 'zip', 'docx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'jsonl', 'ass', 'sbv', 'gpx', 'kml',
  'geojson', 'obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx', 'usdz', 'mtl', 'tga', 'ktx2', 'sie', 'ofx',
  'qif', 'camt053', 'mt940',
];
export const KIND_LABEL = {};
for (const k of KINDS) Object.defineProperty(KIND_LABEL, k, { enumerable: true, get: () => tr('convert.detect.kind_' + k) });
for (const e of RAW.EXTS) Object.defineProperty(KIND_LABEL, e, { enumerable: true, get: () => tr('convert.detect.kind_raw', { camera: RAW.FORMATS[e].label }) });
