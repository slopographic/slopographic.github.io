/* Slop Contacts: the card in view mode. A large avatar, name, company and title; the phone, e-mail, address,
 * birthday and website rows with their labels; Notes (the plain notes); Pipeline (stage and next follow-up date);
 * Orders and Invoices (read from the shared SlopData collections for this customer, with links to those apps);
 * and Activity (dated notes, with a form to add one). Changes are saved at once through the list. Adds SlopContacts.cardRead. */
(function () {
  'use strict';
  const SC = window.SlopContacts;
  const S = SC.state;
  const D = window.SlopData;
  const UI = window.SlopUI;
  const esc = (s) => SC.text.html(s);   // the one HTML escape (core/text.js)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  let token = 0, settings = { defaultCurrency: 'USD', locale: 'en-US' };
  const tr = (k, v) => SC.tr(k, v);
  /** Dates in the language the page is read in; in English, the company's locale (Admin) decides the format. */
  const loc = () => { const l = window.SlopI18n ? window.SlopI18n.get() : 'en'; return l !== 'en' ? l : settings.locale; };

  /** A date as the person reads it. Birthdays without a year show month and day only. */
  function dateText(v) {
    const s = String(v || '');
    try {
      if (/^--\d{2}-\d{2}$/.test(s)) {
        const [m, d] = s.slice(2).split('-');
        return new Intl.DateTimeFormat(loc(), { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, +m - 1, +d)));
      }
      return new Intl.DateTimeFormat(loc(), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`));
    } catch (e) { return s; }
  }
  const money = (minor, cur) => { try { return D.money.formatMinor(minor, cur, settings.locale); } catch (e) { return String(minor); } };
  const row = (k, v) => `<div class="field"><span class="field-k">${esc(k)}</span><span class="field-v">${v}</span></div>`;
  const kindLabel = (types, kind) => SC.labelWord(SC.customerMap.labelOf(types, kind));
  /** Writes a change to one contact through the list (saved at once). */
  const patch = (c, changes) => S.replaceMany([{ ...c, ...changes }]);

  /** The rows of contact details. */
  function details(c) {
    const out = [];
    for (const p of c.phones) out.push(row(kindLabel(p.types, 'phone'), `<a href="tel:${esc(p.value)}">${esc(p.value)}</a>`));
    for (const e of c.emails) out.push(row(kindLabel(e.types, 'email'), `<a href="mailto:${esc(e.value)}">${esc(e.value)}</a>`));
    for (const a of c.adr) out.push(row(kindLabel(a.types, 'address'), esc(a.street)));
    if (c.bday) out.push(row(tr('contacts.card.birthday'), esc(dateText(c.bday))));
    if (c.url) out.push(row(tr('contacts.card.website'), `<a href="${esc(/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`)}" rel="noopener noreferrer">${esc(c.url)}</a>`));
    return out.join('');
  }

  /** Orders and invoices of one customer: one read of each shared collection, newest first. */
  async function history(id, box) {
    const my = ++token;
    const [st, o, i] = await Promise.all([D.store.get('settings', 'main'), D.store.list('orders', { index: 'customerId', value: id }),
      D.store.list('invoices', { index: 'customerId', value: id })]);
    if (my !== token || !box.isConnected) return;
    if (st.ok && st.value) settings = { defaultCurrency: st.value.defaultCurrency || 'USD', locale: st.value.locale || 'en-US' };
    const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    const orders = o.ok ? o.value.slice().sort(byDate) : [];
    const invoices = i.ok ? i.value.slice().sort(byDate) : [];
    const status = (s) => (window.SlopBiz && SlopBiz.statusText ? SlopBiz.statusText(s) : s);
    const orderRow = (x) => `<li class="doc"><a href="../orders/#o/${esc(x.id)}">${esc(x.number || tr('contacts.card.order'))}</a>`
      + `<span class="doc-meta">${esc(dateText(x.date))} · ${esc(status(x.status))} · ${esc(money(x.total || 0, x.currency || settings.defaultCurrency))}</span></li>`;
    const invRow = (x) => `<li class="doc"><a href="../invoices/#i/${esc(x.id)}">${esc(x.number || tr('contacts.card.draft_inv'))}</a>`
      + `<span class="doc-meta">${esc(dateText(x.date))} · ${esc(status(x.status))} · ${esc(money(x.total || 0, x.currency || settings.defaultCurrency))}</span></li>`;
    box.innerHTML = `<h3 class="sec-h">${esc(tr('contacts.card.orders_invs'))}</h3>`
      + (orders.length ? `<p class="sub-h">${esc(tr('contacts.card.orders'))}</p><ul class="docs">${orders.map(orderRow).join('')}</ul>` : `<p class="muted">${esc(tr('contacts.card.no_orders'))}</p>`)
      + (invoices.length ? `<p class="sub-h">${esc(tr('contacts.card.invoices'))}</p><ul class="docs">${invoices.map(invRow).join('')}</ul>` : `<p class="muted">${esc(tr('contacts.card.no_invs'))}</p>`);
  }

  /** The card for one contact, in view mode. */
  function render(c) {
    const body = document.getElementById('cardBody');
    const sub = [c.org, c.title].filter(Boolean).join(' · ') + (c.dept ? (c.org || c.title ? ' · ' : '') + c.dept : '');
    const fu = c.followUp || '';
    const plain = SC.activity.split(c.note);
    const act = SC.activity.newestFirst(plain.activity);
    body.innerHTML = `<div class="card-bar">${SC.card.modeSwitch('view').outerHTML}</div>`
      + `<div class="card-scroll"><div class="card-head">${SC.photoUi.avatarHtml(c, true)}`
      + `<h2 class="card-name">${esc(c.fn)}</h2>${sub ? `<p class="card-sub">${esc(sub)}</p>` : ''}</div>`
      + `<div class="card-fields">${details(c) || `<p class="muted">${esc(tr('contacts.card.no_details'))}</p>`}</div>`
      + (c.groups.length ? `<div class="card-groups">${c.groups.map((g) => `<span class="chip">${esc(g)}</span>`).join('')}</div>` : '')
      + `<section class="card-sec"><h3 class="sec-h">${esc(tr('contacts.card.notes'))}</h3>${plain.plain ? `<p class="notes">${esc(plain.plain)}</p>` : `<p class="muted">${esc(tr('contacts.card.no_notes'))}</p>`}</section>`
      + `<section class="card-sec"><h3 class="sec-h">${esc(tr('contacts.card.pipeline'))}</h3><div class="pipe">`
      + `<label class="pipe-f"><span>${esc(tr('contacts.card.stage'))}</span><select data-act="stage">${S.STAGES.map((s) => `<option value="${s}"${s === c.stage ? ' selected' : ''}>${esc(SC.stageLabel(s))}</option>`).join('')}</select></label>`
      + `<label class="pipe-f"><span>${esc(tr('contacts.card.next'))}</span><span class="pipe-date"><input type="date" data-act="followUp" value="${esc(fu)}">`
      + `${fu ? `<button type="button" class="text-btn" data-act="followClear">${esc(tr('contacts.card.clear'))}</button>` : ''}</span></label></div></section>`
      + `<section class="card-sec" id="cardHistory"><h3 class="sec-h">${esc(tr('contacts.card.orders_invs'))}</h3><p class="muted">${esc(tr('contacts.card.loading'))}</p></section>`
      + `<section class="card-sec"><h3 class="sec-h">${esc(tr('contacts.card.activity'))}</h3>`
      + `<form class="act-form" data-act="actForm"><input type="date" id="actDate" value="${today()}" aria-label="${esc(tr('contacts.card.act_date'))}">`
      + `<input type="text" id="actText" maxlength="500" placeholder="${esc(tr('contacts.card.act_ph'))}" aria-label="${esc(tr('contacts.card.act_text'))}" autocomplete="off">`
      + `<button type="submit" class="btn">${esc(tr('contacts.card.add'))}</button></form>`
      + (act.length ? `<ul class="acts">${act.map((a) => `<li><span class="act-date">${esc(dateText(a.date))}</span><span class="act-text">${esc(a.text)}</span></li>`).join('')}</ul>`
        : `<p class="muted">${esc(tr('contacts.card.no_acts'))}</p>`) + `</section></div>`;   // Edit, Duplicate and Delete: the card's footer (card.js)
    bind(c, body);
    history(c.id, document.getElementById('cardHistory'));
  }

  function bind(c, body) {
    body.querySelector('[data-act="stage"]').addEventListener('change', (e) => patch(c, { stage: e.target.value }));
    body.querySelector('[data-act="followUp"]').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { UI.toast(tr('contacts.card.bad_date')); return; }
      patch(c, { followUp: v || '' });
    });
    const clr = body.querySelector('[data-act="followClear"]');
    if (clr) clr.addEventListener('click', () => patch(c, { followUp: '' }));
    body.querySelector('[data-act="actForm"]').addEventListener('submit', (e) => {
      e.preventDefault();
      const date = document.getElementById('actDate').value, text = document.getElementById('actText').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { UI.toast(tr('contacts.card.act_need_date')); return; }
      if (!text) { UI.toast(tr('contacts.card.act_need_text')); return; }
      const cur = S.byId(c.id);
      if (!cur) return;
      const p = SC.activity.split(cur.note);
      patch(cur, { note: SC.activity.join(p.plain, [...p.activity, { date, text }]) });
    });
  }

  /** A copy of the contact under a new id, opened in the form so the name can change. */
  function duplicate(c) {
    const copy = SC.model.normalise({ ...c, id: SC.records.newId(), groups: c.groups.slice() });
    S.setList([...S.list, copy]);
    S.open = copy.id; S.mode = 'edit';
    S.emit('render');
  }

  /** Re-reads the orders and invoices of the open contact (other apps may have changed them). */
  function refreshHistory() {
    const box = document.getElementById('cardHistory');
    const c = S.open && S.byId(S.open);
    if (box && c && S.mode === 'view') history(c.id, box);
  }

  SC.cardRead = { render, refreshHistory, dateText, details, duplicate };
})();
