/* Slop Watermark: the files of this visit: pictures, videos and PDFs, mixed. Each item: { id, file, name, media, type,
 * url (the thumbnail), w, h, pages, duration, group, out, error, note }. group is the shape group (WMGroups.classify),
 * worked out when the file is added; out = { blob, name } after Apply to all; note: what the watermark could not keep
 * (an animated WebP). Files are read again when they are watermarked, so the list keeps only thumbnails in memory.
 * Classic script. Exposes window.WMItems; selected() is the file the preview shows. */
(function () {
  'use strict';
  const MAX = 500;
  const list = [];
  let seq = 0, sel = '';

  /** Reads a file into the list. Rejects with a reason when the list is full or the file cannot be read. */
  async function add(file) {
    if (list.length >= MAX) throw new Error(window.WMUtil.t('watermark.drop.full_clear', { n: MAX }));
    const info = await window.WMProbe.of(file);
    const item = { id: 'wm' + (++seq), file, name: file.name, media: info.media, type: info.type, url: info.thumb, w: info.w, h: info.h,
      pages: info.pages, duration: info.duration, group: window.WMGroups.classify(info.w, info.h), out: null, error: '', note: '' };
    list.push(item);
    if (!sel) sel = item.id;
    return item;
  }
  function remove(id) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    if (list[i].url) URL.revokeObjectURL(list[i].url);
    list.splice(i, 1);
    if (sel === id) sel = list[Math.min(i, list.length - 1)] ? list[Math.min(i, list.length - 1)].id : '';
  }
  function clear() { list.forEach((x) => x.url && URL.revokeObjectURL(x.url)); list.length = 0; sel = ''; }
  function get(id) { return list.find((x) => x.id === id) || null; }
  function setOut(id, out, note) { const x = get(id); if (x) { x.out = out; x.error = ''; x.note = note || ''; } }
  function setError(id, msg) { const x = get(id); if (x) { x.out = null; x.error = msg; } }
  function clearOuts() { list.forEach((x) => { x.out = null; x.error = ''; x.note = ''; }); }
  const kinds = () => ({ pages: list.some((x) => x.media === 'pdf'), time: list.some((x) => x.media === 'video') });

  window.WMItems = {
    MAX, add, remove, clear, get, setOut, setError, clearOuts, kinds,
    all: () => list.slice(),
    first: () => list[0] || null,
    selected: () => get(sel) || list[0] || null,
    select: (id) => { if (get(id)) sel = id; },
    count: () => list.length,
    outCount: () => list.filter((x) => x.out).length,
  };
})();
