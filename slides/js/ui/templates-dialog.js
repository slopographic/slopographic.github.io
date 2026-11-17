/* Slop Slides: the template dialogs. "New from template" lists the starter templates and "My templates" (each with a
   preview of its first slide, Export and Delete), and imports a .sslide-template from a file or from Slop Drive.
   "Save as template" keeps the whole deck or the current slide. An import is validated first: a bad file shows the
   reason in a SlopUI dialog and changes nothing. Exposes window.SS.templatesUI. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, D = SS.dom, TF = SS.templateFile, S = SS.templateStore, U = SS.util;
  var TU = SS.templatesUI = {};
  var el = function () { return SlopUI.el.apply(null, arguments); };
  var previews = {};   // starter template id -> preview data URL (built once per page)
  function toast(msg, ms) { if (window.SlopUI) SlopUI.toast(msg, ms); else D.toast(msg, ms); }

  function starterPreview(t) {
    if (!(t.id in previews)) { try { previews[t.id] = TF.preview(t.build()); } catch (e) { previews[t.id] = null; } }
    return previews[t.id];
  }
  function card(name, sub, preview, pick, acts) {
    return el('div', { class: 'tpl-card' },
      el('button', { type: 'button', class: 'tpl-pick', onclick: pick, title: SU.t('slides.tpl.new_from', { name: name }) },
        preview ? el('img', { class: 'tpl-img', src: preview, alt: SU.t('slides.tpl.first_slide', { name: name }) }) : el('span', { class: 'tpl-img tpl-none' }),
        el('span', { class: 'tpl-name' }, name),
        el('span', { class: 'tpl-sub' }, sub)),
      acts ? el('div', { class: 'tpl-acts' }, acts) : null);
  }
  function fillBody(body, dlg, onChange) {
    body.replaceChildren();
    body.append(el('h3', { class: 'tpl-h' }, SU.t('slides.tpl.starter_templates')),
      el('div', { class: 'tpl-grid' }, SS.templates.list.map(function (t) {
        return card(t.name, SU.t('slides.tpl.starter'), starterPreview(t), function () { dlg.close(true); SS.files.fromTemplate(t.id); });
      })));
    var mine = el('div', { class: 'tpl-mine' }, el('h3', { class: 'tpl-h' }, SU.t('slides.tpl.my_templates')));
    body.append(mine);
    S.list().then(function (recs) {
      if (!recs.length) { mine.append(el('p', { class: 'tpl-note' }, SU.t('slides.tpl.none_yet_use_file_save_as_template_to_ke'))); return; }
      mine.append(el('div', { class: 'tpl-grid' }, recs.map(function (r) {
        var acts = [
          el('button', { type: 'button', class: 'sui-btn', onclick: function () { TU.exportFile(r); } }, SU.t('slides.tpl.export')),
          el('button', { type: 'button', class: 'sui-btn sui-danger', onclick: async function () {
            var ok = await SlopUI.confirm(SU.t('slides.tpl.delete_title', { name: r.name }), SU.t('slides.tpl.delete_msg'), SU.t('ui.delete'), { danger: true });
            if (ok) { await S.remove(r.id); toast(SU.t('slides.tpl.template_deleted')); onChange(); }
          } }, SU.t('ui.delete'))];
        return card(r.name, SU.t('slides.tpl.n_slides', { n: r.slides }), r.preview, function () { dlg.close(true); SS.files.fromStored(r); }, acts);
      })));
    });
  }

  /** The "New from template" dialog. */
  TU.openNew = function () {
    var body = el('div', { class: 'tpl-body' });
    var dlg = SlopUI.dialog({ title: SU.t('slides.tpl.new_from_template'), cls: 'tpl-dlg', body: body, buttons: [
      { label: SU.t('slides.tpl.import_file'), act: async function () { var rec = await TU.importFile(); if (rec) fillBody(body, dlg, render); return false; } },
      { label: SU.t('slides.tpl.import_from_slop_drive'), act: async function () { var rec = await TU.importDrive(); if (rec) fillBody(body, dlg, render); return false; } },
      { label: SU.t('menu.close'), primary: true }] });
    function render() { fillBody(body, dlg, render); }
    fillBody(body, dlg, render);
    return dlg;
  };

  /** The "Save as template" dialog: a name, and the whole presentation or only the current slide. */
  TU.openSave = function () {
    if (!A.deck) return null;
    var name = el('input', { class: 'sui-input', type: 'text', value: A.deck.title, maxlength: 80, 'aria-label': SU.t('slides.tpl.template_name') });
    var scope = SlopUI.select([['deck', SU.t('slides.tpl.whole', { n: A.deck.slides.length })],
      ['slide', SU.t('slides.tpl.current', { i: String(A.idx + 1) })]], 'deck');
    var body = el('div', { class: 'tpl-save' }, SlopUI.field(SU.t('slides.tpl.name'), name), SlopUI.field(SU.t('slides.tpl.keep'), scope));
    return SlopUI.dialog({ title: SU.t('slides.tpl.save_as_template'), body: body, buttons: [{ label: SU.t('menu.cancel') }, { label: SU.t('slides.tpl.save_template'), primary: true, act: async function () {
      var n = name.value.trim();
      if (!n) { name.focus(); return false; }
      try { await TU.saveTemplate({ name: n, slideIndex: scope.value === 'slide' ? A.idx : null }); }
      catch (e) { SlopUI.alert(SU.t('slides.tpl.not_saved'), e.message); return false; }
    } }] });
  };

  /** Keeps the current deck (or one slide) as a template. Validated the same way an import is. Resolves with the record. */
  TU.saveTemplate = async function (opts) {
    var file = TF.fromDeck(A.deck, opts);
    var checked = TF.parse(TF.toText(file));   // the file must pass the import check before it is kept
    var rec = await S.add(TF.wrap(checked.name, checked.deck), TF.preview(checked.deck));
    toast(rec.driveError ? SU.t('slides.tpl.saved_local') : SU.t('slides.tpl.saved', { name: rec.name }), 3600);
    return rec;
  };

  /** A record as file text (the same envelope the import reads). */
  TU.exportText = function (rec) { var f = TF.wrap(rec.name, rec.deck); f.created = rec.created; return TF.toText(f); };
  TU.exportFile = function (rec) {
    U.download(new Blob([TU.exportText(rec)], { type: TF.MIME }), TF.fileName(rec.name));
    toast(SU.t('slides.tpl.downloaded', { name: TF.fileName(rec.name) }));
  };

  /**
   * Validates template text and keeps it in My templates. On failure shows the reason in a dialog and changes nothing
   * (nothing is written before the check passes). Resolves with the new record, or null.
   */
  TU.importText = async function (text) {
    var parsed;
    try { parsed = TF.parse(text); }
    catch (e) { SlopUI.alert(SU.t('slides.tpl.not_added'), e.message); return null; }
    try {
      var rec = await S.add(TF.wrap(parsed.name, parsed.deck), TF.preview(parsed.deck));
      toast(rec.driveError ? SU.t('slides.tpl.added_local', { name: rec.name }) : SU.t('slides.tpl.added', { name: rec.name }), 3600);
      return rec;
    } catch (e) { SlopUI.alert(SU.t('slides.tpl.not_added2'), e.message); return null; }
  };
  /** Picks a .sslide-template file from this computer, or from Slop Drive, and imports it: the intake's part
   *  'slides.template' (file-drop.js), whose reader is importText. */
  TU.importFile = function () { return SS.fileDrop.importTemplate(); };
  TU.importDrive = function () { return SS.fileDrop.importTemplateDrive(); };
})();
