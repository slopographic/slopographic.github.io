/* Slop Music test fixtures: builds WAV and ID3v2 MP3 files in code (no binary files are committed).
 * Classic script, sets window.MusicFixtures.
 *   wav(seconds, rate)                      a 16-bit mono WAV with a quiet tone
 *   tag(major, frames)                      an ID3v2 header + frames (major 3 or 4)
 *   mp3({ title, artist, album, cover, major, enc })   an ID3 tag, then one fake MPEG frame
 *   vorbisComments(pairs, vendor)           a Vorbis comment block (little-endian lengths) from [['TITLE', 'x'], ...]
 *   pictureBlock(type, mime, bytes)         a FLAC METADATA_BLOCK_PICTURE body (big-endian lengths)
 *   flac({ comments, pictures, id3 })       "fLaC", STREAMINFO, a comment block, picture blocks, padding (last)
 *   ogg({ comments, codec, pageSize })      an Ogg stream: identification packet, then the comment packet split
 *                                           over pages of at most pageSize bytes (codec 'vorbis' or 'opus') */
(function () {
  'use strict';
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0));
  const syncsafe = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
  const u32 = (n) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const utf16le = (s) => [...s].flatMap((c) => [c.charCodeAt(0) & 255, c.charCodeAt(0) >> 8]);
  /** Text payload: encoding byte, then the text (enc 0 Latin-1, 1 UTF-16 with BOM, 3 UTF-8). */
  function text(enc, s) {
    if (enc === 1) return [1, 0xff, 0xfe, ...utf16le(s)];
    if (enc === 3) return [3, ...new TextEncoder().encode(s)];
    return [0, ...ascii(s)];
  }
  function frame(major, id, payload) {
    const size = major === 4 ? syncsafe(payload.length) : u32(payload.length);
    return [...ascii(id), ...size, 0, 0, ...payload];
  }
  /** An ID3v2 tag made of frames (arrays of bytes). */
  function tag(major, frames) {
    const body = frames.flat();
    return new Uint8Array([0x49, 0x44, 0x33, major, 0, 0, ...syncsafe(body.length), ...body]);
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52];
  /** An MP3 for tests: an ID3 tag with title, artist, album and an optional PNG cover, then one MPEG frame header. */
  function mp3({ title = '', artist = '', album = '', cover = false, major = 3, enc = 1 } = {}) {
    const frames = [];
    if (title) frames.push(frame(major, 'TIT2', text(enc, title)));
    if (artist) frames.push(frame(major, 'TPE1', text(enc, artist)));
    if (album) frames.push(frame(major, 'TALB', text(enc, album)));
    if (cover) frames.push(frame(major, 'APIC', [0, ...ascii('image/png'), 0, 3, 0, ...PNG]));
    const head = tag(major, frames);
    const mpeg = new Uint8Array([0xff, 0xfb, 0x90, 0x64, ...new Array(400).fill(0)]);
    return new Blob([head, mpeg], { type: 'audio/mpeg' });
  }
  /** A WAV of seconds length (16-bit mono, a quiet 440 Hz tone so the waveform is not flat). */
  function wav(seconds = 2, rate = 8000) {
    const n = Math.round(seconds * rate), data = new DataView(new ArrayBuffer(n * 2));
    for (let i = 0; i < n; i++) data.setInt16(i * 2, Math.round(Math.sin((i / rate) * 2 * Math.PI * 440) * 6000), true);
    const h = new DataView(new ArrayBuffer(44));
    const str = (o, s) => ascii(s).forEach((c, i) => h.setUint8(o + i, c));
    str(0, 'RIFF'); h.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true); h.setUint32(24, rate, true);
    h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); str(36, 'data'); h.setUint32(40, n * 2, true);
    return new Blob([h.buffer, data.buffer], { type: 'audio/wav' });
  }
  const u32le = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  const u24 = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const utf8 = (s) => [...new TextEncoder().encode(s)];
  function vorbisComments(pairs, vendor = 'Slop test') {
    const v = utf8(vendor), out = [...u32le(v.length), ...v, ...u32le(pairs.length)];
    for (const [k, val] of pairs) { const c = utf8(`${k}=${val}`); out.push(...u32le(c.length), ...c); }
    return out;
  }
  function pictureBlock(type, mime, bytes) {
    const m = ascii(mime), d = utf8('cover');
    return [...u32(type), ...u32(m.length), ...m, ...u32(d.length), ...d, ...u32(1), ...u32(1), ...u32(24), ...u32(0), ...u32(bytes.length), ...bytes];
  }
  function flac({ comments = [], pictures = [], id3 = null } = {}) {
    const blocks = [[0, new Array(34).fill(0)], [4, vorbisComments(comments)], ...pictures.map((p) => [6, pictureBlock(...p)]), [1, new Array(8).fill(0)]];
    const out = [...ascii('fLaC')];
    blocks.forEach(([type, body], i) => out.push((i === blocks.length - 1 ? 0x80 : 0) | type, ...u24(body.length), ...body));
    return new Blob([...(id3 ? [id3] : []), new Uint8Array(out), new Uint8Array(64)], { type: 'audio/flac' });
  }
  /** One Ogg page (CRC left 0: readers of tags do not check it). */
  function page(body, flags, seq, lacing) {
    return [...ascii('OggS'), 0, flags, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, ...u32le(seq), 0, 0, 0, 0, lacing.length, ...lacing, ...body];
  }
  function ogg({ comments = [], codec = 'vorbis', pageSize = 255 * 4 } = {}) {
    const ident = codec === 'opus' ? [...ascii('OpusHead'), 1, 2, 0, 0, ...u32le(48000), 0, 0, 0] : [1, ...ascii('vorbis'), ...new Array(23).fill(0)];
    const tags = codec === 'opus' ? [...ascii('OpusTags'), ...vorbisComments(comments)] : [3, ...ascii('vorbis'), ...vorbisComments(comments), 1];
    const out = page(ident, 2, 0, [ident.length]);
    // the comment packet as lacing values (255s then the rest), cut into pages of at most pageSize bytes
    const lace = []; let n = tags.length;
    while (n >= 255) { lace.push(255); n -= 255; }
    lace.push(n);
    let at = 0, seq = 1, li = 0;
    while (li < lace.length) {
      const l = []; let size = 0;
      while (li < lace.length && size + lace[li] <= pageSize && l.length < 255) { size += lace[li]; l.push(lace[li++]); }
      out.push(...page(tags.slice(at, at + size), seq === 1 ? 0 : 1, seq, l));
      at += size; seq++;
    }
    return new Blob([new Uint8Array(out), new Uint8Array(32)], { type: codec === 'opus' ? 'audio/opus' : 'audio/ogg' });
  }
  window.MusicFixtures = { wav, tag, frame, text, mp3, PNG, syncsafe, ascii, vorbisComments, pictureBlock, flac, ogg };
})();
