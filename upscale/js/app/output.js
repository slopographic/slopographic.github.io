/* Slop Upscale: getting the result out. Download the picture or video, save it to Slop Drive, every result as one ZIP,
 * and the shared "Open in…" items (SlopOuttake). Files come in through the intake (app/main.js). The controller
 * (app/main.js) shares its state and helpers as SlopUpscale.app.
 * Classic script. */
(function (g) {
  'use strict';
  const U = g.SlopUpscale, IO = U.io, D = U.drive;
  const t = U.t, S = () => U.app.S, toast = (m) => U.app.toast(m), setStatus = (m, f) => U.app.setStatus(m, f);

async function resultBlob(it = S().item) {
  if (!it || !it.out) return null;
  if (it.kind === 'video') return it.outBlob;
  return IO.encode(it.out.canvas, S().format, S().quality);
}
function resultName(it = S().item) {
  return it.kind === 'video' ? it.outName : IO.outName(it.name, it.out && it.out.scale || S().scale, S().format);
}
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function download() {
  try {
    const blob = await resultBlob();
    if (blob) save(blob, resultName());
  } catch (e) { setStatus(e.message); }
}
/** Every finished result in one ZIP (SlopZip, shared/backup/zip.js). */
async function downloadAll() {
  try {
    const done = S().items.filter((it) => it.out), files = [];
    for (const it of done) files.push({ name: resultName(it), data: await resultBlob(it) });
    save(await g.SlopZip.zip(files), 'slop-upscale-' + done.length + '.zip');
  } catch (e) { setStatus(e.message); }
}
/** "Open in…": the shared outtake's items for the result (other apps, a workflow, Save to Slop Drive…). */
function openInItems() {
  const it = S().item;
  if (!it || !it.out || !g.SlopOuttake) return [];
  const type = it.kind === 'video' ? (it.outBlob && it.outBlob.type) || 'video/webm' : IO.mime(S().format);
  return g.SlopOuttake.items({ from: 'upscale', get: () => resultBlob(it), name: () => resultName(it), type });
}
async function saveDrive() {
  if (!D.available()) { toast(t('upscale.out.no_drive')); return; }
  try {
    const blob = await resultBlob();
    if (!blob) return;
    const id = await D.save(blob, resultName(), { source: S().item.name, scale: S().scale });
    S().item.drive = id;
    toast(t('upscale.out.saved'));
  } catch (e) { setStatus(t('upscale.out.save_failed', { msg: e.message })); }
}
  U.output = { resultBlob, resultName, download, downloadAll, openInItems, saveDrive };
})(typeof window !== 'undefined' ? window : globalThis);
