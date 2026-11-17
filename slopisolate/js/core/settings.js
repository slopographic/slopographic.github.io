/* SlopIsolate — the settings of an image as plain data, for bulk editing: every field the settings panel edits, read and
 * written by path ('s.threshold', 'bg.color', 'model', …). Pure (no DOM): also loaded by tests/node/slopisolate-settings.test.mjs.
 *   PATHS                       every field, in panel order. 'model' is the model the image runs with.
 *   get(it, path, modelOf?)     a value. modelOf(it) gives the model (default: it.model)
 *   set(it, path, v)            writes it ('model' pins it.model)
 *   copy(it, modelOf?)          { s, bg, shadow, crop, model }: a plain copy to paste on other images (no background picture)
 *   patchOf(data)               the same as { path: value } for every known path in data (unknown keys are dropped)
 *   changes(it, patch, modelOf?) the paths of patch whose value differs from the image's
 *   merge(items, modelOf?)      { n, value(path), mixed(path) }: the value they share, or mixed when they differ
 *   agreed(items, fallback, modelOf?) copy() of the shared values; a mixed one is taken from fallback
 *   needsModel(paths)           true when one of them changes the cut-out itself (the model, or edge refinement), so the
 *                               model runs again; every other field is post-processing or compositing (cheap, no model run) */
(function () {
  'use strict';
  const CO = window.CO || (window.CO = {});
  const GROUPS = ['s', 'bg', 'shadow', 'crop'];
  const PATHS = [
    's.threshold', 's.softness', 's.feather', 's.decontaminate', 's.refine',
    'bg.mode', 'bg.color', 'bg.blur', 'bg.gradA', 'bg.gradB', 'bg.angle',
    'shadow.on', 'shadow.opacity', 'shadow.blur', 'shadow.x', 'shadow.y', 'shadow.color',
    'crop.mode', 'crop.pad', 'model',
  ];
  const MODEL_PATHS = ['model', 's.refine'];
  const own = (it) => it.model || null;

  function get(it, path, modelOf = own) {
    if (path === 'model') return modelOf(it);
    const [g, k] = path.split('.');
    return it[g] ? it[g][k] : undefined;
  }
  function set(it, path, v) {
    if (path === 'model') { it.model = v; return; }
    const [g, k] = path.split('.');
    if (!it[g]) it[g] = {};
    it[g][k] = v;
  }
  function copy(it, modelOf = own) {
    const out = { model: modelOf(it) };
    for (const g of GROUPS) out[g] = Object.assign({}, it[g]);
    if (out.bg) delete out.bg.image;
    return out;
  }
  function patchOf(data) {
    const out = {};
    if (!data || typeof data !== 'object') return out;
    for (const p of PATHS) {
      const v = p === 'model' ? data.model : (data[p.split('.')[0]] || {})[p.split('.')[1]];
      if (v !== undefined && v !== null) out[p] = v;
    }
    return out;
  }
  function changes(it, patch, modelOf = own) {
    return Object.keys(patch).filter((p) => PATHS.includes(p) && get(it, p, modelOf) !== patch[p]);
  }
  function merge(items, modelOf = own) {
    const list = (items || []).filter(Boolean), vals = {}, mixed = {};
    for (const p of PATHS) {
      vals[p] = list.length ? get(list[0], p, modelOf) : undefined;
      mixed[p] = list.some((it) => get(it, p, modelOf) !== vals[p]);
    }
    return { n: list.length, value: (p) => vals[p], mixed: (p) => !!mixed[p] };
  }
  function agreed(items, fallback, modelOf = own) {
    const m = merge(items, modelOf), src = fallback || (items && items[0]);
    const out = copy(src, modelOf);
    for (const p of PATHS) if (m.n && !m.mixed(p)) set(out, p, m.value(p));
    return out;
  }
  const needsModel = (paths) => [].concat(paths || []).some((p) => MODEL_PATHS.includes(p));

  CO.settings = { PATHS, GROUPS, get, set, copy, patchOf, changes, merge, agreed, needsModel };
})();
