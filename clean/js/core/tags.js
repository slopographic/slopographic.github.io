/* SlopClean core: what each metadata tag is, in plain words, and which category (what the person can choose to
 * remove) it belongs to. Categories: location, date, camera, serial, software, author, copyright, description,
 * thumbnail, embedded (XMP, IPTC, Photoshop, other blocks), other (exposure settings and the rest), physical (DPI),
 * icc (colour profile). 'struct' tags are picture structure: they are never removed. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const hex = (t) => '0x' + t.toString(16).toUpperCase().padStart(4, '0');

  const CATS = [
    { id: 'location', label: 'Location (GPS)', def: true },
    { id: 'date', label: 'Dates and times', def: true },
    { id: 'camera', label: 'Camera and lens make and model', def: true },
    { id: 'serial', label: 'Serial numbers and unique IDs', def: true },
    { id: 'software', label: 'Software and computer name', def: true },
    { id: 'author', label: 'Author and camera owner', def: true },
    { id: 'copyright', label: 'Copyright notice', def: true },
    { id: 'description', label: 'Description, title and comments', def: true },
    { id: 'thumbnail', label: 'Embedded thumbnail picture', def: true },
    { id: 'embedded', label: 'XMP, IPTC, Photoshop and other blocks', def: true },
    { id: 'other', label: 'Exposure settings and other tags', def: true },
    { id: 'physical', label: 'Print size and resolution (DPI)', def: false },
    { id: 'icc', label: 'Colour profile (ICC)', def: false },
  ];
  /** Categories that describe the person or the place: a block that may hold any of them goes with them. */
  const PERSONAL = ['location', 'date', 'camera', 'serial', 'software', 'author', 'copyright', 'description'];

  const STRUCT = new Set([0x0100, 0x0101, 0x0102, 0x0103, 0x0106, 0x0111, 0x0112, 0x0115, 0x0116, 0x0117, 0x011C,
    0x013D, 0x0142, 0x0143, 0x0144, 0x0145, 0x0152, 0x0153, 0x0201, 0x0202, 0x0211, 0x0212, 0x0213, 0x0214]);
  /** Child-directory pointers: the tag value is an offset to another IFD. */
  const POINTERS = { 0x8769: 'exif', 0x8825: 'gps', 0xA005: 'interop' };
  /** Tags whose value is a whole block (XMP, IPTC, Photoshop) that may carry personal data in any form. */
  const BLOCKS = new Set([0x02BC, 0x83BB, 0x8649]);

  const T = (cat, label) => ({ cat, label });
  const MAIN = {
    0x000B: T('software', 'Processing software'), 0x010D: T('description', 'Document name'),
    0x010E: T('description', 'Image description'), 0x010F: T('camera', 'Camera make'),
    0x0110: T('camera', 'Camera model'), 0x011A: T('physical', 'Horizontal resolution'),
    0x011B: T('physical', 'Vertical resolution'), 0x0128: T('physical', 'Resolution unit'),
    0x0131: T('software', 'Software'), 0x0132: T('date', 'Date and time modified'),
    0x013B: T('author', 'Artist'), 0x013C: T('software', 'Computer (host)'),
    0x02BC: T('embedded', 'XMP metadata block'), 0x83BB: T('embedded', 'IPTC metadata block'),
    0x8649: T('embedded', 'Photoshop metadata block'), 0x8298: T('copyright', 'Copyright notice'),
    0x8773: T('icc', 'Colour profile (ICC)'), 0x9C9B: T('description', 'Title'),
    0x9C9C: T('description', 'Comment'), 0x9C9D: T('author', 'Author'),
    0x9C9E: T('description', 'Keywords'), 0x9C9F: T('description', 'Subject'),
    0x4746: T('other', 'Rating'), 0x4749: T('other', 'Rating (percent)'),
  };
  const EXIF = {
    0x829A: T('other', 'Exposure time'), 0x829D: T('other', 'Aperture'), 0x8822: T('other', 'Exposure program'),
    0x8827: T('other', 'ISO speed'), 0x8830: T('other', 'Sensitivity type'), 0x9000: T('other', 'EXIF version'),
    0x9003: T('date', 'Date taken'), 0x9004: T('date', 'Date digitised'), 0x9010: T('date', 'Time zone offset'),
    0x9011: T('date', 'Time zone offset (taken)'), 0x9012: T('date', 'Time zone offset (digitised)'),
    0x9201: T('other', 'Shutter speed'), 0x9202: T('other', 'Aperture value'), 0x9204: T('other', 'Exposure bias'),
    0x9207: T('other', 'Metering mode'), 0x9209: T('other', 'Flash'), 0x920A: T('other', 'Focal length'),
    0x9286: T('description', 'User comment'), 0x9290: T('date', 'Sub-second time'),
    0x9291: T('date', 'Sub-second time (taken)'), 0x9292: T('date', 'Sub-second time (digitised)'),
    0x927C: T('camera', 'Maker notes (can hold camera serials and settings)'), 0xA001: T('other', 'Colour space'),
    0xA002: T('other', 'Image width'), 0xA003: T('other', 'Image height'), 0xA401: T('other', 'Rendering'),
    0xA402: T('other', 'Exposure mode'), 0xA403: T('other', 'White balance'), 0xA405: T('other', 'Focal length (35 mm)'),
    0xA406: T('other', 'Scene type'), 0xA420: T('serial', 'Image unique ID'), 0xA430: T('author', 'Camera owner'),
    0xA431: T('serial', 'Camera serial number'), 0xA432: T('camera', 'Lens specification'),
    0xA433: T('camera', 'Lens make'), 0xA434: T('camera', 'Lens model'), 0xA435: T('serial', 'Lens serial number'),
  };
  const GPS = { 0x0007: T('date', 'GPS time'), 0x001D: T('date', 'GPS date') };
  const INTEROP = { 0x0001: T('other', 'Interoperability index'), 0x0002: T('other', 'Interoperability version') };

  /** The category and plain label of one tag in one IFD kind ('ifd0', 'page', 'exif', 'gps', 'interop', 'thumb'). */
  function describe(kind, tag) {
    if (STRUCT.has(tag) || POINTERS[tag] !== undefined) return { cat: 'struct', label: '' };
    if (BLOCKS.has(tag)) return MAIN[tag];
    if (kind === 'thumb') return { cat: 'thumbnail', label: 'Thumbnail picture' };
    if (kind === 'gps') return GPS[tag] || { cat: 'location', label: `GPS tag ${hex(tag)}` };
    if (kind === 'exif') return EXIF[tag] || { cat: 'other', label: `Photo tag ${hex(tag)}` };
    if (kind === 'interop') return INTEROP[tag] || { cat: 'other', label: `Interoperability tag ${hex(tag)}` };
    return MAIN[tag] || { cat: 'other', label: `Tag ${hex(tag)}` };
  }
  /** Resolve a partial { cat: bool } map to a full one (defaults from CATS). */
  function resolve(remove) {
    const out = {};
    for (const c of CATS) out[c.id] = remove && typeof remove[c.id] === 'boolean' ? remove[c.id] : c.def;
    return out;
  }
  /** True when a block (XMP, IPTC, Photoshop, other APP data) must go: it may hold any personal field. */
  const blockGone = (remove) => !!(remove.embedded || PERSONAL.some((c) => remove[c]));

  C.tags = { CATS, PERSONAL, STRUCT, POINTERS, BLOCKS, describe, resolve, blockGone, hex };
})(typeof window !== 'undefined' ? window : globalThis);
