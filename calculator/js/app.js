/* Slopculator page: the expression line, the live result, the paper tape, copy and save to Slop Drive.
 * Classic script, loaded after the pure modules, keep.js, rates.js and panels.js. Exposes window.SlopCalcApp
 * (used by commands.js). Every evaluation goes through evaluate(), which fetches a missing exchange rate and tries again. */
(function () {
  'use strict';
  const C = window.SlopCalc, K = window.SlopCalcKeep, R = window.SlopCalcRates, P = window.SlopCalcPanels;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const HIST_KEY = 'slopcalc.history', HIST_MAX = 200, TAPE_MAX = 300;
  const VARS_KEY = 'slopcalc.vars';
  const S = { ans: null, tape: [], history: K.read(HIST_KEY, []), vars: K.read(VARS_KEY, {}), recall: -1, seq: 0, last: null, timer: 0 };
  let el = null; // filled in boot(): this script runs in the <head>, before the page's elements exist
  const today = () => C.dates.localIso();

  function setStatus(msg) { el.status.textContent = msg; }
  function toast(msg) { if (window.SlopUI && SlopUI.toast) SlopUI.toast(msg); else setStatus(msg); }

  /** The result of a run of statements in the shape the page shows: { ok, value, text } or { ok:false, error }. The text is
   *  the value alone: the line itself already says "price = 19.99", so the tape reads "price = 19.99 = 19.99" at most once
   *  per name, never "price = 19.99 = price = 19.99". */
  function resultOf(p) {
    const failed = p.steps.find((s) => !s.ok), done = p.steps.filter((s) => s.ok);
    if (failed) return { ok: false, error: failed.error };
    return { ok: true, value: p.value, text: done.length ? done[done.length - 1].result : '' };
  }
  /** Runs a line (one or more statements separated by ;). A preview works on a copy of the variables; Calculate keeps
   *  the names it sets. A currency pair with no rate yet is fetched from Slop Ledger, then the line runs again. */
  async function evaluate(src, commit) {
    let p = null;
    for (let i = 0; i < 6; i++) {
      p = C.program(src, { ans: S.ans, rate: R.factor, today: today(), vars: commit ? S.vars : Object.assign({}, S.vars) });
      const bad = p.steps.find((s) => !s.ok);
      if (p.ok || !bad || bad.error.code !== 'rate') break;
      if (!(await R.fetch(bad.error.from, bad.error.to, today()))) break;
    }
    const r = resultOf(p);
    if (!r.ok && r.error.code === 'rate') r.error.message = t('calculator.status.no_rate', { msg: r.error.message });
    return r;
  }

  function showPreview(r) {
    el.preview.classList.toggle('sc-error', !!r && !r.ok);
    el.preview.textContent = !r ? '' : r.ok ? '= ' + r.text : r.error.message;
  }
  async function preview() {
    const src = el.expr.value.trim();
    const my = ++S.seq;
    if (!src) { S.last = null; showPreview(null); return; }
    const r = await evaluate(src, false);
    if (my !== S.seq) return;
    S.last = r.ok ? { expr: src, value: r.value, text: r.text } : null;
    showPreview(r);
  }
  function schedulePreview() { clearTimeout(S.timer); S.timer = setTimeout(preview, 120); }

  async function commit() {
    const src = el.expr.value.trim();
    if (!src) return;
    clearTimeout(S.timer);
    const my = ++S.seq;
    const r = await evaluate(src, true);
    if (my !== S.seq) return;
    showPreview(r);
    if (!r.ok) { setStatus(t('calculator.status.not_calculated', { msg: r.error.message })); return; }
    S.last = { expr: src, value: r.value, text: r.text };
    el.cal.hidden = !SlopCalcCalendar.formFor(S.last);
    S.ans = r.value;
    K.write(VARS_KEY, S.vars);
    renderVars();
    S.tape.push({ expr: src, text: r.text });
    if (S.tape.length > TAPE_MAX) S.tape.splice(0, S.tape.length - TAPE_MAX);
    S.history = [{ expr: src, text: r.text, at: Date.now() }, ...S.history.filter((h) => h.expr !== src)].slice(0, HIST_MAX);
    K.write(HIST_KEY, S.history);
    P.renderHistory(S.history);
    renderTape();
    el.expr.select();
    setStatus(t('calculator.status.saved_tape', { expr: src, result: r.text }));
  }

  function renderTape() {
    el.tape.replaceChildren(...S.tape.map((row) => {
      const li = document.createElement('li');
      li.className = 'sc-line';
      li.tabIndex = 0;
      li.title = t('calculator.line.use');
      const a = document.createElement('span'); a.className = 'sc-line-expr'; a.textContent = row.expr;
      const b = document.createElement('span'); b.className = 'sc-line-val'; b.textContent = '= ' + row.text;
      li.append(a, b);
      const use = () => { el.expr.value = row.expr; schedulePreview(); el.expr.focus(); };
      li.addEventListener('click', use);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') use(); });
      return li;
    }));
    el.tape.scrollTop = el.tape.scrollHeight;
    el.tapeClear.disabled = !S.tape.length;
  }

  function insert(text) {
    const v = el.expr.value, s = el.expr.selectionStart ?? v.length, e = el.expr.selectionEnd ?? v.length;
    el.expr.value = v.slice(0, s) + text + v.slice(e);
    el.expr.setSelectionRange(s + text.length, s + text.length);
    el.expr.focus();
    S.recall = -1;
    schedulePreview();
  }

  function recall(step) {
    if (!S.tape.length) return;
    S.recall = S.recall < 0 ? (step < 0 ? S.tape.length - 1 : -1) : Math.min(S.tape.length - 1, Math.max(0, S.recall + step));
    if (S.recall < 0) { el.expr.value = ''; } else { el.expr.value = S.tape[S.recall].expr; }
    schedulePreview();
  }

  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); clearInput(); }
    else if (e.key === 'ArrowUp' && !e.altKey) { e.preventDefault(); recall(-1); }
    else if (e.key === 'ArrowDown' && !e.altKey) { e.preventDefault(); recall(1); }
  }

  function clearInput() { el.expr.value = ''; S.recall = -1; S.last = null; S.seq++; showPreview(null); el.expr.focus(); }
  function clearTape() { S.tape = []; renderTape(); setStatus(t('calculator.status.tape_cleared')); }
  /** A new sheet: an empty tape and line, no last answer; the variables go too unless kept. The history is kept. */
  function newSheet(keepVars) {
    S.tape = []; S.ans = null; renderTape(); clearInput();
    if (!keepVars) { S.vars = {}; K.write(VARS_KEY, S.vars); renderVars(); }
    setStatus(t('calculator.status.new_sheet'));
  }

  /** The variables: each name with its value. A click puts the name into the line. */
  function renderVars() {
    const names = Object.keys(S.vars).sort();
    el.vars.replaceChildren(...names.map((name) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sc-var'; b.title = t('calculator.line.put', { name });
      b.textContent = name + ' = ' + C.format(S.vars[name]);
      b.addEventListener('click', () => { const at = el.expr.selectionStart == null ? el.expr.value.length : el.expr.selectionStart; el.expr.setRangeText(name, at, at, 'end'); el.expr.focus(); schedulePreview(); });
      li.append(b);
      return li;
    }));
    el.varsNone.hidden = names.length > 0;
    el.varsClear.disabled = !names.length;
  }
  async function clearVars() {
    if (!Object.keys(S.vars).length) return;
    const ok = await SlopUI.confirm(t('calculator.vars.confirm_title'), t('calculator.vars.confirm_text', { n: Object.keys(S.vars).length }), t('calculator.app.clear'), { danger: true });
    if (!ok) return;
    S.vars = {}; K.write(VARS_KEY, S.vars); renderVars(); setStatus(t('calculator.status.vars_cleared')); schedulePreview();
  }

  /** The result as text to paste: a plain number without separators, else the displayed text. */
  function copyText() {
    if (!S.last) return null;
    const v = S.last.value;
    return v.t === 'n' ? String(Number(v.v.toPrecision(12))) : S.last.text;
  }
  async function copyResult() {
    const text = copyText();
    if (text === null) { setStatus(t('calculator.status.first')); return; }
    try { await navigator.clipboard.writeText(text); toast(t('calculator.status.copied', { text })); }
    catch (e) { setStatus(t('calculator.status.clipboard_blocked')); }
  }

  /** One Slop Drive file per calculation: Markdown, meta { type:'notes', kind:'calc' }. Notes ignores kind 'calc'. */
  async function saveDrive() {
    if (!S.last) { setStatus(t('calculator.status.first')); return; }
    if (!window.SlopHub) { setStatus(t('calculator.status.no_drive')); return; }
    const { expr, text } = S.last;
    const title = `${expr} = ${text}`.replace(/[\\/:*?"<>|\r\n]+/g, ' ').slice(0, 60).trim();
    const body = `# ${title}\n\n${expr}\n\n= ${text}\n\nSaved from Slopculator on ${today()}.\n`;   // i18n-ignore: the saved note's text
    try {
      await SlopHub.put(new Blob([body], { type: 'text/markdown' }), {
        name: `${title}.md`, from: 'calculator',
        meta: { type: 'notes', kind: 'calc', title, expression: expr, result: text, saved: Date.now() },
      });
      toast(t('calculator.status.saved_drive'));
    } catch (e) { setStatus(t('calculator.status.not_saved', { msg: e && e.message ? e.message : t('calculator.status.drive_refused') })); }
  }

  /** Adds the last calculation to the Calendar, when its result is a date. */
  async function addToCalendar() {
    if (!S.last) { setStatus(t('calculator.status.first')); return; }
    const r = await SlopCalcCalendar.add(S.last);
    setStatus(r.message);
    if (r.ok) toast(r.message);
  }

  function boot() {
    el = { expr: $('sc-expr'), preview: $('sc-preview'), status: $('sc-status'), tape: $('sc-tape'), tapeClear: $('sc-tape-clear'), cal: $('sc-cal'), vars: $('sc-vars'), varsNone: $('sc-vars-none'), varsClear: $('sc-vars-clear') };
    el.expr.addEventListener('input', () => { S.recall = -1; schedulePreview(); });
    el.expr.addEventListener('keydown', onKey);
    $('sc-enter').addEventListener('click', commit);
    $('sc-copy').addEventListener('click', copyResult);
    $('sc-save').addEventListener('click', saveDrive);
    el.cal.addEventListener('click', addToCalendar);
    $('sc-clear').addEventListener('click', clearInput);
    el.tapeClear.addEventListener('click', clearTape);
    el.varsClear.addEventListener('click', clearVars);
    renderVars();
    document.querySelectorAll('[data-ins]').forEach((b) => b.addEventListener('click', () => insert(b.dataset.ins)));
    // Published only now, with the listeners attached: this script sits in the <head>, so boot() waits for
    // DOMContentLoaded, and a caller that sees SlopCalcApp earlier would click controls that do nothing yet.
    const copy = (r) => Object.assign({}, r);
    window.SlopCalcApp = { commit, copyResult, saveDrive, clearInput, clearTape, newSheet, insert, focus: () => el.expr.focus(), copyText,
      setExpr: (text) => { el.expr.value = text; },
      snapshot: () => ({ last: S.last && { expr: S.last.expr, text: S.last.text }, tape: S.tape.map(copy), ans: S.ans,
        vars: Object.keys(S.vars).sort().map((n) => n + ' = ' + C.format(S.vars[n])) }),
      /** The tape, the last answer and the variables as they are (mark), and back to them (restore): the assistant's undo. */
      mark: () => ({ tape: S.tape.map(copy), ans: S.ans, vars: Object.assign({}, S.vars) }),
      restore: (m) => { S.tape = m.tape.map(copy); S.ans = m.ans; S.vars = Object.assign({}, m.vars); K.write(VARS_KEY, S.vars); renderTape(); renderVars(); } };
    P.init({
      pick: (expr) => { el.expr.value = expr; schedulePreview(); el.expr.focus(); },
      history: () => S.history,
      setHistory: (list) => { S.history = list; K.write(HIST_KEY, list); },
      ratesChanged: () => schedulePreview(),
      status: setStatus,
    });
    renderTape();
    P.renderHistory(S.history);
    // a language change: the tooltips on the tape and the variables, the history and the rates in the new language
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { renderTape(); renderVars(); P.renderHistory(S.history); P.renderRates(); });
    const start = new URLSearchParams(location.search).get('expr');
    if (start) { el.expr.value = start; preview(); }
    el.expr.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
