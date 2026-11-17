/* Slop Code: what a file is, recognised from its first bytes (and from its name where the bytes cannot say). Pure: no DOM,
 * no network. The knowledge is one table, a row per format: [id, label, mime, category, signatures, check?].
 * A signature is a string of tokens, read in order:
 *   89 4e   hex bytes     f?  a high nibble     ??  any byte     "PNG"  text     @257  the next token sits at this offset
 *   ~       first token of a text signature: skip leading white space and ignore case
 *   ^zip docx docm   not a signature: when the best match is the row 'zip' and the name ends in docx or docm, this row wins
 * The best match is the signature with the most bytes that must be equal; check(bytes, ext) can still refuse it.
 * Labels are the formats' own names and stay English. The ISO 9660 mark sits at byte 32769: pass 32,774 bytes or more
 * to see it (a name ending in .iso is taken for one when the bytes are shorter). */

const ascii = (b, from, to) => String.fromCharCode.apply(null, b.subarray(from, Math.min(to, b.length, from + 8192)));
const has = (b, s, from = 0, to = 8192) => ascii(b, from, to).includes(s);
const u16 = (b, o) => (b[o] | (b[o + 1] << 8)) >>> 0;
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const textual = (b) => !b.subarray(0, 512).includes(0);
const sync = (b, o, step) => b[o] === 0x47 && b[o + step] === 0x47 && (b.length <= o + 2 * step || b[o + 2 * step] === 0x47);

