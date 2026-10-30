/* Slop Music: reads ID3v2 tags (MP3) and WAV headers by hand. No library, no network.
 * Text frames read: title (TIT2/TT2), artist (TPE1/TP1), album (TALB/TAL); APIC/PIC gives the cover.
 * FLAC and Ogg files: readTags also reads their Vorbis comments through vorbis.js (load it first).
 * Exposes window.SlopMusic.id3 = { readTags, wavInfo, typeOf, titleFromName }. */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const IDS = { title: ['TIT2', 'TT2'], artist: ['TPE1', 'TP1'], album: ['TALB', 'TAL'] };
  const PIC = ['APIC', 'PIC'];
  const EXT_TYPE = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', flac: 'audio/flac', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac' };

  const ascii = (b, p, n) => String.fromCharCode(...b.subarray(p, p + n));
  const syncsafe = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
  const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  const u24 = (b, i) => (b[i] << 16) + (b[i + 1] << 8) + b[i + 2];
  const u32le = (b, i) => ((b[i + 3] << 24) >>> 0) + (b[i + 2] << 16) + (b[i + 1] << 8) + b[i];
  const u16le = (b, i) => b[i] + (b[i + 1] << 8);
  const bytesAt = async (blob, start, len) => new Uint8Array(await blob.slice(start, start + len).arrayBuffer());

  /** Removes the ID3 unsynchronisation: each 0x00 after 0xFF is dropped. */
  function unsync(b) {
    const out = [];
    for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0) i++; }
    return Uint8Array.from(out);
  }
  function utf16(b, be) {
    const u = new Uint8Array(b.length & ~1);
    for (let i = 0; i < u.length; i += 2) { u[i] = be ? b[i + 1] : b[i]; u[i + 1] = be ? b[i] : b[i + 1]; }
    return new TextDecoder('utf-16le').decode(u);
  }
  /** Text by ID3 encoding: 0 Latin-1, 1 UTF-16 with BOM, 2 UTF-16BE, 3 UTF-8. */
  function decodeText(b, enc) {
    if (enc === 1) {
      if (b[0] === 0xff && b[1] === 0xfe) return utf16(b.subarray(2), false);
      if (b[0] === 0xfe && b[1] === 0xff) return utf16(b.subarray(2), true);
      return utf16(b, false);
    }
    if (enc === 2) return utf16(b, true);
    if (enc === 3) return new TextDecoder('utf-8').decode(b);
    return new TextDecoder('windows-1252').decode(b);
  }
  /** Index of the terminating NUL from p (two bytes for UTF-16), or -1. */
  function splitNul(b, p, enc) {
    const wide = enc === 1 || enc === 2;
    for (let i = p; wide ? i + 1 < b.length : i < b.length; i += wide ? 2 : 1) {
      if (wide ? b[i] === 0 && b[i + 1] === 0 : b[i] === 0) return i;
    }
    return -1;
  }
  function textFrame(d) {
    if (!d.length) return '';
    return decodeText(d.subarray(1), d[0]).split('\0')[0].trim();
  }
  function sniffImage(b) {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
    return 'image/jpeg';
  }
  /** APIC (v2.3/2.4) or PIC (v2.2): the picture as a Blob, or null. */
  function pictureFrame(d, v22) {
    const enc = d[0];
    let p, mime;
    if (v22) { const f = ascii(d, 1, 3).toUpperCase(); mime = f === 'PNG' ? 'image/png' : 'image/jpeg'; p = 4; }
    else {
      const z = splitNul(d, 1, 0);
      if (z < 0) return null;
      mime = ascii(d, 1, z - 1).toLowerCase(); p = z + 1;
      if (mime === '-->') return null;
    }
    const z = splitNul(d, p + 1, enc);
    if (z < 0) return null;
    const img = d.subarray(enc === 1 || enc === 2 ? z + 2 : z + 1);
    if (img.length < 4) return null;
    const type = mime.indexOf('/') > 0 ? mime : sniffImage(img);
    return new Blob([img], { type: /^image\/(jpeg|png|webp)$/.test(type) ? type : sniffImage(img) });
  }

  /** Reads the ID3v2 frames of a tag (header h, body from offset 10) into out. */
  async function readId3(blob, h, out) {
    const major = h[3], flags = h[5], size = syncsafe(h, 6);
    out.version = major;
    if (major < 2 || major > 4) return;
    let body = await bytesAt(blob, 10, Math.min(size, 16 * 1024 * 1024));
    if (major === 3 && flags & 0x80) body = unsync(body);
    let p = 0;
    if (flags & 0x40) p = major === 4 ? syncsafe(body, 0) : 4 + u32(body, 0);
    const idLen = major === 2 ? 3 : 4, hdr = major === 2 ? 6 : 10;
    while (p + hdr <= body.length && body[p] !== 0) {
      const id = ascii(body, p, idLen);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const fsize = major === 2 ? u24(body, p + 3) : major === 4 ? syncsafe(body, p + 4) : u32(body, p + 4);
      const fflags = major === 2 ? 0 : (body[p + 8] << 8) | body[p + 9];
      const start = p + hdr;
      if (start + fsize > body.length) break;
      let d = body.subarray(start, start + fsize);
      p = start + fsize;
      if (!fsize) continue;
      if (major === 4 && fflags & 0x01) d = d.subarray(4);
      if (major === 4 && fflags & 0x02) d = unsync(d);
      if (major === 3 && fflags & 0xc0) continue;
      if (major === 4 && fflags & 0x0c) continue;
      const key = Object.keys(IDS).find((k) => IDS[k].includes(id));
      if (key) { if (!out[key]) out[key] = textFrame(d); }
      else if (PIC.includes(id) && !out.cover) out.cover = pictureFrame(d, major === 2);
    }
  }

  /** Reads the tags of a blob: an ID3v2 tag at the start, then, for FLAC and Ogg (Vorbis, Opus) files, their Vorbis
   * comments (vorbis.js) fill what ID3 left empty. version is the ID3 major version (0 without one); format is
   * 'flac' or 'ogg' when Vorbis comments were found. Never throws: returns what it could read. */
  async function readTags(blob) {
    const out = { title: '', artist: '', album: '', track: 0, year: '', genre: '', cover: null, version: 0, format: '' };
    try {
      if (!blob || blob.size < 10) return out;
      const h = await bytesAt(blob, 0, 10);
      let end = 0;
      if (ascii(h, 0, 3) === 'ID3') {
        end = 10 + syncsafe(h, 6) + (h[3] === 4 && h[5] & 0x10 ? 10 : 0);
        try { await readId3(blob, h, out); } catch (e) { /* a broken tag keeps what was read */ }
      }
      const v = M.vorbis ? await M.vorbis.read(blob, end) : null;
      if (v) {
        for (const k of ['title', 'artist', 'album', 'track', 'year', 'genre', 'cover']) if (!out[k] && v[k]) out[k] = v[k];
        out.format = ascii(await bytesAt(blob, end, 4), 0, 4) === 'fLaC' ? 'flac' : 'ogg';
      }
    } catch (e) { /* a broken tag keeps what was read */ }
    return out;
  }

  /** WAV header: { duration, rate, channels, bits } from the fmt and data chunks, or null if not a WAV. */
  async function wavInfo(blob) {
    if (!blob || blob.size < 44) return null;
    const h = await bytesAt(blob, 0, 12);
    if (ascii(h, 0, 4) !== 'RIFF' || ascii(h, 8, 4) !== 'WAVE') return null;
    let p = 12, fmt = null;
    while (p + 8 <= blob.size) {
      const c = await bytesAt(blob, p, 8);
      const id = ascii(c, 0, 4), len = u32le(c, 4);
      if (id === 'fmt ') {
        const f = await bytesAt(blob, p + 8, Math.min(len, 40));
        fmt = { channels: u16le(f, 2), rate: u32le(f, 4), bits: u16le(f, 14) };
      } else if (id === 'data') {
        if (!fmt || !fmt.rate || !fmt.channels || !fmt.bits) return null;
        const bytes = Math.min(len, blob.size - p - 8);
        const frame = fmt.channels * (fmt.bits / 8);
        return { duration: bytes / (fmt.rate * frame), rate: fmt.rate, channels: fmt.channels, bits: fmt.bits };
      }
      p += 8 + len + (len & 1);
    }
    return null;
  }

  /** The audio MIME type: the given one when it is audio, else from the file extension. */
  function typeOf(name, type) {
    if (type && /^audio\//.test(type)) return type;
    const ext = String(name || '').split('.').pop().toLowerCase();
    return EXT_TYPE[ext] || type || 'application/octet-stream';
  }
  /** The file name without its extension (the title when no tag gives one). */
  function titleFromName(name) {
    const s = String(name || '').replace(/\.[^.]+$/, '').trim();
    return s || String(name || 'Untitled');
  }
  M.id3 = { readTags, wavInfo, typeOf, titleFromName, EXT_TYPE };
})();
