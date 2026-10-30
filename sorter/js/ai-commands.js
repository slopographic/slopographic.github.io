/* Slop Photo Sorter for the assistant: SlopCmd commands with arguments, imported on demand by SlopCmd.prepare() (app.js).
 * On the page's own set (SlopSorter.app, model.js): new_sort (a fresh pile, as Clear does; destructive: the decisions go),
 * add_photos (from Slop Drive), set_decision (like, dislike or not
 * sorted), add_tags, remove_tag, remove_photos (destructive: out of the pile; the Drive files stay) and export_photos (the
 * liked photos as a ZIP, or the decisions as CSV, to Slop Drive and/or a download; or the liked photos into a Drive
 * folder, as the page's button). Photos are named by name or id; with none given, the shown ones. */
import { writeZip } from '../../shared/office/zip.js';

const C = window.SlopCmd, P = () => window.SlopSorter.app, M = () => window.SlopSorter.model;
const list = [];
const add = C.aiAdder('sorter', list);   // shared/commands/commands.js
const PHOTOS = { name: 'photos', type: 'array', maxItems: 5000, items: { type: 'string' }, description: 'photo names or ids; the shown ones when empty' };
function pick(names) {
  const items = P().set.items;
  if (!names || !names.length) return M().filter(items, P().which);
  return names.map((q) => {
    const s = String(q).toLowerCase(), it = items.find((x) => x.id === q) || items.find((x) => x.name.toLowerCase() === s) || items.find((x) => x.path.toLowerCase() === s);
    if (!it) throw new Error(`No photo “${q}” in the pile`);
    return it;
  });
}
const counts = () => { const c = M().counts(P().set.items); return `${c.all} photos: ${c.liked} liked, ${c.disliked} disliked, ${c.unsorted} not sorted`; };
async function save(blob, name, to) {
  const out = [];
  if (to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'sorter' })})`);
  if (to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
  return out.join(' and ') + '.';
}

/** Slop Drive files by id or name (shared/commands/sources.js), all found before anything changes. */
async function driveFiles(names) {
  const src = await window.SlopCmd.sources(), files = [];
  for (const q of names) files.push(await src.driveAsFile(q));
  return files;
}
const FILES = { name: 'files', type: 'array', required: true, maxItems: 5000, items: { type: 'string' }, description: 'Slop Drive names or ids' };

add('new_sort', 'Start a new sort', [Object.assign({}, FILES, { required: false, description: 'Slop Drive photos (names or ids) to start the new pile with' })], async (a) => {
  const files = a.files && a.files.length ? await driveFiles(a.files) : [];   // all found before the old pile goes
  const was = P().set.items.length;
  P().clear();
  const added = files.length ? P().add(files) : [];
  return `Started a new sort (${was} photo(s) and their decisions cleared) with ${added.length} photo(s).`;
}, { destructive: true, description: 'Clear the pile and its decisions and start a new sort, empty or with photos from Slop Drive. Export first to keep the decisions.' });
add('add_photos', 'Add photos from Slop Drive', [FILES], async (a) => {
  const added = P().add(await driveFiles(a.files));
  return `Added ${added.length} photo(s). ${counts()}.`;
});
add('set_decision', 'Like or dislike photos', [PHOTOS, { name: 'decision', type: 'enum', values: ['liked', 'disliked', 'none'], required: true }], async (a) => {
  const items = pick(a.photos);
  for (const it of items) await P().set.setLiked(it.id, a.decision === 'none' ? null : a.decision);
  return `Marked ${items.length} photo(s) ${a.decision === 'none' ? 'not sorted' : a.decision}. ${counts()}.`;
});
add('add_tags', 'Tag photos', [PHOTOS, { name: 'tags', type: 'array', required: true, maxItems: 20, items: { type: 'string' } }], async (a) => {
  const items = pick(a.photos);
  for (const it of items) for (const t of a.tags) await P().set.addTag(it.id, t);
  return `Tagged ${items.length} photo(s) ${a.tags.join(', ')}.`;
});
add('remove_tag', 'Take a tag off photos', [PHOTOS, { name: 'tag', type: 'string', required: true, maxLength: 60 }], async (a) => {
  const items = pick(a.photos), t = a.tag.trim().toLowerCase();
  for (const it of items) await P().set.removeTag(it.id, t);
  return `Took “${t}” off ${items.length} photo(s).`;
});
add('remove_photos', 'Remove photos from the pile', [PHOTOS], (a) => {
  const items = pick(a.photos);
  for (const it of items) P().set.remove(it.id);
  return `Removed ${items.length} photo(s) from the pile. ${counts()}.`;
}, { destructive: true });
add('export_photos', 'Export the sorted photos', [{ name: 'what', type: 'enum', values: ['liked_zip', 'decisions_csv', 'liked_to_drive_folder'], default: 'liked_zip' },
  { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }], async (a) => {
  if (a.what === 'decisions_csv') return save(new Blob([M().csv(P().set.items)], { type: 'text/csv' }), 'photo-decisions.csv', a.to);
  const liked = M().filter(P().set.items, 'liked');
  if (!liked.length) throw new Error('No photo is liked yet');
  if (a.what === 'liked_to_drive_folder') { await P().driveLiked(); return `Saved ${liked.length} liked photo(s) to a Slop Drive folder (Photo Sorter › Liked …).`; }
  const seen = new Set(), entries = liked.map((x) => { let n = x.name, k = 2; while (seen.has(n.toLowerCase())) n = x.name.replace(/(\.[^.]*)?$/, (e) => ` (${k++})${e || ''}`); seen.add(n.toLowerCase()); return { path: n, data: x.file }; });
  return save(await writeZip(entries, { compress: false }), 'liked-photos.zip', a.to);
}, { description: 'The liked photos as a ZIP, the decisions as CSV, or the liked photos into a Slop Drive folder.' });

C.register(list);
C.provide({
  state: () => ({ app: 'Photo Sorter', counts: M().counts(P().set.items), showing: P().which, photos: P().set.items.slice(0, 200).map((x) => ({ id: x.id, name: x.name, decision: x.liked, tags: x.tags })) }),
  checkpoint: () => {
    const snap = new Map(P().set.items.map((x) => [x.id, { liked: x.liked, tags: x.tags.slice() }]));
    return () => {
      const set = P().set;
      for (const it of set.items) { const s = snap.get(it.id); if (!s) set.remove(it.id); else { it.liked = s.liked; it.tags = s.tags.slice(); } }
      P().draw();
      return true;
    };
  },
});
