/* Slop PDF — Edit page and Sign panels: tool palette and annotation properties. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  var t = U.t, section = K.section, row = K.row, btn = K.btn, seg = K.seg, select = K.select, num = K.num, text = K.text, slider = K.slider, colorPicker = K.colorPicker, check = K.check, note = K.note, needPages = K.needPages, onRefresh = K.onRefresh;
  PANELS.edit = {
    get title() { return t('pdf.tool.edit.title'); }, icon: 'edit', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      var tools = h('div', { class: 'tool-grid', role: 'toolbar', 'aria-label': t('pdf.tool.edit.tools_aria') });
      SP.editor.TOOLS.forEach(function (tl) {
        var name = toolName(tl);
        var bt = h('button', { type: 'button', class: 'tool-b', 'data-tool': tl[0], title: name + ' (' + tl[3] + ')', html: U.icon(tl[2]) + '<span>' + U.esc(name.split(' (')[0]) + '</span>' });
        bt.addEventListener('click', function () { SP.editor.setTool(tl[0]); });
        tools.appendChild(bt);
      });
      b.appendChild(section(t('pdf.tool.edit.tools'), [tools]));
      var props = h('div', { class: 'props-box' });
      b.appendChild(props);
      var pageSec = h('div');
      b.appendChild(pageSec);
      var lastKey = null;
      onRefresh(function (reason) {
        U.$$('.tool-b', tools).forEach(function (x) { x.classList.toggle('on', x.dataset.tool === SP.editor.tool); });
        var a = SP.editor.getSelected(), type = a ? a.type : SP.editor.tool;
        var key = (a ? a.id + ':' + a.type : 'tool:' + type) + ':' + SP.editor.pid + (SP.selPanel ? ':' + SP.selPanel.key() : '');
        if (key !== lastKey || reason === 'history') { lastKey = key; buildProps(props, a, type); }
        var p = SP.editor.page();
        pageSec.innerHTML = '';
        if (p) {
          var n = p.annots.length;
          pageSec.appendChild(section(t('pdf.tool.edit.this_page'), [note(t('pdf.tool.edit.page_info', { page: String(E.indexOf(p.id) + 1), total: E.state.pages.length, annots: n ? t('pdf.tool.edit.annots_n', { n: n }) : t('pdf.tool.edit.annots_none') })),
            n ? h('div', { class: 'btn-row' }, btn(t('pdf.tool.edit.clear_annots'), 'trash', function () { SlopUI.confirm(t('pdf.tool.edit.clear_title'), t('pdf.tool.edit.clear_msg'), t('pdf.tool.edit.clear'), { danger: true }).then(function (ok) { if (ok) E.commit(t('pdf.tool.edit.undo_clear'), function (st) { st.pages.forEach(function (x) { if (x.id === p.id) x.annots = []; }); }); }); }, 'danger-text')) : null]));
        }
      });
    }
  };
  /** The font row: every family the shared picker knows (the standard three, bundled, downloaded and the person's own), with
   *  Get more and Fonts…, and a sample line in the chosen family. Falls back to the standard three without the picker. A family
   *  with no copy the PDF can embed is still listed and shown on screen, but its new text is saved in Helvetica: a note says so. */
  var STANDARD_FONTS = [['Helvetica', 'pdf.tool.edit.font_sans'], ['Times', 'pdf.tool.edit.font_serif'], ['Courier', 'pdf.tool.edit.font_mono']];   // [family, label key]
  function standardFonts() { return STANDARD_FONTS.map(function (f) { return [f[0], t(f[1], { font: f[0] })]; }); }
  /** The tool's name: a key per tool id here (editor/view.js keeps the English name and the shortcut in Ed.TOOLS). */
  function toolName(tl) { var k = 'pdf.tool.edit.tool_' + tl[0], v = t(k); return v === k ? tl[1] : v; }
  function fontPicker(value, onPick) {
    var sel = h('select', { class: 'inp', 'aria-label': t('pdf.tool.edit.font') });
    var tell = h('div', { class: 'note font-tell', role: 'status' });
    var wrap = h('div', { class: 'font-pick' }, sel, tell);
    function saveCheck(f) {
      tell.textContent = '';
      if (!window.SlopFonts || !f || STANDARD_FONTS.some(function (s) { return s[0] === f; })) return;
      SlopFonts.ready().then(function () { return SlopFontCatalog.pickFace(f, 400, false); }).then(function (face) {
        if (sel.value === f && !face) tell.textContent = t('pdf.tool.edit.font_not_embedded', { font: f });
      }, function () { /* the catalogue is not there: nothing to say */ });
    }
    if (window.SlopFonts) {
      SlopFonts.attach(sel, { value: value, legacy: standardFonts(), preview: true, onPick: function (f) { saveCheck(f); onPick(f); } });
      saveCheck(sel.value);
    } else {
      standardFonts().forEach(function (f) { sel.append(h('option', { value: f[0] }, f[1])); });
      sel.value = value || 'Helvetica';
      sel.addEventListener('change', function () { onPick(sel.value); });
    }
    return wrap;
  }
  function buildProps(box, a, type) {
    box.innerHTML = '';
    var Ed = SP.editor, d = a || Ed.defaults[type] || {};
    var set = function (k) { return function (v) { Ed.setProp(k, v); }; };
    var kids = [];
    if (SP.selPanel && SP.selPanel.build(box, a)) return; // a block of the page's text, or a page picture (sel-panel.js)
    if (type === 'select' && !a) { box.appendChild(section(t('pdf.tool.edit.selection'), [note(t('pdf.se.select_help'))])); return; }
    if (type === 'text' || type === 'callout') {
      kids.push(row(t('pdf.tool.edit.font'), fontPicker(d.font, set('font'))));
      kids.push(row(t('pdf.tool.edit.size'), num(d.size || 16, 4, 400, 1, set('size')), 'pt'));
      kids.push(h('div', { class: 'btn-row' },
        toggle(t('pdf.tool.edit.bold_short'), t('pdf.tool.edit.bold'), d.bold, set('bold'), 'bold'), toggle(t('pdf.tool.edit.italic_short'), t('pdf.tool.edit.italic'), d.italic, set('italic'), 'italic')));
      kids.push(row(t('pdf.tool.edit.colour'), colorPicker(d.color, set('color'))));
    }
    if (/^(pen|marker|line|arrow|rect|ellipse)$/.test(type)) {
      kids.push(row(t(type === 'rect' || type === 'ellipse' ? 'pdf.tool.edit.stroke' : 'pdf.tool.edit.colour'), colorPicker(d.color, set('color'), type === 'rect' || type === 'ellipse')));
      kids.push(row(t('pdf.tool.edit.width'), slider(d.width || 2, 0.5, type === 'marker' ? 40 : 20, 0.5, set('width'), function (v) { return v + ' pt'; })));
    }
    if (type === 'rect' || type === 'ellipse') kids.push(row(t('pdf.tool.edit.fill'), colorPicker(d.fill || 'none', set('fill'), true)));
    if (type === 'texthl' || type === 'para') kids.push(row(t('pdf.tool.edit.colour'), colorPicker(d.color, set('color'))));
    if (type === 'step') {
      kids.push(row(t('pdf.tool.edit.circle'), colorPicker(d.fill, set('fill'))));
      kids.push(row(t('pdf.tool.edit.comment'), colorPicker(d.color, set('color'))));
      kids.push(row(t('pdf.tool.edit.size'), slider(d.size || 28, 16, 64, 1, set('size'), function (v) { return v + ' pt'; })));
    }
    if (type === 'callout') {
      kids.push(row(t('pdf.tool.edit.border'), slider(d.borderW == null ? 1.2 : d.borderW, 0, 8, 0.2, set('borderW'), function (v) { return v + ' pt'; })));
      kids.push(row(t('pdf.tool.edit.border_colour'), colorPicker(d.borderC, set('borderC'))));
    }
    if (type === 'note') { box.appendChild(a ? noteSection(a) : section(t('pdf.tool.edit.new_comment'), [note(t('pdf.tool.edit.new_comment_help'))])); return; }
    if (type === 'whiteout' || type === 'hlbox') kids.push(row(t(type === 'whiteout' ? 'pdf.tool.edit.cover_colour' : 'pdf.tool.edit.colour'), colorPicker(d.fill, set('fill'))));
    if (type === 'redact') { box.appendChild(section(t(a ? 'pdf.tool.edit.redact_selected' : 'pdf.tool.edit.redact_new'), [note(t('pdf.tool.edit.redact_help'), 'warn'), h('div', { class: 'btn-row' }, btn(t('pdf.tool.edit.open_redact'), 'redact', function () { SP.app.setTool('redact'); }), a ? btn(t('ui.delete'), 'trash', function () { Ed.deleteSelected(); }, 'danger-text') : null)])); return; }
    if (type !== 'whiteout') kids.push(row(t('pdf.tool.edit.opacity'), slider(Math.round((d.opacity == null ? 1 : d.opacity) * 100), 5, 100, 1, function (v) { Ed.setProp('opacity', v / 100); }, function (v) { return v + '%'; })));
    if (type === 'whiteout') kids.push(note(t('pdf.tool.edit.whiteout_warn'), 'warn'));
    var names = { text: 'pdf.tool.edit.name_text', pen: 'pdf.tool.edit.name_pen', marker: 'pdf.tool.edit.name_marker', rect: 'pdf.tool.edit.name_rect', ellipse: 'pdf.tool.edit.name_ellipse', line: 'pdf.tool.edit.name_line', arrow: 'pdf.tool.edit.name_arrow', whiteout: 'pdf.tool.edit.name_whiteout', hlbox: 'pdf.tool.edit.name_hlbox', texthl: 'pdf.tool.edit.name_texthl', para: 'pdf.tool.edit.name_para', image: a && a.sig ? 'pdf.tool.edit.name_signature' : 'pdf.tool.edit.name_image' };
    var nm = names[type] ? t(names[type]) : type;
    box.appendChild(section(t(a ? 'pdf.tool.edit.heading_selected' : 'pdf.tool.edit.heading_new', { name: nm }), kids));
    if (a) {
      box.appendChild(section(null, [h('div', { class: 'btn-grid' },
        a.type === 'text' || a.type === 'callout' || a.type === 'step' || a.type === 'para' ? btn(t('pdf.tool.edit.edit_text'), 'text', function () { Ed.editSelectedText(); }) : null,
        btn(t('ui.duplicate'), 'copy', function () { Ed.duplicateSelected(); }),
        btn(t('pdf.tool.edit.bring_front'), 'plus', function () { zorder(a.id, 1); }),
        btn(t('pdf.tool.edit.send_back'), 'reverse', function () { zorder(a.id, -1); }),
        btn(t('ui.delete'), 'trash', function () { Ed.deleteSelected(); }, 'danger-text'))]));
      var g = SP.selPanel && SP.selPanel.geometry(a); if (g) box.appendChild(g); // position, size, rotation (sel-panel.js)
    }
  }
  /** A selected comment: who wrote it, how many replies, and the actions (the thread itself is the popup). */
  function noteSection(a) {
    var n = (a.replies || []).length;
    var info = (a.author || t('pdf.tool.edit.unnamed')) + ' · ' + (n ? t('pdf.tool.edit.replies_n', { n: n }) : t('pdf.tool.edit.replies_none')) + (a.resolved ? ' · ' + t('pdf.tool.edit.resolved') : '');
    return section(t(a ? 'pdf.tool.edit.comment_selected' : 'pdf.tool.edit.comment'), [note(t('pdf.tool.edit.comment_info', { info: info })),
      h('div', { class: 'btn-grid' },
        btn(t('pdf.tool.edit.open_thread'), 'comments', function () { Ed.noteUI.open(a.id); }),
        btn(t(a.resolved ? 'pdf.tool.edit.reopen' : 'pdf.tool.edit.resolve'), 'check', function () { Ed.setNoteResolved(a.id, !a.resolved); }),
        btn(t('ui.delete'), 'trash', function () { Ed.deleteNote(a.id); }, 'danger-text'))]);
  }
  function zorder(id, dir) {
    var pid = SP.editor.pid;
    E.commit(t(dir > 0 ? 'pdf.tool.edit.bring_front' : 'pdf.tool.edit.send_back'), function (st) {
      st.pages.forEach(function (p) { if (p.id !== pid) return; var a = p.annots.filter(function (x) { return x.id === id; })[0]; if (!a) return; p.annots = p.annots.filter(function (x) { return x.id !== id; }); if (dir > 0) p.annots.push(a); else p.annots.unshift(a); });
    });
  }
  function toggle(label, title, on, onChange, cls) {
    var b = h('button', { type: 'button', class: 'tog ' + (cls || '') + (on ? ' on' : ''), title: title, 'aria-pressed': on ? 'true' : 'false' }, label);
    b.addEventListener('click', function () { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); onChange(on); });
    return b;
  }

  /* -------------------------------------------------------------- sign */
  PANELS.sign = {
    get title() { return t('pdf.tool.sign.title'); }, icon: 'sign', build: function (b) {
      var np = needPages(); if (np) { b.appendChild(np); return; }
      b.appendChild(section(null, [note(t('pdf.tool.sign.intro')),
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.sign.create'), 'sign', function () { SP.app.ensurePage(); SP.editor.setTool('signature'); }, 'primary wide'))]));
      var list = h('div', { class: 'sig-list' });
      b.appendChild(section(t('pdf.tool.sign.saved'), [list]));
      function paint() {
        list.innerHTML = '';
        var saved = SP.sign.saved();
        if (!saved.length) { list.appendChild(note(t('pdf.tool.sign.none'))); return; }
        saved.forEach(function (sig) {
          list.appendChild(h('button', { type: 'button', class: 'sig-item', title: t('pdf.tool.sign.place_tip'), onclick: function () { SP.app.ensurePage(); SP.editor.placeImage(SP.sign.toAsset(sig), t('pdf.tool.sign.undo_add')); } }, h('img', { src: sig.url, alt: t('pdf.tool.sign.saved_alt') })));
        });
        list.appendChild(h('div', { class: 'btn-row' }, btn(t('pdf.tool.sign.clear_saved'), 'trash', function () {
          SlopUI.confirm(t('pdf.tool.sign.clear_saved'), t('pdf.tool.sign.clear_saved_msg'), t('pdf.tool.edit.clear'), { danger: true }).then(function (ok) { if (ok) { SP.sign.clear(); paint(); SlopUI.toast(t('pdf.tool.sign.cleared')); } });
        }, 'danger-text')));
      }
      paint();
      b.appendChild(section(t('pdf.tool.sign.tips'), [note(t('pdf.tool.sign.tips_note'))]));
    }
  };

  /* ------------------------------------------------------ page numbers */
})();
