/* The conversion catalogue. Each entry says which file kinds it takes ('*' = any), its options, and a
 * run(files, options) that returns [{ name, blob }]. mode 'each' runs once per file, 'combine' once for
 * all files together. Pure orchestration: the work is done by the modules it imports. */
import { convertImage, imageForPdf } from './image.js';
import { imagesToPdf } from './pdf-images.js';
import { pdfToImages } from './pdf-raster.js';
import { pdfToHtml } from './pdf-html.js';
import { pdfToDocx, pdfToXlsx } from '../../../shared/convert/pdf-office.js';
import { pdfToPptx } from '../../../shared/convert/pdf-pptx.js';
import { mergePdfs, extractPages, splitPages } from './pdf-ops.js';
import { csvToJson, jsonToCsv, parseCsv } from './csv.js';
import { rowsToXlsx } from './xlsx.js';
import { markdownToHtml } from './markdown.js';
import { htmlToText } from './html-text.js';
import { bytesToBase64, base64ToBytes, urlEncode, urlDecode, setLineEndings, decodeText, EOLS } from './text.js';
import { detectKind, EXT_OF_KIND } from './detect.js';
import { csvToVcf, xlsxToVcf, vcfToCsv, vcfToXlsx, vcfToJson } from './vcf.js';
import { stemOf as base } from '../io/files.js';
import { decodeAudio, channelsOf, encodeWav, encodeMp3, loadLame } from './audio.js';
import { convertVideo } from './ffmpeg-engine.js';
import { emlToHtml, emlToText, emlAttachmentsZip, icsToCsv, icsToJson, xmlToJson, unzipEntries, zipFiles } from './mail.js';
import { FINANCE } from './finance.js';
import { THREED } from './threed.js';
import { RAW } from './raw.js';
import { HEIC } from './heic.js';
import { DATA_MORE } from './data-more.js';
import { MEDIA_MORE } from './media-more.js';
import { DOC_OUT } from './doc-out.js';
import { OFFICE } from './office.js';
import { PDF_EXTRA } from './pdf-extra.js';
import { PDF_LOCK } from './pdf-lock.js';
import { TEXT_MORE, TO_UTF8, DELIM } from './text-more.js';
import { MEDIA_GEO } from './media-geo.js';
import { KEYWORDS } from './keywords.js';
import { CHAIN_FLAGS } from './chain-flags.js';
import { register } from '../../../shared/ops/registry.js';
import { tr } from './i18n.js';

/** A select option [value, label] whose label follows the language (labels and hints of the entries are getters too). */
const ch = (v, label) => Object.defineProperty([v], 1, { get: label, enumerable: true });

const IMAGE = ['png', 'jpg', 'webp', 'bmp', 'gif', 'svg', 'avif', 'ico'];
const SIZE = [
  { key: 'width', type: 'number', get label() { return tr('convert.opt.width_px'); }, min: 1, max: 10000, get hint() { return tr('convert.opt.width_px_hint'); } },
  { key: 'height', type: 'number', get label() { return tr('convert.opt.height_px'); }, min: 1, max: 10000 },
];
const QUALITY = { key: 'quality', type: 'range', get label() { return tr('convert.opt.quality'); }, min: 10, max: 100, value: 90 };
const BACKGROUND = { key: 'background', type: 'color', get label() { return tr('convert.opt.background_for_transparency'); }, value: '#ffffff' };
const EOL = { key: 'eol', type: 'select', get label() { return tr('convert.opt.line_endings'); }, value: 'lf', options: [ch('lf', () => tr('convert.opt.eol_lf')), ch('crlf', () => tr('convert.opt.eol_crlf')), ch('cr', () => tr('convert.opt.eol_cr'))] };

