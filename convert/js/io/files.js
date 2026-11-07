/* File helpers for the UI: reading a file's first bytes, sizes, unique names, saving a Blob. Browser only. */
export const HEAD_BYTES = 512;

export async function readHead(file) {
  return new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
}

/** The file name without its extension ("photo.final.png" to "photo.final"), or 'file' when nothing is left. */
export const stemOf = (name) => String(name).replace(/\.[^.]+$/, '') || 'file';

export function fmtSize(n) {
  if (n < 1000) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1000, i = 0;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Returns name, or name (2), name (3)... so every output in a batch has its own file name. */
export function uniqueName(name, taken) {
  if (!taken.has(name)) { taken.add(name); return name; }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) {
    const cand = `${stem} (${n})${ext}`;
    if (!taken.has(cand)) { taken.add(cand); return cand; }
  }
}

/** Save a Blob under a name through a temporary link. The object URL is released a minute later. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
