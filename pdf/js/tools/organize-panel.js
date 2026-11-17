/* Slop PDF — Organize panel: files list, selection actions, insert blank / from file, ordering, merge notes, keys. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, P = SP.panels, PANELS = P.PANELS, K = P.helpers;
  var t = U.t, section = K.section, row = K.row, btn = K.btn, seg = K.seg, select = K.select, num = K.num, text = K.text, slider = K.slider, colorPicker = K.colorPicker, check = K.check, note = K.note, needPages = K.needPages, onRefresh = K.onRefresh;
  /* ---------------------------------------------------------- organize */
  PANELS.organize = {
    get title() { return t('pdf.tool.organize.title'); }, icon: 'organize', build: function (b) {
      var files = h('div', { class: 'file-list' }), pwNote = h('div', { class: 'pw-notice', role: 'status', hidden: true });
      b.appendChild(section(t('pdf.tool.organize.files'), [files, pwNote, h('div', { class: 'btn-row' }, btn(t('pdf.tool.organize.add_files'), 'plus', function () { SP.app.openDialog(); }, 'wide'))]));
      onRefresh(function () {
        // a file that had a password (pdfjs.js f.security): downloads have none unless one is added (ui/protect.js)
        var A = SP.app, had = A.hadPassword && A.hadPassword();
        pwNote.innerHTML = ''; pwNote.hidden = !had;
        if (had) pwNote.append(h('b', null, t('pdf.tool.organize.pw_had')), note(' ' + t('pdf.tool.organize.pw_note')),
          h('div', { class: 'btn-row' }, btn(t('pdf.tool.organize.pw_remove'), 'download', function () { A.download(); }, 'pw-remove', t('pdf.tool.organize.pw_remove_tip')),
            btn(t('pdf.tool.organize.pw_keep'), 'lock', function () { A.protect(A.protectPreset(had.security)); }, 'pw-keep', t('pdf.tool.organize.pw_keep_tip'))));
        files.innerHTML = '';
        var counts = {};
        E.state.pages.forEach(function (p) { if (p.f) counts[p.f] = (counts[p.f] || 0) + 1; });
        if (!E.files.size) files.appendChild(note(t('pdf.tool.organize.no_files')));
        E.files.forEach(function (f) {
          var n = counts[f.id] || 0;
          files.appendChild(h('div', { class: 'file-item' + (n ? '' : ' unused') },
            h('span', { class: 'fdot', style: { '--fc': f.color } }),
            h('span', { class: 'fi-name', title: f.name }, f.name),
            h('span', { class: 'fi-meta' }, t('pdf.tool.organize.file_pages', { n: n, total: f.numPages }) + (f.decrypted ? ' · ' + t('pdf.tool.organize.file_had_pw') : '') + (f.locked ? ' · ' + t('pdf.tool.organize.file_locked') : '')),
            h('button', { type: 'button', class: 'ib', title: t('pdf.tool.organize.select_file_tip'), 'aria-label': t('pdf.tool.organize.select_file_aria', { name: f.name }), html: U.icon('selectall'), onclick: function () { SP.organizer.setSelection(E.state.pages.filter(function (p) { return p.f === f.id; }).map(function (p) { return p.id; })); } }),
            h('button', { type: 'button', class: 'ib', title: t(n ? 'pdf.tool.organize.remove_file_tip' : 'pdf.tool.organize.readd_file_tip'), 'aria-label': t(n ? 'pdf.tool.organize.remove_file_aria' : 'pdf.tool.organize.readd_file_aria', { name: f.name }), html: U.icon(n ? 'trash' : 'plus'), onclick: function () {
              if (n) SP.app.remove(E.state.pages.filter(function (p) { return p.f === f.id; }).map(function (p) { return p.id; }));
              else E.commit(t('pdf.tool.organize.undo_add_file', { name: f.name }), function (st) { st.pages = st.pages.concat(E.pagesForFile(f)); });
            } })));
        });
      });
      var selInfo = h('p', { class: 'pp-note sel-info' });
      b.appendChild(section(t('pdf.tool.organize.selection'), [selInfo, h('div', { class: 'btn-grid' },
        btn(t('pdf.tool.organize.rotate_left'), 'rotl', function () { SP.app.rotate(SP.app.targetIds(), -90); }),
        btn(t('pdf.tool.organize.rotate_right'), 'rotr', function () { SP.app.rotate(SP.app.targetIds(), 90); }),
        btn(t('ui.duplicate'), 'copy', function () { SP.app.duplicate(SP.app.targetIds()); }),
        btn(t('ui.delete'), 'trash', function () { var ids = SP.app.targetIds(); SlopUI.confirm(t('pdf.tool.organize.delete_pages_title'), t('pdf.tool.organize.delete_pages_msg', { n: ids.length }), t('ui.delete'), { danger: true }).then(function (ok) { if (ok) SP.app.remove(ids); }); }, 'danger-text'),
        btn(t('pdf.tool.organize.extract'), 'extract', function () { SP.app.extract(); }),
        btn(t('ui.select_all'), 'selectall', function () { SP.organizer.selectAll(); }))]));
      onRefresh(function () {
        var n = SP.organizer.sel.size, total = E.state.pages.length;
        selInfo.textContent = n ? t('pdf.tool.organize.sel_info', { n: n, total: total, pages: U.describeIdx(SP.organizer.selectedIndices()) }) : t('pdf.tool.organize.sel_none', { n: total });
      });
      var ins = SP.app.insertOpts;
      b.appendChild(section(t('pdf.tool.organize.insert'), [
        row(t('pdf.tool.organize.page_size'), seg([['a4', 'A4'], ['letter', t('pdf.tool.organize.size_letter')], ['same', t('pdf.tool.organize.size_same'), t('pdf.tool.organize.size_same_tip')]], ins.size, function (v) { ins.size = v; }, t('pdf.tool.organize.blank_size_aria'))),
        row(t('pdf.tool.organize.orientation'), seg([['portrait', t('pdf.tool.organize.portrait')], ['landscape', t('pdf.tool.organize.landscape')]], ins.orient, function (v) { ins.orient = v; }, t('pdf.tool.organize.orientation'))),
        row(t('pdf.tool.organize.position'), select([['after', t('pdf.tool.organize.pos_after')], ['before', t('pdf.tool.organize.pos_before')], ['start', t('pdf.tool.organize.pos_start')], ['end', t('pdf.tool.organize.pos_end')]], ins.where, function (v) { ins.where = v; })),
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.organize.blank_page'), 'blank', function () { SP.app.insertBlank(); }), btn(t('pdf.tool.organize.from_file'), 'insert', function () { SP.app.insertFromFile(); }))]));
      var sortSel = 'collate';
      b.appendChild(section(t('pdf.tool.organize.order'), [
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.organize.reverse'), 'reverse', function () { SP.app.reverse(); })),
        row(t('pdf.tool.organize.sort'), select([['collate', t('pdf.tool.organize.sort_collate')], ['collate-same', t('pdf.tool.organize.sort_collate_same')], ['odd-even', t('pdf.tool.organize.sort_odd_even')], ['even-odd', t('pdf.tool.organize.sort_even_odd')], ['source', t('pdf.tool.organize.sort_source')]], sortSel, function (v) { sortSel = v; })),
        h('div', { class: 'btn-row' }, btn(t('pdf.tool.organize.apply_sort'), 'sort', function () { SP.app.sort(sortSel); })),
        note(t('pdf.tool.organize.collate_note'))]));
      b.appendChild(section(t('pdf.tool.organize.merge'), [note(t('pdf.tool.organize.merge_note'))]));
      b.appendChild(section(t('pdf.tool.organize.keyboard'), [h('dl', { class: 'keys' },
        h('dt', null, '← → ↑ ↓'), h('dd', null, t('pdf.tool.organize.key_move_focus')),
        h('dt', null, t('pdf.tool.organize.key_alt_arrows')), h('dd', null, t('pdf.tool.organize.key_move_pages')),
        h('dt', null, t('pdf.tool.organize.key_space')), h('dd', null, t('pdf.tool.organize.key_toggle')),
        h('dt', null, 'R / Shift+R'), h('dd', null, t('pdf.tool.organize.key_rotate')),
        h('dt', null, 'Del'), h('dd', null, t('pdf.tool.organize.key_delete')),   // i18n-ignore
        h('dt', null, 'Enter'), h('dd', null, t('pdf.tool.organize.key_open')),
        h('dt', null, 'Ctrl/⌘ Z, Shift Z'), h('dd', null, t('pdf.tool.organize.key_undo')))], { cls: 'pp-keys' }));   // i18n-ignore
    }
  };

  /* -------------------------------------------------------------- edit */
})();
