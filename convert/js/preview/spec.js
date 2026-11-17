/* Settings for the live preview. Pure: no DOM. The limits keep the preview light: large text shows its first
 * part, large pictures are drawn smaller, and only page 1 of a PDF is rendered. Download always converts all. */
import { TEXT_KINDS } from '../core/detect.js';
export { TEXT_KINDS };

export const DEBOUNCE_MS = 150;
export const TEXT_LIMIT = 256 * 1024;   // bytes of text read for the preview
export const IMAGE_LIMIT = 12e6;        // picture bytes above which the preview draws a smaller copy
export const PREVIEW_PX = 1200;         // width of that smaller copy
export const MAX_LINES = 400;           // lines shown per text panel
export const IMAGE_KINDS = ['png', 'jpg', 'webp', 'bmp', 'gif', 'svg'];

/** Conversions whose input and output have the same lines, so a line diff says what changed. */
export const LINE_DIFF = ['line-endings', 'url-encode', 'url-decode'];

/** Conversions whose preview shows the first page only, unless the page range is typed. */
export const FIRST_PAGE_ONLY = ['pdf-to-images', 'split-pdf'];

/** Each conversion and the one that undoes it. Swap feeds the output back in as the input. */
export const REVERSE = {
  'base64-encode': 'base64-decode', 'base64-decode': 'base64-encode',
  'url-encode': 'url-decode', 'url-decode': 'url-encode',
  'csv-to-json': 'json-to-csv', 'json-to-csv': 'csv-to-json',
  'json-to-yaml': 'yaml-to-json', 'yaml-to-json': 'json-to-yaml', 'json-to-toml': 'toml-to-json', 'toml-to-json': 'json-to-toml',
  'srt-to-vtt': 'vtt-to-srt', 'vtt-to-srt': 'srt-to-vtt',
  'jsonl-to-json': 'json-to-jsonl', 'json-to-jsonl': 'jsonl-to-json', 'gpx-to-geojson': 'geojson-to-gpx', 'geojson-to-gpx': 'gpx-to-geojson',
};

/** True when a conversion takes typed text (any text kind, or any file for Base64 encode). */
export function acceptsText(conv) {
  return !!conv && (conv.from.includes('*') || conv.from.some((k) => TEXT_KINDS.includes(k)));
}
