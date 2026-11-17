/* Settings: Storage. How full this site's browser storage is, what uses it, whether the browser keeps it, and the clear
 * actions. Clearing never deletes Drive files, documents or saved projects. Classic script. Needs shared/storage/*.js,
 * shared/cache/regen.js, shared/slopui.js, shared/review/ (the list of what a clear removes), shared/storage/quota.js and
 * settings/storage-keep.js (the meter, Keep my files and the browser's limit). Every clear opens
 * that list first: each removable part is a checked item with its size, and only the parts left checked are cleared.
 * The words are settings.storage.* keys (settings/i18n), read each time the section is drawn. */
(function () {
  'use strict';
  var SS = window.SlopStorage;
  var host = document.getElementById('storage-box');
  var note = document.getElementById('storage-note');
  var I = window.SlopI18n, Say = window.SlopSettingsSay;

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  /** The status line: a key follows the language; text from SlopQuota (already in the language) is shown as given. */
  function say(msg) { Say.text(note, msg); }

  /** A clear button. Its parts are listed first (run); the result is shown and the numbers redrawn. key names its words:
   * settings.storage.act_<key> (the button), _title (the list's title) and _text (what it does). */
  var ACTIONS = [
    { kind: ['thumbs'], key: 'thumbs' },
    { kind: ['models', 'cutout'], key: 'models' },
    { kind: ['oldCaches'], key: 'old' },
    { kind: ['packs'], key: 'packs' },
    { kind: ['aitools'], key: 'aitools' },
    { kind: ['thumbs', 'faces', 'models', 'cutout', 'packs', 'aitools', 'oldCaches'], key: 'all' },
  ];
  var act = function (a, end) { return I.t('settings.storage.act_' + a.key + (end || '')); };
  /** The removable parts, in list order. kind is the SlopStorage.clear kind; key names settings.storage.part_<key> (its
   * label) and again_<key> (how it comes back). */
  var PARTS = [
    { kind: 'thumbs', key: 'thumbs' },
    { kind: 'faces', key: 'faces' },
    { kind: 'models', key: 'models' },
    { kind: 'cutout', key: 'cutout' },
    { kind: 'packs', key: 'packs' },
    { kind: 'aitools', key: 'aitools' },
    { kind: 'oldCaches', key: 'old' },
  ];
  /** Lists the parts a button covers, sized, all checked. Then clears only the parts the person left checked. */
  function run(action) {
    var RV = window.SlopReview;
    return SS.measure(action.kind).then(function (sizes) {
      var items = PARTS.filter(function (p) { return action.kind.indexOf(p.kind) !== -1; }).map(function (p) {
        var s = sizes[p.kind] || {};
        return {
          id: p.kind, label: I.t('settings.storage.part_' + p.key), checked: true,
          detail: [typeof s.count === 'number' ? I.t('settings.storage.items', { n: s.count }) : '', I.t('settings.storage.again_' + p.key)].filter(Boolean).join(' · '),
          size: typeof s.bytes === 'number' ? s.bytes : undefined,
        };
      });
      return RV.open({
        title: act(action, '_title'),
        intro: act(action, '_text') + ' ' + I.t('settings.storage.not_deleted') + ' ' + I.t('settings.storage.untick'),
        items: items,
        confirmLabel: function (n) { return I.t('settings.storage.clear_parts', { n: n }); },
      });
    }).then(function (ids) {
      if (!ids) return;
      Say.key(note, 'settings.storage.clearing');
      return ids.reduce(function (p, kind) {
        return p.then(function (n) { return SS.clear(kind).then(function (r) { return n + r.removed; }); });
      }, Promise.resolve(0)).then(function (n) {
        if (n) Say.key(note, 'settings.storage.removed', { n: n }); else Say.key(note, 'settings.storage.nothing');
        return draw();
      });
    });
  }

  function partsList(est) {
    if (!est.parts.length) return el('p', { class: 'settings-note', text: I.t('settings.storage.no_data') });
    return el('ul', { class: 'storage-parts' }, est.parts.map(function (p) {
      var size = typeof p.bytes === 'number' ? SS.bytes(p.bytes) : (typeof p.count === 'number' ? I.t('settings.storage.items', { n: p.count }) : '');
      return el('li', null, [el('span', { text: p.label }), el('small', { text: [size, p.detail].filter(Boolean).join(' · ') })]);
    }));
  }

  /** Redraws the whole section from a fresh estimate. The meter, the Keep my files button and the browser's limit come
   * from settings/storage-keep.js (SlopQuota); the parts and the clear actions are drawn here. */
  function draw() {
    return Promise.all([SS.estimate(), window.SlopQuota.estimate()]).then(function (r) {
      var est = r[0], q = r[1];
      var actions = ACTIONS.map(function (a) {
        var b = el('button', { type: 'button', class: 'btn', 'data-act': a.kind.join('+') }, [document.createTextNode(act(a))]);
        b.addEventListener('click', function () { run(a); });
        return el('div', { class: 'storage-act' }, [b, el('p', { class: 'settings-note', text: act(a, '_text') })]);
      });
      host.replaceChildren.apply(host, window.SlopSettingsStorage.nodes(q, say, draw).concat([
        partsList(est),
        el('div', { class: 'storage-acts' }, actions),
      ]));
    });
  }

  if (host) draw().catch(function () { Say.key(note, 'settings.storage.unreadable'); });
  // the storage.* text is in the new language (slopi18n: once its tables are in, they load lazily)
  if (host) ['slop-lang', 'slopi18n'].forEach(function (ev) { window.addEventListener(ev, function () { draw(); }); });
})();
