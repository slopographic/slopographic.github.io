/* Settings: the Local folder section. It is the same folder as Slop Drive's (shared/sync/providers/local.js), so a
 * connect here shows in Slop Drive and the other way round. Connect, allow access, disconnect, and the config actions
 * from shared/config/folder.js (save the settings as slopographic.slop.json; load them back, with the changes listed
 * before Apply). No network. Classic script. Needs the local provider, the config scripts, shared/i18n/i18n.js and
 * settings/say.js loaded first. The buttons, the question and the preview are drawn again on a language switch. */
(function () {
  'use strict';
  var host = document.getElementById('folder-box');
  var ask = document.getElementById('folder-ask');
  var preview = document.getElementById('folder-preview');
  var note = document.getElementById('folder-note');
  var L = window.SlopSyncProviders && window.SlopSyncProviders.local;
  var F = window.SlopConfigFolder;
  var state = { supported: false, name: null, perm: 'none' };
  var I = window.SlopI18n, Say = window.SlopSettingsSay;
  var asked = null, shown = null;   // the folder the question is about, and the preview on screen: drawn again on a switch

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'onclick') n.addEventListener('click', props[k]);
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function button(label, fn, cls) {
    return el('button', { type: 'button', class: cls || 'btn', text: label, onclick: function () { run(fn); } });
  }
  /** The status line: a key (with vars) follows the language; an error from the browser or the config is shown as given. */
  function say(k, vars) { Say.key(note, k, vars); }
  function sayText(msg) { Say.text(note, msg); }
  /** Runs an action and shows what went wrong, so a button never fails silently. */
  function run(fn) {
    Promise.resolve().then(fn).catch(function (e) { sayText(e && e.message ? e.message : String(e)); });
  }
  function hide(node) {
    node.hidden = true;
    node.replaceChildren();
    if (node === ask) asked = null;
    if (node === preview) shown = null;
  }

  async function refresh() {
    state.supported = !!L && L.supported();
    if (state.supported) {
      var ch = await L.chosen();
      state.name = ch ? ch.name : null;
      state.perm = await L.permission();
    } else { state.name = null; state.perm = 'none'; }
    render();
  }

  function render() {
    host.replaceChildren();
    if (!state.supported) {
      host.append(el('p', { class: 'settings-note', text: I.t('settings.folder.needs_chromium') }));
      return;
    }
    if (!state.name) {
      host.append(el('p', { class: 'settings-note', text: I.t('settings.folder.none') }), button(I.t('settings.folder.connect'), connect));
      return;
    }
    host.append(el('p', { class: 'settings-note', text: I.t('settings.folder.connected', { name: state.name }) }));
    if (state.perm !== 'granted') {
      host.append(button(I.t('settings.folder.allow', { name: state.name }), allow));
      return;
    }
    host.append(el('div', { class: 'folder-row' }, [
      button(I.t('settings.folder.save'), save),
      button(I.t('settings.folder.load'), load),
      button(I.t('settings.folder.disconnect'), disconnect, 'btn'),
    ]));
  }

  async function connect() {
    if (!state.supported) return say('settings.folder.needs_chromium_short');
    var r = await L.pick();
    if (!r.ok) return r.cancelled ? say('settings.folder.not_chosen') : sayText(r.error);
    await refresh();
    askSave(r.name);
  }

  /** The question after connecting: save the config in the folder now? */
  function askSave(name) {
    hide(preview);
    asked = name;
    ask.hidden = false;
    ask.replaceChildren(
      el('p', { class: 'settings-note', text: I.t('settings.folder.ask_save', { name: name, file: F.FILE }) }),
      button(I.t('settings.folder.save_config'), function () { hide(ask); return save(); }),
      button(I.t('settings.folder.not_now'), function () { hide(ask); say('settings.folder.not_saved'); }, 'btn')
    );
  }

  async function save() {
    var r = await F.save();
    if (!r.ok) return sayText(r.error);
    say('settings.folder.saved', { file: r.name });
  }

  async function load() {
    hide(ask);
    var p = await F.preview();
    if (!p.ok) return sayText(p.error);
    showPreview(p);
  }

  /** The changes a loaded file would make, with Apply and Close. */
  function showPreview(p) {
    shown = p;
    var body = p.changes.length
      ? [el('p', { class: 'settings-note', text: I.t('settings.folder.changes') }),
        el('ul', { class: 'folder-changes' }, p.changes.map(function (c) { return el('li', { text: c.label + ': ' + c.from + ' → ' + c.to }); }))]
      : [el('p', { class: 'settings-note', text: I.t('settings.folder.same') })];
    preview.hidden = false;
    preview.replaceChildren.apply(preview, body.concat([el('div', { class: 'folder-row' }, [
      p.changes.length ? button(I.t('ui.apply'), async function () {
        var r = await F.apply(p);
        if (!r.ok) return sayText(r.error);
        hide(preview);
        say('settings.folder.applied', { n: r.applied });
        if (window.SlopSettings && window.SlopSettings.sync) window.SlopSettings.sync();
      }) : null,
      button(I.t('menu.close'), function () { hide(preview); }, 'btn'),
    ].filter(Boolean))]));
  }

  async function allow() {
    var p = await L.allow();
    if (p !== 'granted') return say('settings.folder.denied');
    await refresh();
    say('settings.folder.allowed');
  }

  async function disconnect() {
    hide(ask); hide(preview);
    await L.forget();
    await refresh();
    say('settings.folder.disconnected');
  }

  refresh();
  I.on(function () {   // the buttons, an open question and an open preview in the new language
    render();
    if (asked !== null) askSave(asked);
    if (shown) showPreview(shown);
  });
})();
