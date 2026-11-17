/* Slop Press — Layers panel: visibility, locking, active layer, rename, reorder, move selection to a layer.
   Several layers can be picked, as in InDesign: a click picks one (the active layer, where new items go), Shift picks the
   range from the anchor (the last row clicked without Shift) to the clicked row in the order shown, Ctrl/Cmd adds or takes
   one away. Hide, lock and delete on a picked row act on every picked layer (L.picked holds their ids). */
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
      var pick = picked(doc), selLayers = {}; PR.selected().forEach(function (it) { selLayers[it.layer] = 1; });
      doc.layers.slice().reverse().forEach(function (l) {
        var idx = doc.layers.indexOf(l);
        var eye = h('button', { type: 'button', title: t(l.visible ? 'press.panel.hide_layer' : 'press.panel.show_layer'), 'aria-label': t('press.panel.toggle_vis'), html: K.icon('eye', l.visible ? '' : 'off') });
        var lock = h('button', { type: 'button', title: t(l.locked ? 'press.panel.unlock_layer' : 'press.panel.lock_layer'), 'aria-label': t('press.panel.toggle_lock'), html: K.icon('lock', l.locked ? '' : 'off') });
        var on = L.active === l.id, inPick = pick.indexOf(l.id) >= 0;
        var name = h('span', { class: 'lname' }, l.name + (selLayers[l.id] ? '  ■' : ''));
        var row = h('div', { class: 'lrow' + (on ? ' on' : '') + (inPick && !on ? ' picked' : ''), 'data-id': l.id, role: 'listitem', tabindex: '0', title: t('press.panel.layer_tip') },
          eye, lock, h('span', { class: 'lcolor', style: { background: l.color } }), name, h('span', { class: 'lmeta' }, count(doc, l.id)));
        eye.addEventListener('click', function (e) { e.stopPropagation(); var v = !l.visible; targets(doc, l).forEach(function (x) { x.visible = v; }); H.commit(t('press.panel.undo_layer_vis')); });
        lock.addEventListener('click', function (e) {
          e.stopPropagation(); var on2 = !l.locked, ls = targets(doc, l), ids = ls.map(function (x) { return x.id; });
          ls.forEach(function (x) { x.locked = on2; });
          if (on2) S.sel = S.sel.filter(function (id) { var f = M.findItem(doc, id); return f && ids.indexOf(f.item.layer) < 0; });
          H.commit(t('press.panel.undo_layer_lock'));
        });
        row.addEventListener('click', function (e) { pickRow(doc, l.id, e); });
        row.addEventListener('dblclick', function () { window.SlopUI.prompt(t('press.panel.layer_options'), t('press.style.name'), l.name).then(function (v) { if (v) { l.name = v; H.commit(t('press.panel.undo_rename_layer')); } }); });
        row.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          window.SlopUI.menu([{ label: t('press.panel.move_sel_to', { name: l.name }), disabled: !S.sel.length, act: function () { PR.selected().forEach(function (it) { it.layer = l.id; }); H.commit(t('press.panel.undo_move_to_layer')); } },
            { label: t('press.panel.layer_colour_dots'), act: function () { K.customColor(l.color, function (c) { l.color = U.hex(c); H.commit(t('press.panel.layer_colour')); }, t('press.panel.layer_colour')); } },
            { label: t('press.panel.move_up'), disabled: idx >= doc.layers.length - 1, act: function () { L.move(doc, idx, idx + 1); H.commit(t('press.panel.undo_move_layer')); } },
            { label: t('press.panel.move_down'), disabled: idx === 0, act: function () { L.move(doc, idx, idx - 1); H.commit(t('press.panel.undo_move_layer')); } },
            '-', { label: t('press.panel.delete_layer'), disabled: targets(doc, l).length >= doc.layers.length, act: function () { delLayers(targets(doc, l)); } }], e.clientX, e.clientY);
        });
        list.append(row);
      });
      body.append(list);
      foot.append(h('span', { class: 'count' }, t('press.panel.layers_n', { n: doc.layers.length })),
        UI.footBtn('plus', t('press.panel.new_layer'), function () { var nl = L.add(doc); L.active = nl.id; H.commit(t('press.panel.new_layer')); }),
        UI.footBtn('up', t('press.panel.move_layer_up'), function () { var i = L.index(doc, L.active); if (i < doc.layers.length - 1) { L.move(doc, i, i + 1); H.commit(t('press.panel.undo_move_layer')); } }),
        UI.footBtn('down', t('press.panel.move_layer_down'), function () { var i = L.index(doc, L.active); if (i > 0) { L.move(doc, i, i - 1); H.commit(t('press.panel.undo_move_layer')); } }),
        UI.footBtn('trash', t('press.panel.delete_layer_tip'), function () { delLayers(picked(doc).map(function (id) { return M.findLayer(doc, id); })); }));
    }
  });
  /** The picked layer ids (the active layer always among them). */
  function picked(doc) {
    var ids = (L.picked || []).filter(function (id) { return M.findLayer(doc, id); });
    if (ids.indexOf(L.active) < 0) ids.push(L.active);
    return ids;
  }
  /** The layers a row's eye, lock or delete acts on: every picked layer when the row is one of them, else the row's own. */
  function targets(doc, l) {
    var ids = picked(doc);
    return ids.length > 1 && ids.indexOf(l.id) >= 0 ? ids.map(function (id) { return M.findLayer(doc, id); }) : [l];
  }
  function pickRow(doc, id, e) {
    var shown = doc.layers.slice().reverse().map(function (x) { return x.id; }), cur = picked(doc), tog = e.ctrlKey || e.metaKey;
    var a = shown.indexOf(L.anchor); if (a < 0) a = shown.indexOf(L.active);
    if (e.shiftKey && a >= 0) {
      var b = shown.indexOf(id), range = shown.slice(Math.min(a, b), Math.max(a, b) + 1);
      L.picked = tog ? cur.concat(range.filter(function (x) { return cur.indexOf(x) < 0; })) : range; L.active = id;
    } else if (tog) {
      var i = cur.indexOf(id);
      if (i < 0) { cur.push(id); L.active = id; } else if (cur.length > 1) { cur.splice(i, 1); if (L.active === id) L.active = cur[cur.length - 1]; }
      L.picked = cur; L.anchor = id;
    } else { L.picked = [id]; L.active = id; L.anchor = id; }
    UI.refreshPanels('layers');
  }
  /** Deletes the layers and their items, after asking when any has items. At least one layer stays. */
  function delLayers(ls) {
    var doc = S.doc;
    ls = ls.filter(Boolean); if (!ls.length || ls.length >= doc.layers.length) return;
    var n = ls.reduce(function (s2, l) { return s2 + count(doc, l.id); }, 0);
    var go = function () {
      var ok = false; ls.forEach(function (l) { if (L.remove(doc, l.id)) ok = true; });
      if (ok) { L.active = doc.layers[doc.layers.length - 1].id; L.picked = [L.active]; S.sel = []; H.commit(t('press.panel.delete_layer_tip')); }
    };
    if (!n) return go();
    var names = ls.map(function (l) { return l.name; }).join('”, “');
    window.SlopUI.confirm(t('press.panel.delete_layer'), t('press.panel.delete_layer_q', { name: names, n: n }), t('ui.delete'), { danger: true }).then(function (ok) { if (ok) go(); });
  }
  var soon = U.debounce(function () { UI.refreshPanels('layers'); }, 120);
  PR.on('commit', soon); PR.on('doc', soon); PR.on('select', soon);
})();
