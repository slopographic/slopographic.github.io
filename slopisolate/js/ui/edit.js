/* SlopIsolate — changing settings: the one code path for the settings panel (the image on screen, or every selected
 * picture at once), Paste settings and Apply these settings to all. A change is a patch { path: value } (the paths of
 * core/settings.js). After it:
 *   the model        → CO.process.pin: only the images made with another model run again
 *   edge refinement  → the model runs again for those images (it changes the cut-out itself)
 *   anything else    → 'look': the image on screen finishes again in the worker (no model run), the queue tiles redraw
 *                      their result (ui/thumbs.js)
 * Every changed image gets an undo entry; with several images they share one group, so one Undo undoes all (history.js).
 *   const s = CO.edit.begin(items); s.change(patch) (live, any number of times); s.commit(label)
 *   CO.edit.apply(items, patch, label)   one change and one undo step (a click, a paste)
 *   CO.edit.copy(it) · paste(items) · applyToAll() · clip() */
(function () {
  'use strict';
  const CO = window.CO, S = CO.state, H = CO.history, ST = CO.settings;
  const E = CO.edit = {};
  let clip = null;

  /** Write a patch on the images. Returns the paths that changed on at least one. */
  function change(items, patch) {
    const changed = new Set(), look = Object.assign({}, patch), model = look.model;
    delete look.model;
    for (const it of items) {
      const paths = ST.changes(it, look);
      if (!paths.length) continue;
      for (const p of paths) { ST.set(it, p, look[p]); changed.add(p); }
      if (ST.needsModel(paths) && (it.status === 'done' || it.status === 'working')) CO.process.rerun(it);
      else CO.emit('look', it);
    }
    if (model) {
      const other = items.filter((it) => it.kind !== 'video' && S.modelOf(it) !== model);
      if (other.length) { CO.process.pin(other, model); changed.add('model'); other.forEach((it) => CO.emit('item', it)); }
    }
    const cur = S.current();
    if (changed.size && cur && items.includes(cur)) S.rememberLook(cur);
    if (changed.size) CO.emit('settings', { items, paths: [...changed] });
    if (changed.size && CO.macroLook) CO.macroLook(cur && items.includes(cur) ? cur : items[0]);   // a macro being recorded keeps the look (ui/macros.js)
    return [...changed];
  }

  E.begin = function (items) {
    let snaps = null;
    return {
      items,
      change(patch) {
        if (!snaps) snaps = items.map((it) => H.snapLook(it));
        return change(items, patch);
      },
      /** One undo step for everything changed since begin. Returns how many images it changed. */
      commit(label) {
        if (!snaps) return 0;
        const g = items.length > 1 ? H.group() : null;
        let n = 0;
        items.forEach((it, i) => { if (H.pushLook(it, snaps[i], label, g)) n++; });
        snaps = null;
        return n;
      },
    };
  };
  E.apply = function (items, patch, label) {
    const s = E.begin(items), paths = s.change(patch);
    s.commit(label);
    return paths;
  };

  /** Copy settings: the settings of one image (the one on screen by default) to paste on others. */
  E.copy = function (it) {
    it = it || S.current();
    if (!it) return null;
    clip = ST.copy(it, S.modelOf);
    CO.emit('clip', clip);
    return clip;
  };
  E.clip = () => clip;
  /** Paste settings on the images (the selection, or the image on screen). */
  E.paste = function (items) {
    if (!clip) return [];
    return E.apply(items || S.targets(), ST.patchOf(clip), 'Paste settings');
  };
  /** Apply the settings of the image on screen to every picture in the queue. */
  E.applyToAll = function () {
    const src = S.current();
    if (!src) return [];
    const items = S.items.filter((it) => it.kind !== 'video');
    return E.apply(items, ST.patchOf(ST.copy(src, S.modelOf)), 'Apply settings to all');
  };
})();
