/* PhotoSlop UI: the colour picker dialog (foreground / background swatches, filter and type colours) and the side panel.
 * The body is shared with SlopVector (shared/color/picker.js). The colour itself lives in C (tools/state.js). */
'use strict';

/** Recent colours, most recent first, kept in the person's store (up to 12). */
const RECENTS = {
  list: () => store.get('recentColors', []),
  add: (hex) => store.set('recentColors', SlopColor.recentAdd(store.get('recentColors', []), hex, 12)),
};

/** The side panel's picker: every change writes the foreground colour through set(v). */
function colorPicker(get, set) {
  const cp = SlopColorPicker.create({ value: get(), recents: RECENTS, onChange: (v) => set(v) });
  return { el: cp.el, sync() { cp.set(get()); } };
}

/**
 * Colour dialog. live(hex), when given, runs on every change (the swatch updates at once) and again with the
 * original colour when the dialog is cancelled. Resolves with the chosen colour, or null when cancelled.
 */
function pickColorDialog(title, initial, live) {
  return new Promise((res) => {
    let cur = initial;
    const cp = SlopColorPicker.create({
      value: initial, recents: RECENTS,
      onChange: (v) => { cur = v; nw.style.background = v; if (live) live(v); },
    });
    const nw = h('div', { class: 'cp-preview scp-checker' }), old = h('div', { class: 'cp-preview old scp-checker', title: tr('photoslop.color.restore'), onclick: () => { cur = initial; cp.set(initial); nw.style.background = initial; if (live) live(initial); } });
    nw.style.background = initial; old.style.background = initial;
    dialog({
      title, cls: 'dlg-color cp-sheet',
      body: h('div', { class: 'cp-dlg' }, cp.el, h('div', { class: 'cp-compare' }, h('span', null, tr('photoslop.color.new')), nw, old, h('span', null, tr('photoslop.color.current')))),
      buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true }],
      onClose: (ok) => {
        if (ok) { cp.commit(); res(cur); return; }
        if (live && cur !== initial) live(initial);
        res(null);
      },
    });
  });
}

/** Edits the foreground or background colour in the dialog. Changes apply live; Cancel restores the old colour. */
function editSwatch(which) {
  const title = tr(which === 'fg' ? 'photoslop.color.title_fg' : 'photoslop.color.title_bg');
  return pickColorDialog(title, C[which], (v) => setColor(which, v)).then((c) => { if (c) setColor(which, c); });
}
