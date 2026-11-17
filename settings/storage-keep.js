/* Settings: Storage, the top of the section. The usage meter, whether the browser keeps this site's data, the Keep my
 * files button (SlopQuota.request, with the honest answer), how much space this browser gives, and the way past that
 * limit: a folder on disk connected in Slop Drive (Chrome and Edge). Classic script; needs shared/storage/quota.js and
 * shared/i18n (the storage.* keys). settings/storage.js calls nodes() each time it redraws the section. */
(function () {
  'use strict';
  var Q = window.SlopQuota;

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  /** est: SlopQuota.estimate(). say(text) writes the status line; redraw() draws the section again. */
  var answer = '';   // the browser's last answer to Keep my files, shown under the button (it survives the redraw)
  function nodes(est, say, redraw) {
    var t = Q.t, kept = est.persisted === true;
    var pct = est.usage != null && est.quota ? est.percent : 0;
    var used = est.usage == null ? t('storage.unknown') : Q.format(est.usage, est.quota) + ' (' + Math.round(pct) + '%)';
    var bar = el('div', { class: 'meter-bar', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': pct.toFixed(1), 'aria-label': t('storage.meter_aria') },
      [el('i', { style: 'width:' + Math.max(pct, est.usage ? 1 : 0) + '%' })]);
    var state = kept ? 'granted' : est.persisted === false ? 'denied' : 'unknown';
    var keep = el('button', { type: 'button', class: 'btn' + (kept ? '' : ' primary'), 'data-act': 'persist' }, [kept ? '✓ ' + t('storage.kept_button') : t('storage.keep')]);
    keep.disabled = kept || !est.canPersist;
    keep.addEventListener('click', function () {
      keep.disabled = true;
      Q.request().then(function (a) { answer = Q.outcome(a, est.browser.engine); say(answer); redraw(); });
    });
    var folder = el('div', { class: 'storage-folder', 'data-folder': est.folder ? 'yes' : 'no' }, [
      el('p', { text: Q.folderText(est) }),
      est.folder ? el('a', { class: 'btn', href: '../drive/#connect-folder', 'data-act': 'connect-folder' }, [t('storage.folder_button')]) : null,
    ]);
    return [
      el('div', { class: 'meter-h' }, [el('b', { text: t('storage.site') }), el('span', { class: 'storage-used', text: used })]),
      bar,
      el('div', { class: 'storage-keep', 'data-state': state }, [
        el('p', { class: 'persist-note', 'data-state': state, text: kept ? t('storage.kept') : t('storage.not_kept') }),
        keep,
        answer ? el('p', { class: 'persist-answer', role: 'status', text: answer }) : null,
      ]),
      el('div', { class: 'storage-limit', 'data-engine': est.browser.engine, 'data-web-only': '' }, [   // browser limits and Chrome-only folders: the website's (shared/native-app.js hides it in the iPhone/iPad app)
        el('h3', { text: t('storage.limit_title') }),
        el('p', { text: Q.limitText(est.browser.engine) }),
        folder,
      ]),
    ];
  }

  window.SlopSettingsStorage = { nodes: nodes };
})();
