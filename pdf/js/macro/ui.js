/* Slop PDF macros — the dialogs: open() creates and edits macros (with a test run on a PDF), and runFor(file) runs
   the macro whose file name rule matches a dropped PDF, asking first when the rule says so. Uses SlopUI. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  var UI = M.ui = M.ui || {};
  var S = function () { return window.SlopUI; };
  function tr(k, en, v) { return M.tr ? M.tr(k, en, v) : en; }
  function el(tag, attrs) { return S().el.apply(null, [tag, attrs].concat(Array.prototype.slice.call(arguments, 2))); }
  function ensureCss() {
    if (document.getElementById('spm-css')) return;
    var st = el('style', { id: 'spm-css' });
    st.textContent = UI.CSS;
    document.head.append(st);
  }
  function plainCopy(v) { return JSON.parse(JSON.stringify(v)); }
  function baseName(n) { return String(n || 'document').replace(/\.pdf$/i, ''); }
  function slug(n) { return String(n || 'macro').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'macro'; }
  function outputName(file, macro) { return baseName(file) + '-' + slug(macro.name) + '.pdf'; }

  /** The run log as a list: a mark, the step, and what happened. */
  UI.logList = function (log) {
    return el('ol', { class: 'spm-log' }, (log || []).map(function (l) {
      var cls = !l.ok ? 'spm-err' : l.warn ? 'spm-warn' : 'spm-ok';
      var mark = !l.ok ? '✕' : l.warn ? '!' : '✓';
      return el('li', { class: cls },
        el('span', { class: 'spm-mark', 'aria-hidden': 'true' }, mark),
        el('span', { class: 'spm-step-name' }, l.step),
        l.message ? el('span', { class: 'spm-msg' }, l.message) : null);
    }));
  };
  function logHasTrouble(log) { return (log || []).some(function (l) { return !l.ok || l.warn; }); }

  function download(bytes, name) {
    S().download(new Blob([bytes], { type: 'application/pdf' }), name);
  }

  /**
   * open(opts): the macro editor. opts.current() → Promise<{ name, bytes } | null> gives the open PDF for a test run;
   * without it the test run asks for a PDF. opts.onSaved(list) is called after a save.
   */
  M.open = function (opts) {
    opts = opts || {};
    ensureCss();
    var list = M.load(), draft = null, testResult = null;
    var problems = el('ul', { class: 'spm-problems', role: 'alert' });
    var nameIn = el('input', { class: 'sui-input', type: 'text', maxlength: 80, placeholder: tr('pdf.macro.name_ph', 'Macro name'), 'aria-label': tr('pdf.macro.name_ph', 'Macro name') });
    var patIn = el('input', { class: 'sui-input', type: 'text', placeholder: tr('pdf.macro.pattern_ph', 'invoice-*.pdf  or  /^inv-\\d+/'), 'aria-label': tr('pdf.macro.pattern_aria', 'File name pattern'), autocomplete: 'off', spellcheck: 'false' });
    var autoSel = S().select([['off', tr('pdf.macro.auto_off', 'Only when I run it')], ['ask', tr('pdf.macro.auto_ask', 'Ask me when a matching PDF is dropped')], ['silent', tr('pdf.macro.auto_silent', 'Run by itself when a matching PDF is dropped')]], 'off');
    var pickSel = S().select([['', tr('pdf.macro.new_name', 'New macro')]].concat(list.map(function (m) { return [m.id, m.name]; })), '');
    var stepsBox = el('div', { 'aria-label': tr('pdf.macro.steps', 'Steps') });
    var addSel = S().select(M.TYPE_ORDER.map(function (t) { return [t, M.typeLabel(t)]; }), M.TYPE_ORDER[0]);
    var testLog = el('div', { class: 'spm-testlog', 'aria-live': 'polite' });
    var saveMsg = el('p', { class: 'spm-hint' }, tr('pdf.macro.kept_here', 'Macros are kept in this browser. Nothing is uploaded.'));

    function readMeta() {
      draft.name = nameIn.value.trim() || tr('pdf.macro.untitled', 'Untitled macro');
      draft.pattern = patIn.value.trim();
      draft.auto = autoSel.value;
    }
    function showProblems(list2) {
      problems.replaceChildren.apply(problems, (list2 || []).map(function (p) { return el('li', null, p); }));
    }
    function renderSteps() {
      stepsBox.replaceChildren();
      if (!draft.steps.length) stepsBox.append(el('p', { class: 'spm-hint' }, tr('pdf.macro.no_steps', 'No steps yet. Choose a step below and press Add step.')));
      draft.steps.forEach(function (step, i) {
        stepsBox.append(UI.stepCard(step, i, draft.steps.length, {
          set: function (k, v) { draft.steps[i][k] = v; testResult = null; },
          changeType: function (t) { draft.steps[i] = M.newStep(t); testResult = null; renderSteps(); },
          move: function (d) { var j = i + d; if (j < 0 || j >= draft.steps.length) return; var t = draft.steps[i]; draft.steps[i] = draft.steps[j]; draft.steps[j] = t; renderSteps(); },
          remove: function () { draft.steps.splice(i, 1); testResult = null; renderSteps(); }
        }));
      });
    }
    function setDraft(m) {
      draft = plainCopy(m);
      nameIn.value = draft.name || ''; patIn.value = draft.pattern || ''; autoSel.value = draft.auto || 'off';
      testLog.replaceChildren(); testResult = null; showProblems([]);
      renderSteps();
    }
    pickSel.addEventListener('change', function () {
      var m = list.find(function (x) { return x.id === pickSel.value; });
      setDraft(m || M.newMacro(tr('pdf.macro.new_name', 'New macro')));
    });
    var addBtn = el('button', { type: 'button', class: 'sui-btn', onclick: function () {
      draft.steps.push(M.newStep(addSel.value)); testResult = null; renderSteps();
      var cards = stepsBox.querySelectorAll('.spm-step'); var last = cards[cards.length - 1];
      if (last) { var f = last.querySelector('input, select'); if (f) f.focus({ preventScroll: true }); }
    } }, tr('pdf.macro.add_step', 'Add step'));

    var testBtn = el('button', { type: 'button', class: 'sui-btn' }, opts.current ? tr('pdf.macro.test_open', 'Test on the open PDF') : tr('pdf.macro.test_pick', 'Test on a PDF…'));
    var dlBtn = el('button', { type: 'button', class: 'sui-btn', hidden: true }, tr('pdf.macro.test_download', 'Download test result'));
    async function testRun() {
      readMeta();
      showProblems([]);
      var errs = M.validateMacro(draft);
      if (errs.length) { showProblems(errs); return false; }
      var src = opts.current ? await opts.current() : null;
      if (!src) {
        // the test PDF comes in the one way (shared/intake): a part of its own that hands the file back
        var picked = null;
        window.SlopIntake.register({ id: 'pdf.macro-test', main: false, paste: false, limit: 1, toast: false,
          accept: { types: ['application/pdf'], exts: ['.pdf'], noun: 'pdf.macro.noun_pdf' }, process: function (f) { picked = f; return f.name; } });
        await window.SlopIntake.pick({ to: 'pdf.macro-test', multiple: false });
        if (!picked) return false;
        src = { name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) };
      }
      var r = await M.runMacro(draft, src.bytes, { filename: src.name });
      testLog.replaceChildren(UI.logList(r.log));
      testResult = r.ok ? { bytes: r.bytes, name: outputName(src.name, draft) } : null;
      dlBtn.hidden = !testResult;
      return false;
    }
    testBtn.addEventListener('click', function () { testRun().catch(function (e) { showProblems([e.message || String(e)]); }); });
    dlBtn.addEventListener('click', function () { if (testResult) download(testResult.bytes, testResult.name); });

    var body = el('div', null,
      el('div', { class: 'spm-row' }, S().field(tr('pdf.macro.macro', 'Macro'), pickSel)),
      el('div', { class: 'spm-grid', style: 'margin-top:10px' },
        S().field(tr('pdf.macro.name', 'Name'), nameIn), S().field(tr('pdf.macro.pattern', 'File name pattern (optional)'), patIn),
        el('div', { class: 'spm-wide' }, S().field(tr('pdf.macro.when', 'When a matching PDF is dropped'), autoSel))),
      el('p', { class: 'spm-hint' }, tr('pdf.macro.pattern_hint', 'Patterns use * for any text and ? for one character, or a regular expression between slashes. A pattern must match the whole file name.')),
      el('div', { class: 'spm-sec' }, el('h4', null, tr('pdf.macro.steps', 'Steps'), el('span', { class: 'spm-grow' }), addSel, addBtn), stepsBox),
      el('div', { class: 'spm-sec' }, el('h4', null, tr('pdf.macro.test_run', 'Test run')),
        el('div', { class: 'spm-row' }, testBtn, dlBtn),
        el('p', { class: 'spm-hint' }, tr('pdf.macro.test_hint', 'The test runs the steps on a copy. Your open file is not changed.')),
        testLog),
      problems, saveMsg);

    var exists = function () { return list.some(function (x) { return x.id === draft.id; }); };
    var buttons = [];
    var deleteBtn = { label: tr('ui.delete', 'Delete'), danger: true, act: async function () {
      var ok = await S().confirm(tr('pdf.macro.delete_title', 'Delete this macro?'), tr('pdf.macro.delete_body', '“{name}” will be removed from this browser.', { name: draft.name || tr('pdf.macro.untitled', 'Untitled macro') }), tr('ui.delete', 'Delete'), { danger: true });
      if (!ok) return false;
      list = list.filter(function (x) { return x.id !== draft.id; });
      M.save(list);
      if (opts.onSaved) opts.onSaved(M.load());
      return true;
    } };
    if (list.length) buttons.push(deleteBtn);
    buttons.push({ label: tr('menu.close', 'Close') });
    buttons.push({ label: tr('menu.save', 'Save'), primary: true, act: function () {
      readMeta();
      var errs = M.validateMacro(draft);
      if (errs.length) { showProblems(errs); return false; }
      var i = list.findIndex(function (x) { return x.id === draft.id; });
      if (i < 0) list.push(draft); else list[i] = draft;
      var kept = M.save(list);
      if (!kept) S().toast(tr('pdf.macro.not_kept', 'This browser would not keep the macro. It lasts until this page closes.'), 4000);
      else S().toast(tr('pdf.macro.saved', 'Macro saved.'));
      if (opts.onSaved) opts.onSaved(M.load());
      return true;
    } });
    setDraft(M.newMacro(tr('pdf.macro.new_name', 'New macro')));
    return S().dialog({ title: tr('pdf.macro.title', 'Macros'), body: body, buttons: buttons, cls: 'spm-dlg' });
  };

  /** Asks which of several macros to run on a dropped file. Resolves the chosen macro, or null. */
  function askWhich(name, macros) {
    return new Promise(function (res) {
      var picked = null;
      var buttons = [{ label: tr('pdf.macro.not_now', 'Not now') }].concat(macros.map(function (m, i) {
        return { label: tr('pdf.macro.run_named', 'Run “{name}”', { name: m.name }), primary: i === 0, act: function () { picked = m; } };
      }));
      var text = macros.length === 1 ? tr('pdf.macro.ask_one', 'A macro is set to ask first for files like this one.') : tr('pdf.macro.ask_many', 'More than one macro is set to ask first for files like this one. Choose one to run.');
      S().dialog({ title: tr('pdf.macro.ask_title', 'Run a macro on {name}?', { name: name }), body: text, buttons: buttons, onClose: function () { res(picked); } });
    });
  }

  /**
   * runFor(file, opts): the drop hook. Finds the macro whose file name rule matches the PDF. A rule set to run by
   * itself runs at once; a rule set to ask first asks. opts.onResult({ name, bytes, log, macro, ok }) receives the
   * new PDF; without it the PDF is downloaded. Resolves { ran, reason?, ok, bytes, log, macro, name }.
   */
  M.runFor = async function (file, opts) {
    opts = opts || {};
    ensureCss();
    var name = file.name || 'document.pdf', matches = M.findRules(M.load(), name);
    if (!matches.length) return { ran: false, reason: 'no-rule' };
    var chosen = matches[0].auto === 'silent' ? matches[0] : await askWhich(name, matches);
    if (!chosen) return { ran: false, reason: 'declined' };
    var r = await M.runMacro(chosen, new Uint8Array(await file.arrayBuffer()), { filename: name });
    var result = { ran: true, macro: chosen, name: outputName(name, chosen), ok: r.ok, bytes: r.bytes, log: r.log };
    if (!r.ok || logHasTrouble(r.log)) {
      S().dialog({ title: r.ok ? tr('pdf.macro.ran_warn', '“{name}” ran with warnings', { name: chosen.name }) : tr('pdf.macro.stopped', '“{name}” stopped', { name: chosen.name }), body: UI.logList(r.log), buttons: [{ label: tr('menu.ok', 'OK'), primary: true }] });
    }
    if (!r.ok) return result;
    if (opts.onResult) opts.onResult(result);
    else { download(r.bytes, result.name); S().toast(tr('pdf.macro.ran', 'Ran “{name}” on {file}.', { name: chosen.name, file: name })); }
    return result;
  };
})();
