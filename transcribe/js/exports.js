/* Slop Transcribe: one transcript as a file. Text and Word take the person's corrections when there are any; subtitles
 * (SRT, WebVTT) keep the timed segments as the engine heard them. The formats themselves are SlopTranscript
 * (aitools/transcript.js) and the Word writer is shared/office/docx.js.
 *   FORMATS                          [{ id, label, ext, type }]
 *   fileOf(item, format, { times })  -> Promise<{ name, blob }>
 *   presetOf(search)                 -> { format? }: the file format a task page's link asks for (?format=srt) */
import { docxBlob } from '../../shared/office/docx.js';

export const FORMATS = [
  { id: 'txt', label: 'Text (.txt)', ext: 'txt', type: 'text/plain' },   // i18n-ignore: the page shows transcribe.fmt.<id>
  { id: 'docx', label: 'Word (.docx)', ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },   // i18n-ignore: the page shows transcribe.fmt.<id>
  { id: 'srt', label: 'Subtitles (.srt)', ext: 'srt', type: 'application/x-subrip' },   // i18n-ignore: the page shows transcribe.fmt.<id>
  { id: 'vtt', label: 'Web subtitles (.vtt)', ext: 'vtt', type: 'text/vtt' },   // i18n-ignore: the page shows transcribe.fmt.<id>
];
const X = () => globalThis.SlopTranscript;

/** Pure: the preset in a page address. Only a known format is kept; anything else is ignored. For this visit only. */
export function presetOf(search) {
  const f = new URLSearchParams(search || '').get('format');
  return FORMATS.some((x) => x.id === f) ? { format: f } : {};
}

/** The file name without its extension (a recording gets its own name). */
export const stem = (name) => String(name || 'transcript').replace(/\.[^.]+$/, '') || 'transcript';

/** Pure: the text of an item: the corrections when the person made any, else the segments (with times if asked). */
export function textOf(item, { times = false } = {}) {
  return item.text != null ? item.text : X().txt(item.segments, { times });
}

/** A line under the Word title: the source file, its length and the language heard. */
const metaOf = (item) => [item.name, item.seconds ? X().clock(item.seconds) : '', item.language ? `language ${item.language}` : ''].filter(Boolean).join(' · ');

export async function fileOf(item, format, { times = false } = {}) {
  const f = FORMATS.find((x) => x.id === format);
  if (!f) throw new Error(`no format ${format}`);
  const name = `${stem(item.name)}.${f.ext}`;
  if (format === 'srt') return { name, blob: new Blob([X().srt(item.segments)], { type: f.type }) };
  if (format === 'vtt') return { name, blob: new Blob([X().vtt(item.segments)], { type: f.type }) };
  if (format === 'txt') return { name, blob: new Blob([textOf(item, { times })], { type: f.type }) };
  // Word: the corrected text as paragraphs (one per line), or the segments grouped into paragraphs at pauses
  const blocks = item.text != null
    ? [{ type: 'heading', level: 1, text: stem(item.name) }, { type: 'paragraph', runs: [{ text: metaOf(item), italic: true }] },
      ...item.text.split(/\n+/).filter((l) => l.trim()).map((l) => ({ type: 'paragraph', text: l.trim() }))]
    : X().docxBlocks(stem(item.name), item.segments, { meta: metaOf(item), times });
  return { name, blob: await docxBlob(blocks, { title: stem(item.name) }) };
}
