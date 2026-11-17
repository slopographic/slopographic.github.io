/* SlopFmpView.mountError(host, err, opts): the calm screen for a file SlopFmp.open() could not open. One message per
   error code ('encrypted', 'not-filemaker', 'unsupported', 'corrupt', 'too-large'; any other error gets a general one),
   with the file's name (opts.name, else opts.title). Returns { destroy() }. Classic script, after view-util.js. */
(function () {
  'use strict';
  const V = window.SlopFmpView;
  const KEYS = {
    'not-filemaker': 'ui.fmp.err_not_filemaker',
    encrypted: 'ui.fmp.err_encrypted',
    unsupported: 'ui.fmp.err_unsupported',
    corrupt: 'ui.fmp.err_corrupt',
    'too-large': 'ui.fmp.err_too_large',
  };

  V.mountError = function (host, err, opts) {
    opts = opts || {};
    V.css();
    const W = V.words();
    const name = opts.name || opts.title || '';
    const code = err && err.code && KEYS[err.code] ? err.code : 'other';
    const key = KEYS[code] || 'ui.fmp.err_other';
    const root = V.el('section', 'sfv sfv-err', null, { role: 'alert', 'data-code': code });
    const title = V.el('div', 'sfv-err-title', null, { role: 'heading', 'aria-level': '2' });
    W.text(title, () => (name ? V.tr('ui.fmp.err_title', { name }) : V.tr('ui.fmp.err_title_noname')));
    const msg = V.el('p', 'sfv-err-msg');
    W.text(msg, () => V.tr(key));
    root.append(V.el('span', 'sfv-err-icon', '!', { 'aria-hidden': 'true' }), title, msg);
    // an error with no code of ours (a failure inside the reader) keeps its own words as a detail line
    if (code === 'other' && err && err.message) root.append(V.el('p', 'sfv-err-detail', String(err.message)));
    host.replaceChildren(root);
    return { code, destroy() { W.destroy(); root.remove(); } };
  };
})();
