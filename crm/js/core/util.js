// Slop CRM core helpers: the namespace, pipeline stages, dates and money display. Classic script. Exposes window.SlopCrm.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const STAGES = ['lead', 'contacted', 'customer', 'lost'];
  const STAGE_LABEL = { lead: 'Lead', contacted: 'Contacted', customer: 'Customer', lost: 'Lost' };   // i18n-ignore: English names (NS.util API); the page shows crm.stage.<id>
  const pad = (n) => String(n).padStart(2, '0');

  /** Local calendar date as YYYY-MM-DD (the day the person sees). */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** True for a real calendar date written YYYY-MM-DD. */
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  /** "a, b ,c" -> ['a', 'b', 'c'] (blanks dropped, duplicates removed). */
  function tags(text) {
    return [...new Set(String(text || '').split(',').map((s) => s.trim()).filter(Boolean))];
  }

  /** Text for a failed Result: the first message, which already names the fields that are wrong. */
  function refusal(r) {
    return (r && r.message) || NS.tr('crm.core.not_saved');
  }

  NS.STAGES = STAGES;
  /** A word from the string tables (crm/i18n), in the chosen language; the key when SlopI18n is absent. */
  NS.tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  NS.stageLabel = (s) => (STAGES.includes(s) ? NS.tr('crm.stage.' + s) : s);
  /** A phone, email or address label (mobile, work, home…) in words; another label as it is. */
  NS.labelWord = (l) => (['mobile', 'work', 'home', 'fax', 'other', 'personal'].includes(l) ? NS.tr('crm.lbl.' + l) : l);
  // Settings (currency, locale) and money are SlopBiz's (shared/biz/biz.js).
  NS.util = { STAGES, STAGE_LABEL, today, isDate, settings: g.SlopBiz.settings, tags, refusal, money: g.SlopBiz.money,
    date: (iso, loc) => S.locale.formatDate(iso, loc) };
})(typeof window !== 'undefined' ? window : globalThis);
