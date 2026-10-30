/* Slop tags: pure helpers for free-text tags stored on a Slop Drive file record in meta.tags.
 * A tag is lowercase, single-spaced, at most 40 characters, unique per file. No DOM, no storage: callers
 * read and write the record themselves (SlopHub.update(id, { meta: {...meta, tags} }, { touch: false })).
 * Classic script, exposes window.SlopTags. Copied from drive/js/core/tags.js; see HANDOFF.md. */
(function () {
  'use strict';
  if (window.SlopTags) return;
  /** Trimmed, lowercase, single-spaced, at most 40 characters. */
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  /** The tag list of a record (folders have none). */
  const of = (rec) => (rec && !rec.isFolder && rec.meta && Array.isArray(rec.meta.tags) ? rec.meta.tags : []);
  /** Comma-separated text to a unique list of normalised tags. */
  const parse = (text) => [...new Set(String(text || '').split(',').map(norm).filter(Boolean))];
  /** The list with extra tags added (no duplicates). */
  const withAdded = (old, add) => [...new Set([...(old || []), ...add])];
  /** The list without one tag. */
  const withoutTag = (old, tag) => (old || []).filter((t) => t !== tag);
  /** [tag, count] pairs over records, most used first. */
  function counts(recs) {
    const m = new Map();
    for (const r of recs) for (const t of of(r)) m.set(t, (m.get(t) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }
  /** Does the record carry the tag? An empty tag matches everything. */
  const has = (rec, tag) => !tag || of(rec).includes(tag);
  window.SlopTags = { norm, of, parse, withAdded, withoutTag, counts, has };
})();
