/* Slop Press — Layers panel: visibility, locking, active layer, rename, reorder, move selection to a layer. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state, L = PR.layers, H = PR.history, K = PR.kit, M = PR.model;
  var UI = PR.ui = PR.ui || {}, t = U.t;

  function count(doc, id) { var n = 0; M.containers(doc).forEach(function (c) { c.items.forEach(function (it) { if (it.layer === id) n++; }); }); return n; }
  UI.panel({
    id: 'layers', title: 'press.panel.layers',
    build: function (body, foot) {
      var doc = S.doc, list = h('div', { class: 'list', role: 'list' });
      if (!L.active || !doc.layers.some(function (l) { return l.id === L.active; })) L.active = doc.layers[doc.layers.length - 1].id;
      var selLayers = {}; PR.selected().forEach(function (it) { selLayers[it.layer] = 1; });
      doc.layers.slice().reverse().forEach(function (l) {
        var idx = doc.layers.indexOf(l);
        var eye = h('button', { type: 'button', title: t(l.visible ? 'press.panel.hide_layer' : 'press.panel.show_layer'), 'aria-label': t('press.panel.toggle_vis'), html: K.icon('eye', l.visible ? '' : 'off') });
        var lock = h('button', { type: 'button', title: t(l.locked ? 'press.panel.unlock_layer' : 'press.panel.lock_layer'), 'aria-label': t('press.panel.toggle_lock'), html: K.icon('lock', l.locked ? '' : 'off') });
        var name = h('span', { class: 'lname' }, l.name + (selLayers[l.id] ? '  ■' : ''));
        var row = h('div', { class: 'lrow' + (L.active === l.id ? ' on' : ''), role: 'listitem', tabindex: '0', title: t('press.panel.layer_tip') },
          eye, lock, h('span', { class: 'lcolor', style: { background: l.color } }), name, h('span', { class: 'lmeta' }, count(doc, l.id)));
        eye.addEventListener('click', function (e) { e.stopPropagation(); l.visible = !l.visible; H.commit(t('press.panel.undo_layer_vis')); });
        lock.addEventListener('click', function (e) { e.stopPropagation(); l.locked = !l.locked; if (l.locked) S.sel = S.sel.filter(function (id) { var f = M.findItem(doc, id); return f && f.item.layer !== l.id; }); H.commit(t('press.panel.undo_layer_lock')); });
        row.addEventListener('click', function () { L.active = l.id; UI.refreshPanels('layers'); });
        row.addEventListener('dblclick', function () { window.SlopUI.prompt(t('press.panel.layer_options'), t('press.style.name'), l.name).then(function (v) { if (v) { l.name = v; H.commit(t('press.panel.undo_rename_layer')); } }); });
        row.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          window.SlopUI.menu([{ label: t('press.panel.move_sel_to', { name: l.name }), disabled: !S.sel.length, act: function () { PR.selected().forEach(function (it) { it.layer = l.id; }); H.commit(t('press.panel.undo_move_to_layer')); } },
            { label: t('press.panel.layer_colour_dots'), act: function () { K.customColor(l.color, function (c) { l.color = U.hex(c); H.commit(t('press.panel.layer_colour')); }, t('press.panel.layer_colour')); } },
            { label: t('press.panel.move_up'), disabled: idx >= doc.layers.length - 1, act: function () { L.move(doc, idx, idx + 1); H.commit(t('press.panel.undo_move_layer')); } },
            { label: t('press.panel.move_down'), disabled: idx === 0, act: function () { L.move(doc, idx, idx - 1); H.commit(t('press.panel.undo_move_layer')); } },
            '-', { label: t('press.panel.delete_layer'), disabled: doc.layers.length < 2, act: function () { delLayer(l); } }], e.clientX, e.clientY);
        });
        list.append(row);
      });
      body.append(list);
      foot.append(h('span', { class: 'count' }, t('press.panel.layers_n', { n: doc.layers.length })),
        UI.footBtn('plus', t('press.panel.new_layer'), function () { var nl = L.add(doc); L.active = nl.id; H.commit(t('press.panel.new_layer')); }),
        UI.footBtn('up', t('press.panel.move_layer_up'), function () { var i = L.index(doc, L.active); if (i < doc.layers.length - 1) { L.move(doc, i, i + 1); H.commit(t('press.panel.undo_move_layer')); } }),
        UI.footBtn('down', t('press.panel.move_layer_down'), function () { var i = L.index(doc, L.active); if (i > 0) { L.move(doc, i, i - 1); H.commit(t('press.panel.undo_move_layer')); } }),
        UI.footBtn('trash', t('press.panel.delete_layer_tip'), function () { delLayer(M.findLayer(doc, L.active)); }));
    }
  });
  function delLayer(l) {
    var doc = S.doc, n = count(doc, l.id);
    var go = function () { if (L.remove(doc, l.id)) { L.active = doc.layers[doc.layers.length - 1].id; S.sel = []; H.commit(t('press.panel.delete_layer_tip')); } };
    if (!n) return go();
    window.SlopUI.confirm(t('press.panel.delete_layer'), t('press.panel.delete_layer_q', { name: l.name, n: n }), t('ui.delete'), { danger: true }).then(function (ok) { if (ok) go(); });
  }
  var soon = U.debounce(function () { UI.refreshPanels('layers'); }, 120);
  PR.on('commit', soon); PR.on('doc', soon); PR.on('select', soon);
})();
