// The Storage tab: how much space this site uses, and whether the browser has promised to keep it. The message is
// the one shared/pwa.js gives for that answer.
(function (g) {
  'use strict';
  const NS = (g.SlopAdmin = g.SlopAdmin || {});
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function render() {
    const s = await NS.storage.status();
    $('sUsage').textContent = s.usage === null ? t('admin.sg.no_report')
      : t('admin.sg.used', { used: NS.util.bytes(s.usage), quota: NS.util.bytes(s.quota) });
    $('sPersist').textContent = s.message;
    $('sState').textContent = s.persisted === null ? '' : t(s.persisted ? 'admin.sg.kept' : 'admin.sg.not_kept');
    $('sAsk').hidden = s.persisted === true;
  }

  async function ask() {
    $('sMsg').textContent = '';
    await NS.storage.ask();
    await render();
  }

  NS.views = NS.views || {};
  NS.views.storage = { mount: () => $('sAsk').addEventListener('click', ask), render };
})(typeof window !== 'undefined' ? window : globalThis);
