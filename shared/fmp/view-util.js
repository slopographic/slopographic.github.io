/* SlopFmpView, shared pieces: the viewer's words (SlopI18n keys ui.fmp.*, with their English), number and DOM helpers,
   the stylesheet loader and the registry of words that follow a language change. Classic script; the first of the
   viewer's files (view-util.js, view-error.js, view-grid.js, view-find.js, view-export.js, then view.js). See view.js. */
(function () {
  'use strict';
  const V = (window.SlopFmpView = window.SlopFmpView || {});
  /** The folder these scripts are served from (shared/fmp/), read while the script runs. */
  V.base = (document.currentScript && document.currentScript.src ? document.currentScript.src : '').replace(/[^/]*$/, '');

  /** The English of every word of the viewer, by key. It is what a page shows until the shared tables (shared/i18n/ui)
   *  hold the key; a 'key#one' entry is the singular for {n} = 1. File format names (CSV, JSON) are not translated. */
  const EN = {
    'ui.fmp.untitled': 'Database',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.region': 'Database: {name}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.tables': '{n} tables',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.tables#one': '{n} table',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.rows': '{n} rows',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.rows#one': '{n} row',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.columns': '{n} columns',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.columns#one': '{n} column',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.tables_aria': 'Tables',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.table_pick': 'Table',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.no_tables': 'This file has no tables.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.no_rows': 'This table has no rows.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.row_no': 'Row',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.loading_rows': 'Loading rows…',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.rows_failed': 'Some rows could not be read.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.retry': 'Try again',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.find': 'Find in this table',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.find_next': 'Next',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.find_prev': 'Previous',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.searching': 'Searching… {done} of {total} rows',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.found': 'Found in row {row}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.not_found': 'Not found in this table.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.find_failed': 'Could not read the rows while searching.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.export': 'Export…',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.export_title': 'Export this table',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.download': 'Download {format}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.csv_in': 'CSV in {app}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.json_in': 'JSON in {app}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.save_csv': 'Save CSV to Slop Drive…',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.save_json': 'Save JSON to Slop Drive…',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.export_failed': 'Could not export: {error}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.opening': 'Opening the database…',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.load_failed': 'The database viewer could not be loaded.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.pattern': 'Find a kind of text',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.pattern_none': 'Text in the box',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_title': 'Could not open {name}',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_title_noname': 'Could not open this file',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_not_filemaker': 'This file is not a FileMaker database.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_encrypted': 'This FileMaker file is encrypted. Open it in FileMaker with the password and export it.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_unsupported': 'This kind of FileMaker file cannot be read here. Open it in FileMaker and export its tables.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_corrupt': 'This FileMaker file seems damaged, so it cannot be read. Try a backup copy, or export its tables from FileMaker.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_too_large': 'This FileMaker file is too large to open here. Export its tables from FileMaker and open those instead.',   // i18n-ignore: the English of the key, until the shared tables hold it
    'ui.fmp.err_other': 'This file could not be opened.',   // i18n-ignore: the English of the key, until the shared tables hold it
  };
  V.EN = Object.assign(V.EN || {}, EN);

  /** A number in the page's language (grouping and all), plain English digits when SlopI18n is absent. */
  V.num = (n) => { const I = globalThis.SlopI18n; return I && I.num ? I.num(n) : Number(n).toLocaleString(); };
  /** A word: the shared table's (SlopI18n, plural forms by vars.n) when it has the key, else the English above. */
  V.tr = function (key, vars) {
    const I = globalThis.SlopI18n;
    if (I && I.has && I.has(key)) return I.t(key, vars);
    const en = vars && vars.n === 1 && V.EN[key + '#one'] ? V.EN[key + '#one'] : V.EN[key];
    return String(en == null ? key : en).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? (typeof vars[k] === 'number' ? V.num(vars[k]) : String(vars[k])) : m));
  };
  /** A new element: tag, class, text, and attributes ({ name: value }). */
  V.el = function (tag, cls, text, attrs) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (attrs) for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    return n;
  };
  /** Words that follow a language change: text(el, fn) writes fn() as the element's text now and after each switch,
   *  attr(el, name, fn) the same for an attribute; destroy() stops listening. */
  V.words = function () {
    const list = [];
    let off = null;
    const add = (f) => {
      f();
      list.push(f);
      const I = globalThis.SlopI18n;
      if (!off && I && I.on) off = I.on(() => list.forEach((g) => g()));
    };
    return {
      text: (el, fn) => add(() => { el.textContent = fn(); }),
      attr: (el, name, fn) => add(() => { el.setAttribute(name, fn()); }),
      destroy() { list.length = 0; if (off) off(); off = null; },
    };
  };
  /** Adds view.css to the page once (a page that has its own link to it is left alone). */
  V.css = function () {
    if (!V.base || Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((l) => /fmp\/view\.css/.test(l.getAttribute('href') || ''))) return;
    if (document.querySelector('link[data-sfv-css]')) return;
    const l = V.el('link', null, null, { rel: 'stylesheet', href: V.base + 'view.css', 'data-sfv-css': '' });
    document.head.append(l);
  };
})();