function imageTo(to) {
  return async (files, o) => {
    const f = files[0];
    const r = await convertImage(f.file, { kind: f.kind, to, width: o.width, height: o.height, quality: (o.quality ?? 90) / 100, background: o.background, icoSize: o.icoSize });
    return [{ name: `${base(f.name)}.${r.ext}`, blob: r.blob }];
  };
}
const AUDIO_IN = ['mp4', 'webm', 'mov', 'm4a', 'mp3', 'wav', 'ogg', 'flac'];
const BITRATE = { key: 'bitrate', type: 'select', get label() { return tr('convert.opt.bitrate'); }, value: '128', options: [['128', '128 kbps'], ['192', '192 kbps'], ['320', '320 kbps']] };
/** The sound of a video or audio file, as WAV or MP3. Video files give their audio track only. */
function audioTo(to) {
  return async (files, o) => {
    const f = files[0];
    const buf = await decodeAudio(new Uint8Array(await f.file.arrayBuffer()));
    const chans = channelsOf(buf);
    if (to === 'wav') return [{ name: `${base(f.name)}.wav`, blob: new Blob([encodeWav(chans, buf.sampleRate)], { type: 'audio/wav' }) }];
    const lame = await loadLame();
    return [{ name: `${base(f.name)}.mp3`, blob: encodeMp3(lame, chans, buf.sampleRate, Number(o.bitrate) || 128) }];
  };
}
const VIDEO_IN = ['mp4', 'webm', 'mov'];
const CRF = { key: 'crf', type: 'range', get label() { return tr('convert.opt.quality_lower_is_better'); }, min: 18, max: 40, value: 23 };
const TIME = { key: 'time', type: 'number', get label() { return tr('convert.opt.time_seconds'); }, min: 0, max: 36000, value: 1, get hint() { return tr('convert.opt.time_seconds_hint'); } };
const GIF_WIDTH = { key: 'width', type: 'number', get label() { return tr('convert.opt.width_px'); }, min: 16, max: 1920, value: 480, get hint() { return tr('convert.opt.width_px_hint2'); } };
const GIF_FPS = { key: 'fps', type: 'number', get label() { return tr('convert.opt.frames_per_second'); }, min: 1, max: 30, value: 10 };
/** Video conversions with ffmpeg.wasm. Where the codecs already fit the new container, the streams are copied (no quality loss).
 *  Their catalog entries say engine: 'ffmpeg', so the page asks before the engine's first download, and only then. */
