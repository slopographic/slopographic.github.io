/* Settings page: one section per registry app that has its own options (shared/profile/app-options.js) or shares an option
 * group (SLOP_APP_SHARED: such as face detection, one stored value shown in Drive's and Gallery's sections). Read and
 * written through SlopProfile. A change saves at once and every control showing that value is updated. Only overrides
 * are stored; "Reset this app" clears an app's own. Classic script. Needs shared/apps.js, shared/profile/profile.js,
 * shared/i18n/i18n.js and settings/say.js. */
(function () {
  'use strict';
  var host = document.getElementById('app-settings');
  var P = window.SlopProfile;
  var I = window.SlopI18n, Say = window.SlopSettingsSay;
  var controls = []; // { owner, key, opt, input }: kept in step with the stored values
  /** An option's label, help or group heading: an i18n key, a function or text (SlopI18n.label). */
  var lab = function (v) { var I = window.SlopI18n; return String(I && I.label ? I.label(v) : typeof v === 'function' ? v() : v); };

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  /** Every control shows the stored value (or the default), so a refused value is put back. */
  function syncAll() {
    controls.forEach(function (c) {
      var v = P.get(c.owner, c.key);
      if (c.opt.type === 'bool') c.input.checked = !!v; else c.input.value = String(v);
    });
  }
  function save(ctx, owner, key, value) {
    var r = P.set(owner, key, value);
    syncAll();
    if (r.ok) Say.key(ctx.note, 'settings.apps.saved'); else Say.text(ctx.note, r.error);
  }

  /** One control for one option. */
  function control(owner, key, opt, ctx) {
    var id = 'opt-' + owner + '-' + key + '-' + ctx.id;
    var input, row;
    if (opt.type === 'bool') {
      input = el('input', { type: 'checkbox', id: id });
      input.addEventListener('change', function () { save(ctx, owner, key, input.checked); });
      row = el('div', { class: 'app-opt' }, [el('label', { class: 'set-check', for: id }, [input, el('span', { text: lab(opt.label) })])]);
    } else {
      if (opt.type === 'enum') {
        input = el('select', { id: id, class: 'set-select' });
        (opt.values || []).forEach(function (v) { input.appendChild(el('option', { value: String(v), text: String(v) })); });
        input.addEventListener('change', function () { save(ctx, owner, key, input.value); });
      } else {
        input = el('input', { id: id, class: 'set-select', type: opt.type === 'number' ? 'number' : 'text' });
        if (opt.type === 'number') {
          if (opt.min !== undefined) input.setAttribute('min', String(opt.min));
          if (opt.max !== undefined) input.setAttribute('max', String(opt.max));
        }
        input.addEventListener('change', function () { save(ctx, owner, key, opt.type === 'number' ? Number(input.value) : input.value); });
      }
      row = el('div', { class: 'app-opt' }, [el('label', { for: id, text: lab(opt.label) }), input]);
    }
    if (opt.help) row.appendChild(el('p', { class: 'muted app-opt-help', text: lab(opt.help) }));
    controls.push({ owner: owner, key: key, opt: opt, input: input });
    return row;
  }

  function renderApp(app, opts, shared) {
    var section = el('div', { class: 'app-block', id: 'app-' + app.id });
    section.appendChild(el('h3', { text: app.name }));
    var ctx = { id: app.id, note: el('p', { class: 'settings-note', role: 'status', 'aria-live': 'polite' }) };
    var own = opts[app.id] || {};
    var ownKeys = Object.keys(own);
    ownKeys.forEach(function (key) { section.appendChild(control(app.id, key, own[key], ctx)); });
    var groups = shared[app.id] || {};
    Object.keys(groups).forEach(function (owner) {
      section.appendChild(el('h4', { class: 'app-group', text: lab(groups[owner]) }));
      var o = opts[owner] || {};
      Object.keys(o).forEach(function (key) { section.appendChild(control(owner, key, o[key], ctx)); });
    });
    if (ownKeys.length) {
      var reset = el('button', { type: 'button', class: 'btn', text: I.t('settings.apps.reset') });
      reset.addEventListener('click', function () {
        var r = P.reset(app.id);
        syncAll();
        if (r.ok) Say.key(ctx.note, 'settings.apps.reset_done'); else Say.text(ctx.note, r.error);
      });
      section.appendChild(reset);
    }
    section.appendChild(ctx.note);
    host.appendChild(section);
  }

  function render() {
    host.textContent = '';
    controls = [];
    var opts = window.SLOP_APP_OPTIONS || {}, shared = window.SLOP_APP_SHARED || {};
    var has = function (id) { return Object.keys(opts[id] || {}).length > 0 || Object.keys(shared[id] || {}).length > 0; };
    var apps = (window.SLOP_APPS || []).filter(function (a) { return has(a.id); });
    if (!P || !apps.length) {
      host.appendChild(el('p', { text: I.t('settings.apps.none') }));
      return;
    }
    apps.forEach(function (a) { renderApp(a, opts, shared); });
  }

  render();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(render);   // the options' words follow a language switch
  window.SlopAppSettings = { render: render };
})();
