/* QR SLOP: the Content tab (name, kind chips, the form for the kind) and the Templates gallery. The callbacks report
 * every change; the app redraws. Classic script; exposes window.QRPanelContent. */
(function (g) {
  'use strict';
  if (g.QRPanelContent) return;
  const E = (tag, attrs, ...kids) => g.SlopUI.el(tag, attrs, ...kids);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  /** A template's words: qr.tpl.<id> and qr.tpl.<id>_desc (en/forms.js), its group qr.tpl.group_<group>. */
  const tk = (id) => 'qr.tpl.' + id.replace(/-/g, '_');
  const GROUPS = { Business: 'qr.tpl.group_business', Hospitality: 'qr.tpl.group_hospitality', Events: 'qr.tpl.group_events', Social: 'qr.tpl.group_social' };

  /** One toggle button per kind, the current one pressed. onPick(kind). */
  function drawKinds(host, current, onPick) {
    host.replaceChildren(...g.QRPayload.TYPES.map((k) => E('button', {
      type: 'button', class: 'qr-chip', 'aria-pressed': String(k === current), 'data-kind': k,
      onclick: () => onPick(k),
    }, t('qr.kind.' + k))));
  }

  /** The form for one kind. onInput(key, value) on every change. */
  function drawForm(host, kind, values, onInput) {
    g.QRForms.draw(host, kind, values, onInput);
  }

  /** The gallery: a card per template with its group, name and description. onPick(id). */
  function drawTemplates(host, onPick) {
    host.replaceChildren(...g.QRTemplates.list().map((p) => E('button', {
      type: 'button', class: 'qr-tpl', 'data-id': p.id, onclick: () => onPick(p.id),
    }, E('span', { class: 'qr-tpl-group' }, GROUPS[p.group] ? t(GROUPS[p.group]) : p.group), E('b', null, t(tk(p.id))), E('small', null, t(tk(p.id) + '_desc')))));
  }

  /** A template's name in the current language (the page's Name field gets it). */
  const templateName = (id) => t(tk(id));

  g.QRPanelContent = Object.freeze({ drawKinds, drawForm, drawTemplates, templateName });
})(typeof window !== 'undefined' ? window : globalThis);
