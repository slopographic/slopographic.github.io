/* What the route finder (chain.js) needs to know about each conversion, beyond its input kinds and its output: catalog.js
 * copies these onto its entries (like keywords.js), so the catalog stays the one source.
 *   lossy: true     the conversion loses something (quality, structure, text): a route avoids it when a lossless one is as short
 *   cost: n         its own penalty instead (xlsx to CSV or JSON reads one sheet unless told otherwise)
 *   chain: 'first'  only as the first step: it needs the original file (text in a real PDF, a CSV of contacts)
 *   chain: false    never part of a route (it keeps the kind, or makes a folder of anything)
 * Conversions in the Encoding and Archives groups, and the ones that take any file, are never in a found route either. */
const LOSSY = ['to-jpg', 'to-webp', 'to-avif', 'to-ico', 'to-bmp', 'pdf-to-images', 'pdf-to-pptx', 'html-to-text', 'eml-to-text',
  'json-to-csv', 'json-to-toml', 'vtt-to-srt', 'to-mp3', 'to-webm', 'frame-to-webp', 'frame-to-jpg', 'html-to-pdf',
  'heic-to-jpg', 'heic-to-webp', 'raw-to-jpg', 'raw-to-webp', 'to-ogg', 'to-opus', 'to-m4a', 'gif-to-mp4', 'pptx-to-images',
  'epub-to-md', 'epub-to-html', 'ass-to-srt', 'ass-to-vtt', 'geojson-to-gpx', 'geojson-to-csv'];
// Word to HTML, Markdown or text and PowerPoint to text only from a real document (not one made from text or a picture on the way)
const FIRST = ['pdf-to-html', 'pdf-to-docx', 'pdf-to-xlsx', 'pdf-to-text', 'csv-to-vcf', 'xlsx-to-vcf', 'docx-to-html', 'docx-to-md', 'docx-to-text', 'pptx-to-text'];
const NEVER = ['line-endings', 'json-format', 'subs-shift', 'eml-attachments', 'merge-pdf', 'split-pdf',
  'csv-separator', 'text-to-utf8', 'audio-trim', 'video-trim', 'favicon-pack'];   // same kind, a piece of the file, or a folder of icons

export const CHAIN_FLAGS = {
  ...Object.fromEntries(LOSSY.map((id) => [id, { lossy: true }])),
  ...Object.fromEntries(FIRST.map((id) => [id, { chain: 'first', lossy: true }])),
  ...Object.fromEntries(NEVER.map((id) => [id, { chain: false }])),
  'epub-to-txt': { lossy: true, cost: 2 },   // a route to PDF or Word goes through Markdown, which keeps the headings
  'xlsx-to-csv': { cost: 2 }, 'xlsx-to-json': { cost: 2 }, 'video-to-gif': { lossy: true, cost: 2 },   // a GIF in between is its first frame
};
