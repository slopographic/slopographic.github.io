/* Search words for the Convert to menus (shared/ui/menubutton.js matches the label, the id and these), for the conversions
 * defined in catalog.js. The newer modules (heic.js, data-more.js, media-more.js, doc-out.js) carry their own `keywords`.
 * catalog.js adds these to its entries; targets.js keywordsOf also adds each conversion's output extension and group. */
export const KEYWORDS = {
  'to-mp4': ['video', 'h264', 'mpeg'], 'to-mov': ['quicktime', 'video', 'apple'], 'to-webm': ['video', 'vp8'],
  'video-to-gif': ['animation', 'animated'], 'frame-to-webp': ['still', 'screenshot', 'thumbnail'], 'frame-to-png': ['still', 'screenshot', 'thumbnail'],
  'frame-to-jpg': ['still', 'screenshot', 'thumbnail', 'jpeg'], 'to-wav': ['audio', 'sound', 'pcm'], 'to-mp3': ['audio', 'sound', 'music'],
  'to-png': ['picture', 'image', 'lossless'], 'to-jpg': ['jpeg', 'picture', 'photo', 'image'], 'to-webp': ['picture', 'image', 'web'],
  'to-bmp': ['bitmap', 'picture', 'image'], 'to-ico': ['icon', 'favicon'], 'images-to-pdf': ['scan', 'combine', 'document'],
  'pdf-to-images': ['png', 'jpg', 'jpeg', 'picture', 'pages'], 'pdf-to-html': ['web', 'page'], 'pdf-to-docx': ['word', 'doc', 'edit'],
  'pdf-to-xlsx': ['excel', 'table', 'spreadsheet'], 'pdf-to-pptx': ['powerpoint', 'slides', 'presentation'], 'merge-pdf': ['combine', 'join'],
  'split-pdf': ['extract', 'pages'], 'csv-to-json': ['table'], 'json-to-csv': ['table', 'spreadsheet'], 'csv-to-xlsx': ['excel', 'spreadsheet'],
  'csv-to-vcf': ['contacts', 'vcard', 'address book'], 'xlsx-to-vcf': ['contacts', 'vcard', 'excel'], 'vcf-to-csv': ['contacts', 'address book'],   // i18n-ignore: search words
  'vcf-to-xlsx': ['contacts', 'excel'], 'vcf-to-json': ['contacts'], 'md-to-html': ['markdown', 'web'], 'html-to-text': ['plain', 'strip'],
  'base64-encode': ['data uri', 'encode'], 'base64-decode': ['decode'], 'url-encode': ['percent', 'escape'], 'url-decode': ['percent', 'unescape'],
  'line-endings': ['crlf', 'lf', 'newline', 'windows', 'unix'], 'eml-to-html': ['email', 'mail'], 'eml-to-text': ['email', 'mail'],
  'eml-attachments': ['email', 'mail', 'attachments'], 'ics-to-csv': ['calendar', 'events'], 'ics-to-json': ['calendar', 'events'],
  'xml-to-json': ['data'], unzip: ['extract', 'archive'], 'zip-files': ['compress', 'archive'],
  'raw-to-jpg': ['camera', 'jpeg', 'develop'], 'raw-to-png': ['camera', 'develop'], 'raw-to-webp': ['camera', 'develop'],
};
