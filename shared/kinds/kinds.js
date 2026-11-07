/* Slopographic file kinds: one table that says what kind of file a name and MIME type are.
 * The kind of a file is its extension first (the table below), then its MIME type, else 'other'.
 * Kinds: image, video, audio, document, code (code and text), model3d, archive, other.
 * CHIPS groups them for filters: Media is image + video + audio, and Photos is image only.
 * Classic script, no dependencies. Exposes window.SlopKinds (Slop Gallery uses it; Slop Drive can use it later):
 *   kindOf(name, type)        → a kind id
 *   label(kind)               → 'Code and text', '3D', …
 *   chipMatch(kind, chipId)   → true if the kind is in that chip
 *   chipsMatching(kind)       → every chip id the kind belongs to
 *   countChips(items)         → { chipId: n } for items (each item's kind from kindOf(item.name, item.type))
 * Words: shared/i18n/ui/<code>/preview.js (ui.kinds.<kind>, ui.kinds.chip_<id>), read each time (a chip's label is a getter). */
(function () {
  'use strict';
  const words = (s) => s.split(' ');
  const tr = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);
  const KIND_EXT = {};
  const addExt = (kind, list) => { for (const e of words(list)) KIND_EXT[e] = kind; };
  addExt('image', 'jpg jpeg jpe png gif webp avif bmp tif tiff heic heif ico svg');
  addExt('video', 'mp4 m4v mov webm mkv avi ogv 3gp mpg mpeg');
  addExt('audio', 'mp3 wav ogg oga flac m4a aac opus weba');
  addExt('document', 'pdf doc docx odt rtf pages xls xlsx ods numbers ppt pptx odp key epub sdoc stab sslide');
  addExt('code', 'txt md markdown csv tsv json jsonl js mjs cjs ts jsx tsx html htm css scss xml yaml yml toml ini log sql py sh c h cpp hpp java rs go rb php vcf ics srt');
  addExt('model3d', 's3d glb gltf obj stl fbx usdz');
  addExt('archive', 'zip rar 7z tar gz tgz bz2 xz');

  const MIME_EXACT = {
    'application/pdf': 'document', 'application/msword': 'document', 'application/rtf': 'document', 'application/vnd.ms-excel': 'document',
    'application/vnd.ms-powerpoint': 'document', 'application/epub+zip': 'document', 'application/x-slop-doc': 'document',
    'application/x-slop-table': 'document', 'application/x-slop-slides': 'document', 'application/x-slop-3d': 'model3d',
    'application/json': 'code', 'application/javascript': 'code', 'application/xml': 'code', 'application/x-yaml': 'code',
    'image/svg+xml': 'image', 'image/webp': 'image', 'image/gif': 'image', 'image/avif': 'image', 'video/webm': 'video',
    'application/zip': 'archive', 'application/x-zip-compressed': 'archive', 'application/x-7z-compressed': 'archive',
    'application/x-rar-compressed': 'archive', 'application/x-tar': 'archive', 'application/gzip': 'archive', 'application/x-bzip2': 'archive',
  };
  const MIME_PREFIX = [
    ['application/vnd.openxmlformats-officedocument', 'document'], ['application/vnd.oasis.opendocument', 'document'],
    ['image/', 'image'], ['video/', 'video'], ['audio/', 'audio'], ['text/', 'code'], ['model/', 'model3d'],
  ];

  const KINDS = ['image', 'video', 'audio', 'document', 'code', 'model3d', 'archive', 'other'];
  const chip = (id, kinds) => Object.defineProperty({ id, kinds }, 'label', { get: () => tr('ui.kinds.chip_' + id), enumerable: true });
  const CHIPS = [
    chip('media', ['image', 'video', 'audio']), chip('photos', ['image']), chip('videos', ['video']), chip('audio', ['audio']),
    chip('documents', ['document']), chip('code', ['code']), chip('3d', ['model3d']), chip('archives', ['archive']), chip('other', ['other']),
  ];

  /** The extension of a name, lower case, without the dot ('' if none). */
  function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function kindOf(name, type) {
    const ext = extOf(name);
    if (KIND_EXT[ext]) return KIND_EXT[ext];
    const mime = String(type || '').split(';')[0].trim().toLowerCase();
    if (MIME_EXACT[mime]) return MIME_EXACT[mime];
    for (const [p, kind] of MIME_PREFIX) if (mime.startsWith(p)) return kind;
    return 'other';
  }
  const label = (kind) => tr('ui.kinds.' + (KINDS.includes(kind) ? kind : 'other'));
  const chipMatch = (kind, chipId) => { const c = CHIPS.find((x) => x.id === chipId); return !!c && c.kinds.includes(kind); };
  const chipsMatching = (kind) => CHIPS.filter((c) => c.kinds.includes(kind)).map((c) => c.id);
  function countChips(items) {
    const out = {};
    for (const c of CHIPS) out[c.id] = 0;
    for (const it of items || []) for (const id of chipsMatching(kindOf(it.name, it.type))) out[id]++;
    return out;
  }

  window.SlopKinds = { kindOf, label, chipMatch, chipsMatching, countChips, CHIPS, KIND_EXT: Object.freeze(Object.assign({}, KIND_EXT)), extOf };
})();