// Checks: a few bytes of signature are not enough on their own for these.
const iconDir = (b) => u16(b, 4) > 0 && b[9] === 0;
const mp3 = (b) => b[0] === 0x49 || (((b[1] >> 1) & 3) !== 0 && ((b[1] >> 3) & 3) !== 1 && b[2] >> 4 !== 15 && ((b[2] >> 2) & 3) !== 3);
const pickle = (b) => b[1] >= 2 && b[1] <= 5 && [0x63, 0x7d, 0x5d, 0x28, 0x29, 0x8c, 0x95, 0x58, 0x4e, 0x4b, 0x4a, 0x4d].includes(b[2]);
const pyc = (b, ext) => ext === 'pyc' || ext === 'pyo' || (u16(b, 0) >= 3000 && u16(b, 0) < 4000 && b[4] < 4 && !b[5] && !b[6] && !b[7]);
const json = (b) => textual(b) && /^\s*[{["\-\dtfn]/.test(ascii(b, 0, 64));
const obj = (b) => textual(b) && /^\s*(#|v |vn |vt |o |g |mtllib |usemtl |f |s )/m.test(ascii(b, 0, 2048));

const TABLE = [
  // images
  ['png', 'PNG image', 'image/png', 'image', '89 "PNG" 0d 0a 1a 0a'],   // i18n-ignore: a format name, not translated
  ['jpeg', 'JPEG image', 'image/jpeg', 'image', 'ff d8 ff'],   // i18n-ignore: a format name, not translated
  ['gif', 'GIF image', 'image/gif', 'image', ['"GIF87a"', '"GIF89a"']],   // i18n-ignore: a format name, not translated
  ['webp', 'WebP image', 'image/webp', 'image', ['"RIFF" ?? ?? ?? ?? "WEBP"', '^riff webp']],   // i18n-ignore: a format name, not translated
  ['bmp', 'BMP image', 'image/bmp', 'image', '"BM" ?? ?? ?? ?? 00 00 00 00', (b) => [12, 40, 52, 56, 64, 108, 124].includes(b[14]) && !b[15]],   // i18n-ignore: a format name, not translated
  ['ico', 'ICO icon', 'image/x-icon', 'image', '00 00 01 00', iconDir],   // i18n-ignore: a format name, not translated
  ['cur', 'CUR cursor', 'image/x-icon', 'image', '00 00 02 00', iconDir],   // i18n-ignore: a format name, not translated
  ['tiff', 'TIFF image', 'image/tiff', 'image', ['49 49 2a 00', '4d 4d 00 2a', '49 49 2b 00', '4d 4d 00 2b']],   // i18n-ignore: a format name, not translated
  ['heic', 'HEIC image', 'image/heic', 'image', '^mp4 heic'],   // i18n-ignore: a format name, not translated
  ['heif', 'HEIF image', 'image/heif', 'image', '^mp4 heif'],   // i18n-ignore: a format name, not translated
  ['avif', 'AVIF image', 'image/avif', 'image', '^mp4 avif'],   // i18n-ignore: a format name, not translated
  ['cr3', 'Canon CR3 raw image', 'image/x-canon-cr3', 'image', '^mp4 cr3'],   // i18n-ignore: a format name, not translated
  ['psd', 'Photoshop document', 'image/vnd.adobe.photoshop', 'image', '"8BPS" 00 0?'],   // i18n-ignore: a format name, not translated
  ['jp2', 'JPEG 2000 image', 'image/jp2', 'image', ['00 00 00 0c 6a 50 20 20 0d 0a 87 0a', 'ff 4f ff 51']],
  ['jxl', 'JPEG XL image', 'image/jxl', 'image', '00 00 00 0c "JXL " 0d 0a 87 0a'],   // i18n-ignore: a format name, not translated
  ['exr', 'OpenEXR image', 'image/x-exr', 'image', '76 2f 31 01'],   // i18n-ignore: a format name, not translated
  ['hdr', 'Radiance HDR image', 'image/vnd.radiance', 'image', ['"#?RADIANCE" 0a', '"#?RGBE" 0a']],   // i18n-ignore: a format name, not translated
  ['dds', 'DDS texture', 'image/vnd.ms-dds', 'image', '"DDS " 7c 00 00 00'],   // i18n-ignore: a format name, not translated
  ['ktx', 'KTX texture', 'image/ktx', 'image', ['ab "KTX 11" bb 0d 0a 1a 0a', 'ab "KTX 20" bb 0d 0a 1a 0a']],   // i18n-ignore: a format name, not translated
  // audio
  ['mp3', 'MP3 audio', 'audio/mpeg', 'audio', ['"ID3" 0?', 'ff e?', 'ff f?'], mp3],
  ['aac', 'AAC audio', 'audio/aac', 'audio', ['ff f1', 'ff f9']],   // i18n-ignore: a format name, not translated
  ['flac', 'FLAC audio', 'audio/flac', 'audio', '"fLaC"'],   // i18n-ignore: a format name, not translated
  ['ogg', 'Ogg audio', 'audio/ogg', 'audio', '"OggS" 00'],   // i18n-ignore: a format name, not translated
  ['opus', 'Opus audio', 'audio/opus', 'audio', null],   // i18n-ignore: a format name, not translated
  ['vorbis', 'Ogg Vorbis audio', 'audio/ogg', 'audio', null],   // i18n-ignore: a format name, not translated
  ['riff', 'RIFF container', 'application/octet-stream', 'other', '"RIFF"'],   // i18n-ignore: a format name, not translated
  ['wav', 'WAV audio', 'audio/wav', 'audio', ['"RIFF" ?? ?? ?? ?? "WAVE"', '^riff wav']],   // i18n-ignore: a format name, not translated
  ['aiff', 'AIFF audio', 'audio/aiff', 'audio', ['"FORM" ?? ?? ?? ?? "AIFF"', '"FORM" ?? ?? ?? ?? "AIFC"']],   // i18n-ignore: a format name, not translated
  ['midi', 'MIDI music', 'audio/midi', 'audio', '"MThd" 00 00 00 06'],   // i18n-ignore: a format name, not translated
  ['m4a', 'M4A audio', 'audio/mp4', 'audio', '^mp4 m4a m4b'],
  ['amr', 'AMR audio', 'audio/amr', 'audio', ['"#!AMR" 0a', '"#!AMR-WB" 0a']],   // i18n-ignore: a format name, not translated
  ['au', 'AU audio', 'audio/basic', 'audio', '".snd"'],   // i18n-ignore: a format name, not translated
  ['ape', "Monkey's Audio", 'audio/x-ape', 'audio', '"MAC "', (b) => u16(b, 4) >= 3800 && u16(b, 4) < 5000],   // i18n-ignore: a format name, not translated
  ['mka', 'Matroska audio', 'audio/x-matroska', 'audio', '^mkv mka'],   // i18n-ignore: a format name, not translated
  ['wma', 'WMA audio', 'audio/x-ms-wma', 'audio', '^asf wma'],   // i18n-ignore: a format name, not translated
  // video
  ['mp4', 'MP4 video', 'video/mp4', 'video', '@4 "ftyp"'],
  ['mov', 'QuickTime video', 'video/quicktime', 'video', ['^mp4 mov qt', '@4 "moov"', '@4 "mdat"', '@4 "wide"']],   // i18n-ignore: a format name, not translated
  ['m4v', 'M4V video', 'video/x-m4v', 'video', '^mp4 m4v'],
  ['3gp', '3GP video', 'video/3gpp', 'video', '^mp4 3gp 3gpp'],   // i18n-ignore: a format name, not translated
  ['3g2', '3G2 video', 'video/3gpp2', 'video', '^mp4 3g2'],
  ['mkv', 'Matroska video', 'video/x-matroska', 'video', '1a 45 df a3'],   // i18n-ignore: a format name, not translated
  ['webm', 'WebM video', 'video/webm', 'video', '^mkv webm'],   // i18n-ignore: a format name, not translated
  ['ogv', 'Ogg video', 'video/ogg', 'video', '^ogg ogv'],   // i18n-ignore: a format name, not translated
  ['avi', 'AVI video', 'video/x-msvideo', 'video', ['"RIFF" ?? ?? ?? ?? "AVI "', '^riff avi']],   // i18n-ignore: a format name, not translated
  ['flv', 'Flash video', 'video/x-flv', 'video', '"FLV" 01'],   // i18n-ignore: a format name, not translated
  ['mpg', 'MPEG video', 'video/mpeg', 'video', ['00 00 01 ba', '00 00 01 b3']],   // i18n-ignore: a format name, not translated
  ['ts', 'MPEG transport stream', 'video/mp2t', 'video', ['47', '@4 47'], (b) => sync(b, 0, 188) || sync(b, 4, 192)],   // i18n-ignore: a format name, not translated
  ['asf', 'ASF video', 'video/x-ms-asf', 'video', '30 26 b2 75 8e 66 cf 11 a6 d9 00 aa 00 62 ce 6c'],   // i18n-ignore: a format name, not translated
  ['wmv', 'WMV video', 'video/x-ms-wmv', 'video', '^asf wmv'],   // i18n-ignore: a format name, not translated
  ['swf', 'Flash animation (SWF)', 'application/x-shockwave-flash', 'video', ['"FWS"', '"CWS"', '"ZWS"'], (b) => b[3] > 0 && b[3] < 64],   // i18n-ignore: a format name, not translated
  // archives
  ['zip', 'ZIP archive', 'application/zip', 'archive', ['"PK" 03 04', '"PK" 05 06', '"PK" 07 08']],   // i18n-ignore: a format name, not translated
  ['gz', 'GZIP archive', 'application/gzip', 'archive', '1f 8b 08'],   // i18n-ignore: a format name, not translated
  ['bz2', 'BZIP2 archive', 'application/x-bzip2', 'archive', '"BZh" 3? 31 41 59 26 53 59'],
  ['xz', 'XZ archive', 'application/x-xz', 'archive', 'fd 37 7a 58 5a 00'],   // i18n-ignore: a format name, not translated
  ['zst', 'Zstandard archive', 'application/zstd', 'archive', '28 b5 2f fd'],   // i18n-ignore: a format name, not translated
  ['7z', '7-Zip archive', 'application/x-7z-compressed', 'archive', '37 7a bc af 27 1c'],   // i18n-ignore: a format name, not translated
  ['rar', 'RAR archive', 'application/vnd.rar', 'archive', ['"Rar!" 1a 07 00', '"Rar!" 1a 07 01 00']],   // i18n-ignore: a format name, not translated
  ['tar', 'TAR archive', 'application/x-tar', 'archive', '@257 "ustar"'],   // i18n-ignore: a format name, not translated
  ['cab', 'Cabinet archive', 'application/vnd.ms-cab-compressed', 'archive', '"MSCF" 00 00 00 00'],   // i18n-ignore: a format name, not translated
  ['arj', 'ARJ archive', 'application/x-arj', 'archive', '60 ea'],   // i18n-ignore: a format name, not translated
  ['lz4', 'LZ4 archive', 'application/x-lz4', 'archive', '04 22 4d 18'],
  ['lz', 'lzip archive', 'application/x-lzip', 'archive', '"LZIP" 0?'],   // i18n-ignore: a format name, not translated
  ['z', 'Unix compress archive', 'application/x-compress', 'archive', '1f 9d'],   // i18n-ignore: a format name, not translated
  ['cpio', 'cpio archive', 'application/x-cpio', 'archive', ['"070707"', '"070701"', '"070702"']],   // i18n-ignore: a format name, not translated
  ['ar', 'ar archive', 'application/x-archive', 'archive', '"!<arch>" 0a'],   // i18n-ignore: a format name, not translated
  ['deb', 'Debian package', 'application/vnd.debian.binary-package', 'archive', '"!<arch>" 0a "debian-binary"'],   // i18n-ignore: a format name, not translated
  ['rpm', 'RPM package', 'application/x-rpm', 'archive', 'ed ab ee db'],   // i18n-ignore: a format name, not translated
  ['iso', 'ISO 9660 disc image', 'application/x-iso9660-image', 'archive', '@0x8001 "CD001"'],   // i18n-ignore: a format name, not translated
  ['dmg', 'Apple disk image', 'application/x-apple-diskimage', 'archive', null],   // i18n-ignore: a format name, not translated
  ['sqfs', 'SquashFS image', 'application/x-squashfs', 'archive', ['"hsqs"', '"sqsh"']],   // i18n-ignore: a format name, not translated
  ['zlib', 'zlib stream', 'application/zlib', 'archive', ['78 01', '78 9c', '78 da']],   // i18n-ignore: a format name, not translated
  // documents (the ZIP- and OLE2-based ones are named by their extension, or by what the archive holds)
  ['docx', 'Word document (DOCX)', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document', '^zip docx docm dotx'],   // i18n-ignore: a format name, not translated
  ['xlsx', 'Excel workbook (XLSX)', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'document', '^zip xlsx xlsm xltx'],   // i18n-ignore: a format name, not translated
  ['pptx', 'PowerPoint presentation (PPTX)', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'document', '^zip pptx pptm potx ppsx'],   // i18n-ignore: a format name, not translated
  ['odt', 'OpenDocument text', 'application/vnd.oasis.opendocument.text', 'document', '^zip odt ott'],   // i18n-ignore: a format name, not translated
  ['ods', 'OpenDocument spreadsheet', 'application/vnd.oasis.opendocument.spreadsheet', 'document', '^zip ods ots'],   // i18n-ignore: a format name, not translated
  ['odp', 'OpenDocument presentation', 'application/vnd.oasis.opendocument.presentation', 'document', '^zip odp otp'],   // i18n-ignore: a format name, not translated
  ['epub', 'EPUB book', 'application/epub+zip', 'document', '^zip epub'],   // i18n-ignore: a format name, not translated
  ['pdf', 'PDF document', 'application/pdf', 'document', '"%PDF-"'],   // i18n-ignore: a format name, not translated
  ['ps', 'PostScript document', 'application/postscript', 'document', '"%!PS"'],   // i18n-ignore: a format name, not translated
  ['eps', 'Encapsulated PostScript', 'application/eps', 'document', ['^ps eps', 'c5 d0 d3 c6']],   // i18n-ignore: a format name, not translated
  ['rtf', 'Rich Text document', 'application/rtf', 'document', '"{\\rtf"'],   // i18n-ignore: a format name, not translated
  ['ole', 'OLE2 compound document', 'application/x-ole-storage', 'document', 'd0 cf 11 e0 a1 b1 1a e1'],   // i18n-ignore: a format name, not translated
  ['doc', 'Word 97-2003 document', 'application/msword', 'document', '^ole doc dot'],   // i18n-ignore: a format name, not translated
  ['xls', 'Excel 97-2003 workbook', 'application/vnd.ms-excel', 'document', '^ole xls xlt'],   // i18n-ignore: a format name, not translated
  ['ppt', 'PowerPoint 97-2003 presentation', 'application/vnd.ms-powerpoint', 'document', '^ole ppt pps pot'],   // i18n-ignore: a format name, not translated
  ['msg', 'Outlook message', 'application/vnd.ms-outlook', 'document', '^ole msg'],   // i18n-ignore: a format name, not translated
  ['msi', 'Windows Installer package', 'application/x-msi', 'executable', '^ole msi'],   // i18n-ignore: a format name, not translated
  ['djvu', 'DjVu document', 'image/vnd.djvu', 'document', '"AT&TFORM" ?? ?? ?? ?? "DJV"'],   // i18n-ignore: a format name, not translated
  // executables
  ['elf', 'ELF executable', 'application/x-elf', 'executable', '7f "ELF"'],   // i18n-ignore: a format name, not translated
  ['appimage', 'AppImage', 'application/x-iso9660-appimage', 'executable', '7f "ELF" @8 "AI" 02'],   // i18n-ignore: a format name, not translated
  ['macho', 'Mach-O executable', 'application/x-mach-binary', 'executable', ['fe ed fa ce', 'fe ed fa cf', 'ce fa ed fe', 'cf fa ed fe']],   // i18n-ignore: a format name, not translated
  ['macho-fat', 'Mach-O universal binary', 'application/x-mach-binary', 'executable', 'ca fe ba bf'],   // i18n-ignore: a format name, not translated
  ['class', 'Java class file', 'application/java-vm', 'executable', 'ca fe ba be'],   // i18n-ignore: a format name, not translated
  ['pe', 'PE executable', 'application/vnd.microsoft.portable-executable', 'executable', '"MZ"'],   // i18n-ignore: a format name, not translated
  ['dll', 'Windows DLL', 'application/vnd.microsoft.portable-executable', 'executable', null],   // i18n-ignore: a format name, not translated
  ['dos', 'DOS executable', 'application/x-dosexec', 'executable', null],   // i18n-ignore: a format name, not translated
  ['wasm', 'WebAssembly module', 'application/wasm', 'executable', '00 "asm" 01 00 00 00'],   // i18n-ignore: a format name, not translated
  ['dex', 'Android Dalvik executable', 'application/x-dex', 'executable', '"dex" 0a 30 3? 3? 00'],   // i18n-ignore: a format name, not translated
  ['lua', 'Lua bytecode', 'application/x-lua-bytecode', 'executable', '1b "Lua"'],   // i18n-ignore: a format name, not translated
  ['pyc', 'Python bytecode', 'application/x-python-code', 'executable', '?? ?? 0d 0a', pyc],   // i18n-ignore: a format name, not translated
  ['shell', 'Shell script', 'application/x-sh', 'executable', '"#!"'],   // i18n-ignore: a format name, not translated
  ['script', 'Script', 'text/plain', 'executable', null],   // i18n-ignore: a format name, not translated
  ['jar', 'Java archive (JAR)', 'application/java-archive', 'executable', '^zip jar war ear'],   // i18n-ignore: a format name, not translated
  ['apk', 'Android package (APK)', 'application/vnd.android.package-archive', 'executable', '^zip apk aab'],   // i18n-ignore: a format name, not translated
  ['ipa', 'iOS app (IPA)', 'application/octet-stream', 'executable', '^zip ipa'],   // i18n-ignore: a format name, not translated
  ['lnk', 'Windows shortcut', 'application/x-ms-shortcut', 'other', '4c 00 00 00 01 14 02 00 00 00 00 00 c0 00 00 00 00 00 00 46'],   // i18n-ignore: a format name, not translated
  // databases and data
  ['sqlite', 'SQLite 3 database', 'application/vnd.sqlite3', 'database', '"SQLite format 3" 00'],
  ['parquet', 'Parquet file', 'application/vnd.apache.parquet', 'database', '"PAR1"'],   // i18n-ignore: a format name, not translated
  ['hdf5', 'HDF5 file', 'application/x-hdf5', 'database', '89 "HDF" 0d 0a 1a 0a'],
  ['npy', 'NumPy array', 'application/x-npy', 'data', '93 "NUMPY"'],   // i18n-ignore: a format name, not translated
  ['pickle', 'Python pickle', 'application/x-python-pickle', 'data', '80 0?', pickle],   // i18n-ignore: a format name, not translated
  ['gitpack', 'Git packfile', 'application/x-git-pack', 'database', '"PACK" 00 00 00 0?', (b) => b[7] === 2 || b[7] === 3],   // i18n-ignore: a format name, not translated
  ['pcap', 'PCAP capture', 'application/vnd.tcpdump.pcap', 'data', ['d4 c3 b2 a1', 'a1 b2 c3 d4', '4d 3c b2 a1', 'a1 b2 3c 4d']],   // i18n-ignore: a format name, not translated
  ['pcapng', 'PCAPNG capture', 'application/x-pcapng', 'data', '0a 0d 0d 0a'],   // i18n-ignore: a format name, not translated
  ['arrow', 'Arrow IPC file', 'application/vnd.apache.arrow.file', 'database', '"ARROW1"'],   // i18n-ignore: a format name, not translated
  ['avro', 'Avro data file', 'application/avro', 'database', '"Obj" 01'],   // i18n-ignore: a format name, not translated
  ['mdb', 'Access database (MDB)', 'application/x-msaccess', 'database', '00 01 00 00 "Standard Jet DB"'],   // i18n-ignore: a format name, not translated
  ['accdb', 'Access database (ACCDB)', 'application/x-msaccess', 'database', '00 01 00 00 "Standard ACE DB"'],   // i18n-ignore: a format name, not translated
  ['pgp', 'PGP data', 'application/pgp-encrypted', 'data', '"-----BEGIN PGP"'],   // i18n-ignore: a format name, not translated
  ['torrent', 'BitTorrent file', 'application/x-bittorrent', 'data', ['"d8:announce"', '"d13:announce-list"', '"d10:created by"']],   // i18n-ignore: a format name, not translated
  // fonts
  ['ttf', 'TrueType font', 'font/ttf', 'font', ['00 01 00 00', '"true" 00'], (b) => !b[4] && b[5] >= 4 && b[5] < 64],   // i18n-ignore: a format name, not translated
  ['otf', 'OpenType font', 'font/otf', 'font', '"OTTO"'],   // i18n-ignore: a format name, not translated
  ['woff', 'WOFF font', 'font/woff', 'font', '"wOFF"'],   // i18n-ignore: a format name, not translated
  ['woff2', 'WOFF2 font', 'font/woff2', 'font', '"wOF2"'],
  ['ttc', 'TrueType collection', 'font/collection', 'font', '"ttcf"'],   // i18n-ignore: a format name, not translated
  // 3d
  ['glb', 'glTF binary model', 'model/gltf-binary', '3d', '"glTF" 0? 00 00 00'],   // i18n-ignore: a format name, not translated
  ['gltf', 'glTF model', 'model/gltf+json', '3d', null],   // i18n-ignore: a format name, not translated
  ['fbx', 'FBX model', 'application/octet-stream', '3d', '"Kaydara FBX Binary  " 00'],   // i18n-ignore: a format name, not translated
  ['blend', 'Blender file', 'application/x-blender', '3d', '"BLENDER"'],   // i18n-ignore: a format name, not translated
  ['stl', 'STL model', 'model/stl', '3d', ['"solid" 20', '"solid" 0a', '"solid" 0d'], (b) => has(b, 'facet') || has(b, 'endsolid')],   // i18n-ignore: a format name, not translated
  ['ply', 'PLY model', 'model/ply', '3d', ['"ply" 0a', '"ply" 0d']],   // i18n-ignore: a format name, not translated
  ['obj', 'OBJ model', 'model/obj', '3d', null],   // i18n-ignore: a format name, not translated
  ['3ds', '3DS model', 'application/x-3ds', '3d', null],   // i18n-ignore: a format name, not translated
  ['usdc', 'USD crate file', 'model/vnd.usd', '3d', '"PXR-USDC"'],   // i18n-ignore: a format name, not translated
  ['dae', 'COLLADA model', 'model/vnd.collada+xml', '3d', null],   // i18n-ignore: a format name, not translated
  ['3mf', '3MF model', 'model/3mf', '3d', '^zip 3mf'],   // i18n-ignore: a format name, not translated
  ['usdz', 'USDZ model', 'model/vnd.usdz+zip', '3d', '^zip usdz'],   // i18n-ignore: a format name, not translated
  // text-ish: the caller opens these as text; SVG is text here too
  ['xml', 'XML document', 'application/xml', 'text', '~"<?xml"'],   // i18n-ignore: a format name, not translated
  ['svg', 'SVG image', 'image/svg+xml', 'text', '~"<svg"'],   // i18n-ignore: a format name, not translated
  ['html', 'HTML document', 'text/html', 'text', ['~"<!doctype html"', '~"<html"']],   // i18n-ignore: a format name, not translated
  ['pem', 'PEM file', 'application/x-pem-file', 'text', '"-----BEGIN "'],   // i18n-ignore: a format name, not translated
  ['json', 'JSON data', 'application/json', 'text', null],   // i18n-ignore: a format name, not translated
  ['vcf', 'vCard contact', 'text/vcard', 'text', '"BEGIN:VCARD"'],   // i18n-ignore: a format name, not translated
  ['ics', 'iCalendar file', 'text/calendar', 'text', '"BEGIN:VCALENDAR"'],   // i18n-ignore: a format name, not translated
];

// A format named only by its extension (it has no mark at the start, or none we can see), and a check that keeps a wrong guess out.
const BY_EXT = [
  [['json'], 'json', json], [['obj'], 'obj', obj], [['gltf'], 'gltf', (b) => has(b, '"asset"')], [['3ds'], '3ds', (b) => b[0] === 0x4d && b[1] === 0x4d],
  [['stl'], 'stl', (b) => b.length > 84],
  [['iso'], 'iso'], [['dmg'], 'dmg'], [['gpg', 'pgp', 'kbx'], 'pgp', (b) => (b[0] & 0x80) !== 0],
];

// ftyp brands (bytes 8 to 12, then the compatible list) and what they say; 'mif1' alone says only HEIF.
const BRANDS = {};
for (const [id, list] of Object.entries({
  heic: 'heic|heix|hevc|hevx|heim|heis', heif: 'mif1|msf1', avif: 'avif|avis', m4a: 'M4A |M4B |M4P ', m4v: 'M4V |M4VH|M4VP', mov: 'qt  ',
  '3gp': '3gp4|3gp5|3gp6|3gp7|3gpp|3ge6|3gg6', '3g2': '3g2a|3g2b|3g2c', cr3: 'crx ',
})) for (const brand of list.split('|')) BRANDS[brand] = id;
const OGG = [['OpusHead', 'opus'], ['\x01vorbis', 'vorbis'], ['\x80theora', 'ogv'], ['\x7fFLAC', 'flac']];
const ZIPMIME = [['epub+zip', 'epub'], ['opendocument.text', 'odt'], ['opendocument.spreadsheet', 'ods'], ['opendocument.presentation', 'odp']];

/** What a ZIP holds, from its first entry: an ODF or EPUB 'mimetype', an APK, a JAR or an Office file. Null when unsure. */
function zipHint(b) {
  if (b[2] !== 3) return null;
  const s = ascii(b, 0, 4096), n = u16(b, 26), name = s.slice(30, 30 + n), data = 30 + n + u16(b, 28);
  if (name === 'mimetype') { const hit = ZIPMIME.find(([k]) => s.slice(data, data + 64).includes(k)); return hit ? hit[1] : null; }
  if (s.includes('AndroidManifest.xml')) return 'apk';   // i18n-ignore: a format name, not translated
  if (name.startsWith('META-INF/')) return 'jar';
  if (s.includes('[Content_Types].xml')) return s.includes('word/') ? 'docx' : s.includes('xl/') ? 'xlsx' : s.includes('ppt/') ? 'pptx' : null;
  return null;
}

// Second looks, by the id of the best match: (bytes, ext, kid) -> an id, or null to keep it. kid is what the extension
// names (a row '^parent ext'), if anything.
const REFINE = {
  zip: (b, ext, kid) => kid || (ext === 'zip' ? null : zipHint(b)),
  mp4: (b, ext, kid) => {
    const major = BRANDS[ascii(b, 8, 12)];
    if (major && major !== 'heif') return major;
    if (kid) return kid;
    for (let i = 16; i + 4 <= Math.min(b.length, 64); i += 4) { const x = BRANDS[ascii(b, i, i + 4)]; if (x && x !== 'heif') return x; }
    return major || 'mp4';
  },
  mkv: (b, ext, kid) => kid || (has(b, 'webm', 4, 64) ? 'webm' : null),
  ogg: (b, ext, kid) => { const s = ascii(b, 27 + b[26], 35 + b[26]), hit = OGG.find(([k]) => s.startsWith(k)); return hit ? hit[1] : kid; },
  ps: (b, ext, kid) => kid || (has(b, 'EPSF', 0, 80) ? 'eps' : null),
  xml: (b, ext) => (ext === 'svg' || has(b, '<svg', 0, 512) ? 'svg' : has(b, '<COLLADA', 0, 512) ? 'dae' : null),
  class: (b) => (((b[4] << 24) | (b[5] << 16) | (b[6] << 8) | b[7]) >>> 0 < 45 ? 'macho-fat' : null),   // Java: minor, major (45 or more); a fat Mach-O: its count of builds
  pe: (b) => {
    const e = u32(b, 0x3c);
    if (e >= 0x40 && e + 24 <= b.length) return b[e] === 0x50 && b[e + 1] === 0x45 && !b[e + 2] && !b[e + 3] ? (u16(b, e + 22) & 0x2000 ? 'dll' : 'pe') : 'dos';
    return e >= 0x40 && e < 0x10000000 ? 'pe' : 'dos';   // the header is past what we were given: it is a PE
  },
  shell: (b) => (/(^|[\/ ])(ba|z|da|k|a|fi|c|tc)?sh\b/.test(ascii(b, 0, 128).split('\n')[0]) ? null : 'script'),
};

/** One signature string -> { text, at: [[offset, value, mask], ...] }. */
function compile(sig) {
  const out = { text: false, at: [] };
  let off = 0;
  for (const m of sig.matchAll(/@(0x[0-9a-f]+|\d+)|"([^"]*)"|([0-9a-f?]{2})|(~)/gi)) {
    if (m[4]) out.text = true;
    else if (m[1]) off = Number(m[1]);
    else if (m[2] != null) for (const ch of m[2]) out.at.push([off++, (out.text ? ch.toLowerCase() : ch).charCodeAt(0), 255]);
    else {
      const [h, l] = m[3], mask = (h === '?' ? 0 : 240) | (l === '?' ? 0 : 15);
      if (mask) out.at.push([off, (h === '?' ? 0 : parseInt(h, 16) << 4) | (l === '?' ? 0 : parseInt(l, 16)), mask]);
      off++;
    }
  }
  return out;
}

const ROWS = TABLE.map(([id, label, mime, category, sigs, check]) => {
  const list = [].concat(sigs || []);
  return { id, label, mime, category, check, sigs: list.filter((s) => s[0] !== '^').map(compile), kids: list.filter((s) => s[0] === '^') };
});
const BY_ID = new Map(ROWS.map((r) => [r.id, { id: r.id, label: r.label, mime: r.mime, category: r.category }]));
const KIDS = Object.create(null);
for (const r of ROWS) for (const s of r.kids) { const [parent, ...exts] = s.slice(1).split(' '); for (const x of exts) (KIDS[parent] = KIDS[parent] || Object.create(null))[x] = r.id; }

/** How many bytes of a signature the file matches: its length when all of them do, else 0. */
function score(sig, b) {
  let base = 0;
  if (sig.text) while (base < 256 && (b[base] === 32 || (b[base] >= 9 && b[base] <= 13))) base++;
  for (const [o, v, m] of sig.at) {
    if (base + o >= b.length) return 0;
    let c = b[base + o];
    if (sig.text && c >= 65 && c <= 90) c += 32;
    if ((c & m) !== v) return 0;
  }
  return sig.at.length;
}

const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
const copy = (id) => { const r = BY_ID.get(id); return r ? { ...r } : null; };

/** What the bytes (a Uint8Array, the first 4 KB or more of the file) and the file name say the file is:
 *  { id, label, mime, category }, or null when nothing matches. Text with a byte order mark is left to the caller (null). */
export function identify(bytes, name) {
  const b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  if (!b || !b.length) return null;
  if ((b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) || (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)) return null;
  const ext = extOf(name);
  let best = null, top = 0;
  for (const r of ROWS) for (const s of r.sigs) {
    const n = score(s, b);
    if (n > top && (!r.check || r.check(b, ext))) { best = r.id; top = n; }
  }
  if (!best) {
    const hit = ext && BY_EXT.find(([exts, , ok]) => exts.includes(ext) && (!ok || ok(b)));
    return hit ? copy(hit[1]) : null;
  }
  const kid = KIDS[best] && KIDS[best][ext];
  return copy((REFINE[best] ? REFINE[best](b, ext, kid) : kid) || best);
}

/** Every format this knows: [{ id, label, mime, category }]. */
export const formats = () => [...BY_ID.values()].map((r) => ({ ...r }));
/** How many signatures the table holds (a format can have several). */
export const signatureCount = () => ROWS.reduce((n, r) => n + r.sigs.length, 0);
