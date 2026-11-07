/* The one watermark panel for every app: layers (text and logo, stacked bottom to top: show or hide, select, move up or
 * down, duplicate, remove), the selected layer's fields (panel-fields.js), My watermarks (panel-saved.js) and the app's
 * own buttons. It holds no document: every change goes to onChange(spec, { label, key }) as a new spec (the app keeps it
 * and its undo; key joins a run of changes to one field into one undo step), and set(spec) shows the app's spec again.
 * Mount it as many times as needed (each is separate). Styles: panel.css. Needs SlopUI, SlopMenuButton, spec*.js, core.js
 * and saved.js. Classic script: window.SlopWatermarkPanel.
 *   const p = SlopWatermarkPanel.mount(host, {
 *     value: spec, onChange(spec, { label, key }),
 *     media: { pages: false, time: false },  // which ranges to offer: page range (PDFs), time range (videos)
 *     pageCount: () => n, currentPage: () => 1-based page in view (adds "This page"),
 *     toggle: { get: () => on, set: (on) => {}, label: 'app.wm.on', note: (on) => text },  // an on/off switch (optional)
 *     newLayer: (kind) => ({ ...fields }),   // the app's defaults for a new layer (optional)
 *     actions: [{ label, title, act }],      // the app's own buttons under the panel (optional; label/title may be keys)
 *     onFiles: (files) => {},                // files dropped on the panel that are not pictures (default: the page's intake)
 *     intake: 'app.logo',                    // the name of the panel's logo part in the page's intake (default watermark.logo.<n>)
 *     saved: true,                           // the My watermarks button
 *   });
 *   p.el ; p.set(spec) ; p.get() ; p.setMedia({ pages, time }) ; p.select(layerId) ; p.selected() ; p.sync() ; p.destroy()
 * A logo comes in through the page's one intake (shared/intake, SlopIntake) when the page has it: each panel is a part of
 * its own (opts.intake, else 'watermark.logo.<n>'; picked or dropped), registered when the panel mounts, so the page can
 * reach it by name (SlopIntake.pick({ to })) from boot; without the intake, through SlopUI.pickFiles and the panel's drop.
 * Words: shared/i18n/ui/<code>/watermark.js (keys ui.wm.*); a language switch relabels the panel and rebuilds the editor. */