function videoTo(to) {
  return async (files, o) => {
    const f = files[0];
    const base_ = base(f.name);
    const q = Number(o.crf ?? 23);
    if (to === 'mp4') return [await convertVideo(f.file, {
      name: base_, output: 'mp4',
      args: (i, out) => ['-i', i, '-c', 'copy', '-movflags', '+faststart', out],
      fallback: (i, out) => ['-i', i, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out],
    })];
    if (to === 'mov') return [await convertVideo(f.file, {
      name: base_, output: 'mov',
      args: (i, out) => ['-i', i, '-c', 'copy', '-f', 'mov', out],
      fallback: (i, out) => ['-i', i, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(q), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-f', 'mov', out],
    })];
    if (to === 'webm') return [await convertVideo(f.file, {
      name: base_, output: 'webm',
      args: (i, out) => ['-i', i, '-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', '-b:a', '96k', out],
    })];
    if (to === 'gif') {
      const w = Math.max(16, Math.round(Number(o.width) || 480)), fps = Math.max(1, Math.min(30, Math.round(Number(o.fps) || 10)));
      return [await convertVideo(f.file, {
        name: base_, output: 'gif',
        args: (i, out) => ['-i', i, '-vf', `fps=${fps},scale=${w}:-2:flags=lanczos`, '-loop', '0', out],
      })];
    }
    // a single frame as a picture: webp, png or jpg
    const t = Math.max(0, Number(o.time) || 0);
    const extra = to === 'webp' ? ['-quality', '85'] : to === 'jpg' ? ['-q:v', '3'] : [];
    return [await convertVideo(f.file, {
      name: base_, output: to,
      args: (i, out) => ['-ss', String(t), '-i', i, '-frames:v', '1', ...extra, out],
    })];
  };
}

const text = (blob) => blob.text();
const out = (name, data, type) => ({ name, blob: new Blob([data], { type }) });

export const CONVERSIONS = [
  { id: 'to-mp4', engine: 'ffmpeg', get label() { return tr('convert.conv.to_mp4'); }, group: 'Audio and video', from: ['webm', 'mov'], ext: 'mp4', mode: 'each', options: [CRF], run: videoTo('mp4') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-mov', engine: 'ffmpeg', get label() { return tr('convert.conv.to_mov'); }, group: 'Audio and video', from: ['mp4', 'webm'], ext: 'mov', mode: 'each', options: [CRF], run: videoTo('mov') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-webm', engine: 'ffmpeg', get label() { return tr('convert.conv.to_webm'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'webm', mode: 'each', options: [], run: videoTo('webm') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'video-to-gif', engine: 'ffmpeg', get label() { return tr('convert.conv.video_to_gif'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'gif', mode: 'each', options: [GIF_WIDTH, GIF_FPS], run: videoTo('gif') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'frame-to-webp', engine: 'ffmpeg', get label() { return tr('convert.conv.frame_to_webp'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'webp', mode: 'each', options: [TIME], run: videoTo('webp') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'frame-to-png', engine: 'ffmpeg', get label() { return tr('convert.conv.frame_to_png'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'png', mode: 'each', options: [TIME], run: videoTo('png') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'frame-to-jpg', engine: 'ffmpeg', get label() { return tr('convert.conv.frame_to_jpg'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'jpg', mode: 'each', options: [TIME], run: videoTo('jpg') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-wav', get label() { return tr('convert.conv.to_wav'); }, group: 'Audio and video', from: AUDIO_IN, ext: 'wav', mode: 'each', options: [], run: audioTo('wav') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-mp3', get label() { return tr('convert.conv.to_mp3'); }, group: 'Audio and video', from: AUDIO_IN, ext: 'mp3', mode: 'each', options: [BITRATE], run: audioTo('mp3') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-png', get label() { return tr('convert.conv.to_png'); }, group: 'Images', from: ['jpg', 'webp', 'bmp', 'gif', 'svg', 'avif', 'ico'], ext: 'png', mode: 'each', options: [...SIZE], run: imageTo('png') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-jpg', get label() { return tr('convert.conv.to_jpg'); }, group: 'Images', from: ['png', 'webp', 'bmp', 'gif', 'svg', 'avif', 'ico'], ext: 'jpg', mode: 'each', options: [...SIZE, QUALITY, BACKGROUND], run: imageTo('jpg') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-webp', get label() { return tr('convert.conv.to_webp'); }, group: 'Images', from: ['png', 'jpg', 'bmp', 'gif', 'svg', 'avif', 'ico'], ext: 'webp', mode: 'each', options: [...SIZE, QUALITY], run: imageTo('webp') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-bmp', get label() { return tr('convert.conv.to_bmp'); }, group: 'Images', from: ['png', 'jpg', 'webp', 'gif', 'svg', 'avif', 'ico'], ext: 'bmp', mode: 'each', options: [...SIZE, BACKGROUND], run: imageTo('bmp') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'to-ico', get label() { return tr('convert.conv.to_ico'); }, group: 'Images', from: IMAGE, ext: 'ico', mode: 'each', options: [{ key: 'icoSize', type: 'select', get label() { return tr('convert.opt.icon_size'); }, value: 256, options: [[16, '16 × 16'], [32, '32 × 32'], [48, '48 × 48'], [64, '64 × 64'], [128, '128 × 128'], [256, '256 × 256']] }, BACKGROUND], run: imageTo('ico') },   // i18n-ignore: group is an id (groupLabel)
  { id: 'images-to-pdf', get label() { return tr('convert.conv.images_to_pdf'); }, group: 'PDF', from: IMAGE, ext: 'pdf', mode: 'combine', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'page', type: 'select', get label() { return tr('convert.opt.page_size'); }, value: 'a4', options: [['a4', 'A4'], ch('letter', () => tr('convert.opt.page_letter')), ch('fit', () => tr('convert.opt.page_fit'))] },
    { key: 'margin', type: 'select', get label() { return tr('convert.opt.margin'); }, value: 36, options: [ch(0, () => tr('convert.opt.margin_none')), ch(18, () => tr('convert.opt.margin_small')), ch(36, () => tr('convert.opt.margin_normal'))] },
  ], run: async (files, o) => {
    const items = [];
    for (const f of files) items.push(await imageForPdf(f.file, f.kind));
    const bytes = await imagesToPdf(items, { page: o.page, margin: Number(o.margin) });
    return [{ name: files.length === 1 ? `${base(files[0].name)}.pdf` : 'images.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }];
  } },
  { id: 'pdf-to-images', get label() { return tr('convert.conv.pdf_to_images'); }, group: 'PDF', from: ['pdf'], ext: 'png', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'format', type: 'select', get label() { return tr('convert.opt.format'); }, value: 'png', options: [['png', 'PNG'], ['jpg', 'JPG']] },
    { key: 'pages', type: 'text', get label() { return tr('convert.opt.pages'); }, get placeholder() { return tr('convert.opt.pages_ph'); }, get hint() { return tr('convert.opt.pages_hint'); } },
    { key: 'scale', type: 'select', get label() { return tr('convert.opt.resolution'); }, value: 2, options: [[1, '72 dpi'], [2, '144 dpi'], [3, '216 dpi']] },
    QUALITY,
  ], run: async (files, o) => {
    const f = files[0];
    const pages = await pdfToImages(new Uint8Array(await f.file.arrayBuffer()), { pages: o.pages, scale: o.scale, format: o.format, quality: (o.quality ?? 92) / 100 });
    return pages.map((p) => ({ name: `${base(f.name)}-page-${p.pageNo}.${o.format === 'jpg' ? 'jpg' : 'png'}`, blob: p.blob }));
  } },
  { id: 'pdf-to-html', get label() { return tr('convert.conv.pdf_to_html'); }, group: 'PDF', from: ['pdf'], ext: 'html', mode: 'each',   // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.conv.pdf_to_html_note'); },
    options: [{ key: 'pages', type: 'text', get label() { return tr('convert.opt.pages'); }, get placeholder() { return tr('convert.opt.pages_ph'); }, get hint() { return tr('convert.opt.pages_hint'); } }],
    run: async (files, o) => {
      const f = files[0];
      const html = await pdfToHtml(new Uint8Array(await f.file.arrayBuffer()), { pages: o.pages, title: base(f.name) });
      return [out(`${base(f.name)}.html`, html, 'text/html')];
    } },
  { id: 'pdf-to-docx', get label() { return tr('convert.conv.pdf_to_docx'); }, group: 'PDF', from: ['pdf'], ext: 'docx', mode: 'each',   // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.conv.pdf_to_docx_note'); },
    options: [{ key: 'pages', type: 'text', get label() { return tr('convert.opt.pages'); }, get placeholder() { return tr('convert.opt.pages_ph'); }, get hint() { return tr('convert.opt.pages_hint'); } }], run: async (files, o) => {
      const f = files[0];
      return [{ name: `${base(f.name)}.docx`, blob: await pdfToDocx(new Uint8Array(await f.file.arrayBuffer()), { pages: o.pages, title: base(f.name) }) }];
    } },
  { id: 'pdf-to-xlsx', get label() { return tr('convert.conv.pdf_to_xlsx'); }, group: 'PDF', from: ['pdf'], ext: 'xlsx', mode: 'each',   // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.conv.pdf_to_xlsx_note'); },
    options: [{ key: 'pages', type: 'text', get label() { return tr('convert.opt.pages'); }, get placeholder() { return tr('convert.opt.pages_ph'); }, get hint() { return tr('convert.opt.pages_hint'); } }], run: async (files, o) => {
      const f = files[0];
      return [{ name: `${base(f.name)}.xlsx`, blob: await pdfToXlsx(new Uint8Array(await f.file.arrayBuffer()), { pages: o.pages }) }];
    } },
  { id: 'pdf-to-pptx', get label() { return tr('convert.conv.pdf_to_pptx'); }, group: 'PDF', from: ['pdf'], ext: 'pptx', mode: 'each',   // i18n-ignore: group is an id (groupLabel)
    get note() { return tr('convert.conv.pdf_to_pptx_note'); },
    options: [{ key: 'pages', type: 'text', get label() { return tr('convert.opt.pages'); }, get placeholder() { return tr('convert.opt.pages_ph'); }, get hint() { return tr('convert.opt.pages_hint'); } }], run: async (files, o) => {
      const f = files[0];
      return [{ name: `${base(f.name)}.pptx`, blob: await pdfToPptx(new Uint8Array(await f.file.arrayBuffer()), { pages: o.pages }) }];
    } },
  { id: 'merge-pdf', get label() { return tr('convert.conv.merge_pdf'); }, group: 'PDF', from: ['pdf'], ext: 'pdf', mode: 'combine', options: [], run: async (files) => {   // i18n-ignore: group is an id (groupLabel)
    const bytes = await mergePdfs(await Promise.all(files.map(async (f) => new Uint8Array(await f.file.arrayBuffer()))));
    return [{ name: 'merged.pdf', blob: new Blob([bytes], { type: 'application/pdf' }) }];
  } },
  { id: 'split-pdf', get label() { return tr('convert.conv.split_pdf'); }, group: 'PDF', from: ['pdf'], ext: 'pdf', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'pages', type: 'text', get label() { return tr('convert.opt.pages_to_extract'); }, get placeholder() { return tr('convert.opt.pages_to_extract_ph'); }, get hint() { return tr('convert.opt.pages_to_extract_hint'); } },
  ], run: async (files, o) => {
    const f = files[0];
    const bytes = new Uint8Array(await f.file.arrayBuffer());
    if (String(o.pages || '').trim()) return [{ name: `${base(f.name)}-pages.pdf`, blob: new Blob([await extractPages(bytes, o.pages)], { type: 'application/pdf' }) }];
    return (await splitPages(bytes)).map((p) => ({ name: `${base(f.name)}-page-${p.pageNo}.pdf`, blob: new Blob([p.bytes], { type: 'application/pdf' }) }));
  } },
  { id: 'csv-to-json', get label() { return tr('convert.conv.csv_to_json'); }, group: 'Data', from: ['csv', 'txt'], ext: 'json', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    DELIM,
    { key: 'header', type: 'checkbox', get label() { return tr('convert.opt.first_row_has_column_names'); }, value: true },
    { key: 'numbers', type: 'checkbox', get label() { return tr('convert.opt.write_plain_numbers_as_json_numbers'); }, value: false },
  ], run: async (files, o) => {
    const { json } = csvToJson(decodeText(new Uint8Array(await files[0].file.arrayBuffer())), { header: o.header !== false, numbers: !!o.numbers, delimiter: o.delimiter === 'auto' ? undefined : o.delimiter });
    return [out(`${base(files[0].name)}.json`, json, 'application/json')];
  } },
  { id: 'json-to-csv', get label() { return tr('convert.conv.json_to_csv'); }, group: 'Data', from: ['json', 'txt'], ext: 'csv', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'delimiter', type: 'select', get label() { return tr('convert.opt.separator'); }, value: ',', options: [ch(',', () => tr('convert.opt.sep_comma')), ch(';', () => tr('convert.opt.sep_semicolon')), ch('\t', () => tr('convert.opt.sep_tab'))] }, EOL,
    { key: 'flatten', type: 'checkbox', get label() { return tr('convert.opt.nested_values_in_their_own_columns_a_b_t'); }, value: false },
  ], run: async (files, o) => {
    const csv = jsonToCsv(decodeText(new Uint8Array(await files[0].file.arrayBuffer())), { delimiter: o.delimiter, eol: EOLS[o.eol] || '\n', flatten: !!o.flatten });
    return [out(`${base(files[0].name)}.csv`, csv, 'text/csv')];
  } },
  { id: 'csv-to-xlsx', get label() { return tr('convert.conv.csv_to_xlsx'); }, group: 'Data', from: ['csv', 'txt'], ext: 'xlsx', mode: 'each', options: [DELIM], run: async (files, o) => {   // i18n-ignore: group is an id (groupLabel)
    const rows = parseCsv(decodeText(new Uint8Array(await files[0].file.arrayBuffer())), { delimiter: o.delimiter === 'auto' ? undefined : o.delimiter });
    return [{ name: `${base(files[0].name)}.xlsx`, blob: await rowsToXlsx(rows) }];
  } },
  { id: 'csv-to-vcf', get label() { return tr('convert.conv.csv_to_vcf'); }, group: 'Data', from: ['csv', 'txt'], ext: 'vcf', mode: 'each', options: [DELIM], run: csvToVcf },   // i18n-ignore: group is an id (groupLabel)
  ...DATA_MORE.slice(0, 1),   // Spreadsheet to CSV first: the default for a workbook (core/data-more.js)
  { id: 'xlsx-to-vcf', get label() { return tr('convert.conv.xlsx_to_vcf'); }, group: 'Data', from: ['xlsx'], ext: 'vcf', mode: 'each', options: [], run: xlsxToVcf },   // i18n-ignore: group is an id (groupLabel)
  ...DATA_MORE.slice(1),   // spreadsheets and JSON, YAML, TOML, XML, subtitles (core/data-more.js)
  { id: 'vcf-to-csv', get label() { return tr('convert.conv.vcf_to_csv'); }, group: 'Data', from: ['vcf'], ext: 'csv', mode: 'each', options: [], run: vcfToCsv },   // i18n-ignore: group is an id (groupLabel)
  { id: 'vcf-to-xlsx', get label() { return tr('convert.conv.vcf_to_xlsx'); }, group: 'Data', from: ['vcf'], ext: 'xlsx', mode: 'each', options: [], run: vcfToXlsx },   // i18n-ignore: group is an id (groupLabel)
  { id: 'vcf-to-json', get label() { return tr('convert.conv.vcf_to_json'); }, group: 'Data', from: ['vcf'], ext: 'json', mode: 'each', options: [], run: vcfToJson },   // i18n-ignore: group is an id (groupLabel)
  { id: 'md-to-html', get label() { return tr('convert.conv.md_to_html'); }, group: 'Text', from: ['md', 'txt'], ext: 'html', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'standalone', type: 'checkbox', get label() { return tr('convert.opt.full_web_page_not_just_the_fragment'); }, value: true },
  ], run: async (files, o) => {
    const html = markdownToHtml(await text(files[0].file), { standalone: o.standalone !== false, title: base(files[0].name) });
    return [out(`${base(files[0].name)}.html`, html, 'text/html')];
  } },
  { id: 'html-to-text', get label() { return tr('convert.conv.html_to_text'); }, group: 'Text', from: ['html'], ext: 'txt', mode: 'each', options: [], run: async (files) => {   // i18n-ignore: group is an id (groupLabel)
    return [out(`${base(files[0].name)}.txt`, htmlToText(await text(files[0].file)), 'text/plain')];
  } },
  { id: 'base64-encode', get label() { return tr('convert.conv.base64_encode'); }, group: 'Encoding', from: ['*'], ext: 'txt', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'wrap', type: 'select', get label() { return tr('convert.opt.line_length'); }, value: 0, options: [ch(0, () => tr('convert.opt.wrap_none')), ch(76, () => tr('convert.opt.wrap_mime'))] },
  ], run: async (files, o) => {
    const bytes = new Uint8Array(await files[0].file.arrayBuffer());
    return [out(`${base(files[0].name)}.base64.txt`, bytesToBase64(bytes, { wrap: Number(o.wrap) || 0 }), 'text/plain')];
  } },
  { id: 'base64-decode', get label() { return tr('convert.conv.base64_decode'); }, group: 'Encoding', from: ['txt', 'csv', 'json', 'md', 'html'], mode: 'each', options: [], run: async (files) => {   // i18n-ignore: group is an id (groupLabel)
    const bytes = base64ToBytes(await text(files[0].file));
    const kind = detectKind('', '', bytes.subarray(0, 512));
    const ext = EXT_OF_KIND[kind] || 'bin';
    const name = base(files[0].name).replace(/\.base64$/, '');
    return [{ name: `${name}.${ext}`, blob: new Blob([bytes]) }];
  } },
  { id: 'url-encode', get label() { return tr('convert.conv.url_encode'); }, group: 'Encoding', from: ['txt', 'csv', 'json', 'md', 'html'], ext: 'txt', mode: 'each', options: [   // i18n-ignore: group is an id (groupLabel)
    { key: 'full', type: 'checkbox', get label() { return tr('convert.opt.keep_url_punctuation'); }, value: false },
  ], run: async (files, o) => [out(`${base(files[0].name)}.url.txt`, urlEncode(await text(files[0].file), { full: !!o.full }), 'text/plain')] },
  { id: 'url-decode', get label() { return tr('convert.conv.url_decode'); }, group: 'Encoding', from: ['txt', 'csv', 'json', 'md', 'html'], ext: 'txt', mode: 'each', options: [], run: async (files) => {   // i18n-ignore: group is an id (groupLabel)
    return [out(`${base(files[0].name)}.decoded.txt`, urlDecode(await text(files[0].file)), 'text/plain')];
  } },
  ...DOC_OUT,   // text and Markdown to PDF and DOCX with the Slop Docs engine (core/doc-out.js)
  ...OFFICE,   // Word to PDF, HTML, Markdown, text (core/office.js, Slop Docs); PowerPoint to PDF, pictures, text (core/slides-out.js, Slop Slides)
  { id: 'line-endings', get label() { return tr('convert.conv.line_endings'); }, group: 'Text', from: ['txt', 'csv', 'json', 'md', 'html', 'yaml', 'toml', 'xml', 'srt', 'vtt'], ext: 'txt', mode: 'each', options: [EOL], run: async (files, o) => {   // i18n-ignore: group is an id (groupLabel)
    const f = files[0];
    const ext = /\.[^.]+$/.test(f.name) ? f.name.split('.').pop().toLowerCase() : 'txt';
    const body = setLineEndings(decodeText(new Uint8Array(await f.file.arrayBuffer())), o.eol);
    return [out(`${base(f.name)}-${o.eol}.${ext}`, body, 'text/plain')];
  } },
  // Mail, calendar and XML. The readers are the apps' own (shared/mail, shared/calendar); see core/mail.js.
  { id: 'eml-to-html', get label() { return tr('convert.conv.eml_to_html'); }, group: 'Email', from: ['eml'], ext: 'html', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}.html`, blob: new Blob([await emlToHtml(new Uint8Array(await f.file.arrayBuffer()))], { type: 'text/html' }) }]; } },   // i18n-ignore: group is an id (groupLabel)
  { id: 'eml-to-text', get label() { return tr('convert.conv.eml_to_text'); }, group: 'Email', from: ['eml'], ext: 'txt', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}.txt`, blob: new Blob([await emlToText(new Uint8Array(await f.file.arrayBuffer()))], { type: 'text/plain' }) }]; } },   // i18n-ignore: group is an id (groupLabel)
  { id: 'eml-attachments', get label() { return tr('convert.conv.eml_attachments'); }, group: 'Email', from: ['eml'], ext: 'zip', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}-attachments.zip`, blob: await emlAttachmentsZip(new Uint8Array(await f.file.arrayBuffer())) }]; } },   // i18n-ignore: group is an id (groupLabel)
  { id: 'ics-to-csv', get label() { return tr('convert.conv.ics_to_csv'); }, group: 'Calendar', from: ['ics'], ext: 'csv', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}.csv`, blob: new Blob([await icsToCsv(await text(f.file))], { type: 'text/csv' }) }]; } },   // i18n-ignore: group is an id (groupLabel)
  { id: 'ics-to-json', get label() { return tr('convert.conv.ics_to_json'); }, group: 'Calendar', from: ['ics'], ext: 'json', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}.json`, blob: new Blob([await icsToJson(await text(f.file))], { type: 'application/json' }) }]; } },   // i18n-ignore: group is an id (groupLabel)
  { id: 'xml-to-json', get label() { return tr('convert.conv.xml_to_json'); }, group: 'Data', from: ['xml'], ext: 'json', mode: 'each', options: [], run: async (files) => { const f = files[0]; return [{ name: `${base(f.name)}.json`, blob: new Blob([xmlToJson(await text(f.file))], { type: 'application/json' }) }]; } },   // i18n-ignore: group is an id (groupLabel)
  // SIE accounting files and bank statements (OFX, QIF, camt.053, MT940): core/finance.js, readers in shared/finance.
  ...FINANCE,
  { id: 'unzip', get label() { return tr('convert.conv.unzip'); }, group: 'Archives', from: ['zip'], mode: 'each', options: [], run: async (files) => unzipEntries(files[0].file) },   // i18n-ignore: group is an id (groupLabel)
  { id: 'zip-files', get label() { return tr('convert.conv.zip_files'); }, group: 'Archives', from: ['*'], ext: 'zip', mode: 'combine', keywords: ['add to zip', 'archive', 'bundle'],   // i18n-ignore: group is an id (groupLabel)
    options: [{ key: 'zipName', type: 'text', get label() { return tr('convert.opt.zip_name'); }, value: 'files', placeholder: 'files' }],
    run: async (files, o = {}) => [{ name: `${String(o.zipName || 'files').trim().replace(/\.zip$/i, '').replace(/[\\/:*?"<>|]+/g, '_') || 'files'}.zip`, blob: await zipFiles(files) }] },
  ...RAW,   // camera RAW photos (core/raw.js)
  ...HEIC,   // HEIC and HEIF photos (core/heic.js)
  ...MEDIA_MORE,   // OGG, Opus, FLAC, M4A, GIF to MP4, AVIF (core/media-more.js)
  ...THREED,   // 3D models (core/threed.js)
  ...PDF_EXTRA,   // PDF to text, HTML to a picture PDF (core/pdf-extra.js)
  ...PDF_LOCK,   // Protect PDF with a password, Remove PDF password (core/pdf-lock.js, shared/pdf-crypto)
  ...TEXT_MORE,   // HTML to Markdown, CSV tables, JSON Lines, text to UTF-8, EPUB, ASS and SBV subtitles (core/text-more.js)
  ...MEDIA_GEO,   // favicon set, cut audio and video, GPX, KML and GeoJSON (core/media-geo.js)
  TO_UTF8,   // last: any text file, never a kind's default
];

for (const c of CONVERSIONS) if (KEYWORDS[c.id]) c.keywords = [...(c.keywords || []), ...KEYWORDS[c.id]];   // the menus' search words
for (const c of CONVERSIONS) Object.assign(c, CHAIN_FLAGS[c.id]);   // lossy, cost, chain: for the route finder (chain.js)

// The one operation registry (shared/ops/registry.js): File convert's entries are its 'convert' app; Slop Workflows adds the
// apps' own operations beside them. CONVERSIONS stays File convert's list.
register(CONVERSIONS, { app: 'convert', label: 'File convert' });   // i18n-ignore: the app's name

/** A group (c.group, an English id that chain.js compares) or a card category as the menus and cards show it. */
export const groupLabel = (g) => tr('convert.cat.' + String(g || 'Other').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));   // i18n-ignore: 'Other' is the fallback id

export const conversionById = (id) => CONVERSIONS.find((c) => c.id === id);

/** The kind a conversion makes, for its picture (SlopFlow): a format option wins (PDF to images), then the converter's ext.
 *  Base64 decode makes whatever the text held, so it is a plain 'file'. */
export function outKind(conv, opts = {}) {
  if (!conv) return '';
  return (opts && typeof opts.format === 'string' && opts.format) || conv.ext || 'file';
}

/** Conversions that accept every one of the given kinds (intersection). */
export function conversionsFor(kinds, only = null) {
  // `available`: a conversion this browser cannot do (AVIF where the canvas cannot write it) is not offered
  const list = (only ? CONVERSIONS.filter((c) => c.id === only) : CONVERSIONS).filter((c) => !c.available || c.available());
  // `with` kinds (a model's .mtl, .bin or textures) are taken only beside a kind in `from`, never on their own
  return list.filter((c) => kinds.every((k) => c.from.includes('*') || c.from.includes(k) || (c.with || []).includes(k)) && (!c.with || kinds.some((k) => c.from.includes(k))));
}
