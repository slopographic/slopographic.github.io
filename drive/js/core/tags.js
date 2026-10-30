/* Slop Drive — core/tags: free-text tags on files. A tag is lowercase, unique per file, and stored in the
 * record's meta (meta.tags), so it travels with backups, exports and copies. Folders carry no tags. */
'use strict';
(function (DR) {
  const S = DR.S, H = () => window.SlopHub;
  /** Trimmed, lowercase, single-spaced, at most 40 characters. */
  DR.normTag = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  DR.tagsOf = (it) => (it && !it.isFolder && it.meta && Array.isArray(it.meta.tags) ? it.meta.tags : []);
  /** Tags for the file records in items (folders are skipped). Writes meta without touching the modified date. */
  async function write(files, fn) {
    for (const it of files) {
      const tags = fn(DR.tagsOf(it));
      await H().update(it.id, { meta: Object.assign({}, it.meta || {}, { tags }) }, { touch: false });
    }
    await DR.done();
  }
  /** Add comma-separated tags to the files in items. Returns how many tags were new to the set. */
  DR.addTags = async function (items, text) {
    const add = [...new Set(String(text || '').split(',').map(DR.normTag).filter(Boolean))];
    const files = items.filter((it) => !it.isFolder);
    if (!add.length || !files.length) return 0;
    await write(files, (old) => [...new Set([...old, ...add])]);
    return add.length;
  };
  DR.removeTag = async function (items, tag) {
    const files = items.filter((it) => !it.isFolder && DR.tagsOf(it).includes(tag));
    if (files.length) await write(files, (old) => old.filter((t) => t !== tag));
    return files.length;
  };
  /** Prompt for tags and add them to the files in items. */
  DR.tagPrompt = async function (items) {
    const v = await window.SlopUI.prompt(DR.t('drive.info.add_tags'), DR.t('drive.info.tags_prompt'), '', { ok: DR.t('drive.info.add') });
    if (v) await DR.addTags(items, v);
  };
  /** [tag, count] pairs over live files, most used first. */
  DR.tagCounts = function () {
    const m = new Map();
    for (const r of DR.liveFiles()) for (const t of DR.tagsOf(r)) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  /** The sidebar's tag filter: a file passes when it carries the chosen tag. */
  DR.tagOk = (it) => !S.tag || (!it.isFolder && DR.tagsOf(it).includes(S.tag));
  DR.setTagFilter = function (tag) {
    S.tag = S.tag === tag ? '' : tag; S.section = 'folder'; S.sel.clear();
    DR.render();
  };
})(window.DR);