(function () {
  'use strict';
  const P = (window.SlopWatermarkPanel = window.SlopWatermarkPanel || {});
  const S = window.SlopWatermarkSpec, WM = window.SlopWatermark;
  const el = (...a) => window.SlopUI.el(...a);
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const lab = (v) => (window.SlopI18n && window.SlopI18n.label ? window.SlopI18n.label(v) : v);   // a key, a function or text
  const IMG = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
  const isPicture = (f) => /^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(f.type || '') || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name || '');

  let mounts = 0;
  P.mount = function (host, opts = {}) {
    const IID = opts.intake || 'watermark.logo.' + (++mounts);
    let offIntake = null;
    let spec = S.normalize(opts.value || S.defaults()), sel = spec.layers.length ? spec.layers[spec.layers.length - 1].id : null;
    let media = Object.assign({ pages: false, time: false }, opts.media), editorFor = '';
    const emit = (next, label, key) => { spec = next; render(); if (opts.onChange) opts.onChange(spec, { label, key: key || null }); };
    const layer = () => S.getLayer(spec, sel);
    const fresh = (kind) => S.layerDefaults(kind, opts.newLayer ? opts.newLayer(kind) : null);

    /** The panel's logo part in the page's intake (registered at mount, or on first use if the intake came later). */
    function intake() {
      const SI = window.SlopIntake;
      if (!offIntake && SI && SI.register && SI.pick) {
        offIntake = SI.register({ id: IID, main: false, paste: false, limit: 1, toast: false,
          accept: { types: IMG.split(','), exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'], get noun() { return tr('ui.wm.logo_noun'); } },
          process: (file, ctx) => useLogo(file, !!(ctx && ctx.data && ctx.data.add)) }) || (() => {});
      }
      return !!offIntake;
    }
    async function pickLogo(add) {
      if (intake()) { await window.SlopIntake.pick({ to: IID, multiple: false, data: { add } }); return; }
      const files = await window.SlopUI.pickFiles({ accept: IMG });
      if (files && files[0]) await useLogo(files[0], add);
    }
    async function useLogo(file, add) {
      let fields;
      try { fields = await WM.readLogo(file); } catch (e) { window.SlopUI.toast(e.message, 4000); return; }
      const cur = layer();
      if (!add && cur && cur.kind === 'logo') { emit(S.updateLayer(spec, cur.id, fields), tr('ui.wm.undo_change_logo')); return; }
      const L = Object.assign(fresh('logo'), fields);
      sel = L.id;
      emit(S.addLayer(spec, L), tr('ui.wm.undo_add_logo'));
    }
    intake();
    function addText() { const L = fresh('text'); sel = L.id; emit(S.addLayer(spec, L), tr('ui.wm.undo_add_text')); }

    const ctx = { layer, media: () => media, pageCount: () => (opts.pageCount ? opts.pageCount() : 0), currentPage: opts.currentPage || null,
      pickLogo: () => pickLogo(false), patch: (p, label, key) => { const L = layer(); if (L) emit(S.updateLayer(spec, L.id, p), label, key ? 'wm:' + L.id + ':' + key : null); } };

    // the switch
    let sw = null, swNote = null;
    if (opts.toggle) {
      const cb = el('input', { type: 'checkbox', role: 'switch' }), swText = el('span');
      cb.addEventListener('change', () => opts.toggle.set(cb.checked));
      swNote = el('p', { class: 'swp-fine swp-note', 'aria-live': 'polite' });
      sw = { cb, text: swText, el: el('div', { class: 'swp-toggle' }, el('label', { class: 'swp-switch' }, cb, swText), swNote) };
    }

    // layers
    const addT = el('button', { type: 'button', class: 'sui-btn swp-add', 'data-add': 'text' });
    const addL = el('button', { type: 'button', class: 'sui-btn swp-add', 'data-add': 'logo' });
    addT.addEventListener('click', addText);
    addL.addEventListener('click', () => pickLogo(true));
    const saved = opts.saved !== false && window.SlopWatermarkSaved && window.SlopMenuButton
      ? P.savedButton({ get: () => spec, use: (sp) => { sel = sp.layers.length ? sp.layers[sp.layers.length - 1].id : null; emit(sp, tr('ui.wm.undo_use_saved')); } }) : null;
    const list = el('ol', { class: 'swp-layers' });
    const stackBtn = (fn) => { const b = el('button', { type: 'button', class: 'sui-btn' }); b.addEventListener('click', fn); return b; };
    const up = stackBtn(() => emit(S.moveLayer(spec, sel, 1), tr('ui.wm.undo_up')));
    const down = stackBtn(() => emit(S.moveLayer(spec, sel, -1), tr('ui.wm.undo_down')));
    const dup = stackBtn(() => { const id = S.uid(), next = S.duplicateLayer(spec, sel, id); sel = id; emit(next, tr('ui.wm.undo_duplicate')); });
    const del = stackBtn(() => { const i = spec.layers.findIndex((L) => L.id === sel), next = S.removeLayer(spec, sel); sel = next.layers.length ? next.layers[Math.max(0, i - 1)].id : null; emit(next, tr('ui.wm.undo_remove')); });
    del.classList.add('swp-danger');
    const stack = el('div', { class: 'swp-stack', role: 'group' }, up, down, dup, del);
    list.addEventListener('click', (e) => { const b = e.target.closest('.swp-item'); if (b) { sel = b.dataset.id; render(); } });
    list.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-show]');
      if (cb) { sel = cb.dataset.show; emit(S.updateLayer(spec, cb.dataset.show, { show: cb.checked }), tr(cb.checked ? 'ui.wm.undo_show' : 'ui.wm.undo_hide')); }
    });

    const editorBox = el('div', { class: 'swp-editor-box' }), msg = el('p', { class: 'swp-msg', role: 'status' });
    let editor = null;
    const acts = (opts.actions || []).map((a) => {
      const b = el('button', { type: 'button', class: 'sui-btn' });
      b.addEventListener('click', () => a.act(spec));
      return { a, b };
    });
    const actions = el('div', { class: 'swp-actions' }, ...acts.map((x) => x.b));
    const root = el('div', { class: 'swp', role: 'group' }, sw && sw.el,
      el('div', { class: 'swp-top' }, addT, addL, saved && saved.el), list, stack, editorBox, msg, actions);
    actions.hidden = !actions.children.length;
    host.append(root);

    /** The words built once, in the chosen language (again after a switch, with the editor rebuilt). */
    function words() {
      const set = (b, text, title) => { b.textContent = text; if (title) b.title = title; };
      if (sw) { const l = lab(opts.toggle.label) || tr('ui.wm.toggle'); sw.cb.setAttribute('aria-label', l); sw.text.textContent = l; }
      set(addT, tr('ui.wm.add_text')); set(addL, tr('ui.wm.add_logo'));
      set(up, tr('ui.wm.up'), tr('ui.wm.up_tip')); set(down, tr('ui.wm.down'), tr('ui.wm.down_tip'));
      set(dup, tr('ui.wm.duplicate'), tr('ui.wm.duplicate_tip')); set(del, tr('ui.wm.remove'), tr('ui.wm.remove_tip'));
      list.setAttribute('aria-label', tr('ui.wm.layers_aria')); stack.setAttribute('aria-label', tr('ui.wm.selected_aria'));
      root.setAttribute('aria-label', tr('ui.wm.mark'));
      for (const { a, b } of acts) set(b, lab(a.label), a.title && lab(a.title));
    }
    words();
    const offLang = window.SlopI18n && window.SlopI18n.on ? window.SlopI18n.on(() => { words(); editorFor = ''; render(); if (saved && saved.relabel) saved.relabel(); }) : null;

    // a picture dropped on the panel is a new logo layer
    const hasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
    root.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; root.classList.add('swp-over'); } });
    root.addEventListener('dragleave', () => root.classList.remove('swp-over'));
    root.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation(); root.classList.remove('swp-over');
      const files = [...(e.dataTransfer.files || [])], pic = files.find(isPicture);
      const rest = files.filter((f) => f !== pic);
      if (pic) { if (intake()) window.SlopIntake.take([pic], { to: IID, source: 'drop', data: { add: true } }); else useLogo(pic, true); }
      if (rest.length) { if (opts.onFiles) opts.onFiles(rest); else if (window.SlopIntake && window.SlopIntake.take) window.SlopIntake.take(rest, { source: 'drop' }); }
    });

    function render() {
      if (sel && !layer()) sel = null;
      if (!sel && spec.layers.length) sel = spec.layers[spec.layers.length - 1].id;
      if (sw) { const on = !!opts.toggle.get(); sw.cb.checked = on; swNote.textContent = opts.toggle.note ? opts.toggle.note(on) : ''; swNote.hidden = !swNote.textContent; }
      list.replaceChildren(...(spec.layers.length ? spec.layers.slice().reverse().map((L) => el('li', { class: 'swp-row' + (L.id === sel ? ' swp-on' : '') + (L.show ? '' : ' swp-hidden') },
        el('input', { type: 'checkbox', 'data-show': L.id, checked: L.show, 'aria-label': tr('ui.wm.show_aria', { name: S.label(L) }) }),
        el('button', { type: 'button', class: 'swp-item', 'data-id': L.id, 'aria-pressed': String(L.id === sel), title: S.label(L) }, S.label(L)),
        el('span', { class: 'swp-kind' }, tr(L.kind === 'logo' ? 'ui.wm.kind_logo' : 'ui.wm.kind_text')))) : [el('li', { class: 'swp-empty' }, tr('ui.wm.no_layers'))]));
      const i = spec.layers.findIndex((L) => L.id === sel);
      stack.hidden = i < 0;
      up.disabled = i >= spec.layers.length - 1; down.disabled = i <= 0;
      dup.disabled = spec.layers.length >= S.MAX_LAYERS; addT.disabled = addL.disabled = spec.layers.length >= S.MAX_LAYERS;
      const L = layer(), key = L ? L.id + ':' + L.kind : '';
      if (key !== editorFor) { editorFor = key; editorBox.replaceChildren(); editor = L ? P.fields(ctx) : null; if (editor) editorBox.append(editor.el); }
      if (editor) editor.sync();
      msg.textContent = S.check(spec); msg.hidden = !msg.textContent;
    }
    render();

    return {
      el: root,
      get: () => spec,
      set(next) { spec = S.normalize(next); render(); },
      setMedia(m) { media = Object.assign({ pages: false, time: false }, m); render(); },
      select(id) { sel = id; render(); },
      selected: () => sel,
      sync: render,
      destroy() { if (saved) saved.destroy(); if (offIntake) offIntake(); if (offLang) offLang(); root.remove(); },
    };
  };
})();
