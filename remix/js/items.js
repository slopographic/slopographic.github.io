/* Reel Remix: the media bin. Files become items { id, name, kind, dur, w, h, url, el, file }: images (still, dur
   Infinity) and videos (their duration). Object URLs are made here and revoked when an item is removed. */
(function () {
  'use strict';
  const RM = window.RM;
  let seq = 0;
  /** Read a file's size and duration. Resolves with the item, or null for a file that is neither image nor video. */
  function load(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const id = 'm' + (++seq);
      const base = { id, name: file.name, url, file };
      if (/^video\//.test(file.type)) {
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true; v.playsInline = true;
        v.onloadedmetadata = () => resolve(Object.assign(base, { kind: 'video', dur: isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight, el: v }));
        v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        v.src = url;
      } else if (/^image\//.test(file.type)) {
        const im = new Image();
        im.onload = () => resolve(Object.assign(base, { kind: 'image', dur: Infinity, w: im.naturalWidth, h: im.naturalHeight, el: im }));
        im.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        im.src = url;
      } else { URL.revokeObjectURL(url); resolve(null); }
    });
  }
  /** Add files to the bin. A file with the name of a missing clip fills that clip (same id, so the plan keeps it).
   *  Returns the number added. Does not re-plan (the caller does that when a clip was filled). */
  RM.addFiles = async function (files) {
    let n = 0;
    for (const f of [...files]) {
      const it = await load(f);
      if (!it) continue;
      const hole = RM.state.items.find((x) => x.missing && x.name === f.name);
      if (hole) Object.assign(hole, { kind: it.kind, dur: it.dur, w: it.w, h: it.h, url: it.url, el: it.el, file: f, missing: false });
      else RM.state.items.push(it);
      n++;
    }
    return n;
  };
  RM.removeItem = function (id) {
    const st = RM.state, it = st.items.find((x) => x.id === id);
    if (!it) return;
    st.items = st.items.filter((x) => x !== it);
    URL.revokeObjectURL(it.url);
  };
})();
