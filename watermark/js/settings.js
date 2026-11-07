/* Slop Watermark: the watermark (the shared panel, shared/watermark/panel.js, in the side panel), its saved copy in this
 * browser and the per-group overrides. Classic script. Exposes window.WMSettings. The saved copy is one localStorage
 * record { v: 2, data: { spec, groups } }; a logo rides inside the spec when the record stays under 2.5 MB (a bigger one
 * is kept in My watermarks, which has room). A record from before the spec ({ v: 1, data: { cfg, logo, groups } }) still
 * loads. Every storage call is in try/catch: without storage the page still works.
 *   init({ onChange }) ; restore() ; spec() ; set(spec) ; panel() ; group(kind) ; setGroup(kind, patch) ; specFor(kind) */
(function () {
  'use strict';
  const KEY = 'slopwatermark.setup', VERSION = 2, LIMIT = 2.5 * 1048576;
  const $ = window.WMUtil.$, t = window.WMUtil.t, G = window.WMGroups, S = window.SlopWatermarkSpec;
  const state = { spec: S.defaults(), groups: {} };
  let onChange = () => {}, saveTimer = 0, panel = null;

  function status(text) { $('wm-saved').textContent = text; }
  function saveNow() {
    try {
      let rec = JSON.stringify({ v: VERSION, data: { spec: state.spec, groups: state.groups } }), note = t('watermark.saved.plain');
      if (rec.length > LIMIT) {
        const bare = Object.assign({}, state.spec, { layers: state.spec.layers.map((L) => Object.assign({}, L, { logo: '' })) });
        rec = JSON.stringify({ v: VERSION, data: { spec: bare, groups: state.groups } });
        note = t('watermark.saved.no_logo');
      } else if (state.spec.layers.some((L) => L.logo)) note = t('watermark.saved.logo');
      localStorage.setItem(KEY, rec);
      status(note);
    } catch (e) { status(t('watermark.saved.blocked')); }
  }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }
  function changed() { persist(); onChange(); }

  function set(spec) { state.spec = S.normalize(spec); if (panel) panel.set(state.spec); changed(); }
  /** A group's override. Turning it on copies the shared watermark; off drops it, so the group follows the shared one. */
  function setGroup(kind, patch) {
    const next = Object.assign({}, group(kind), patch);
    if (next.on) state.groups[kind] = next; else delete state.groups[kind];
    changed();
  }
  function group(kind) { return state.groups[kind] || G.overrideFrom(state.spec); }

  function init(opts) {
    onChange = (opts && opts.onChange) || onChange;
    panel = window.SlopWatermarkPanel.mount($('wm-settings'), {
      value: state.spec,
      media: { pages: false, time: false },
      onChange: (spec) => { state.spec = spec; changed(); },
      actions: [
        { label: 'watermark.set.reset', title: 'watermark.set.reset_title', act: () => { state.groups = {}; set(S.defaults()); } },
        { label: 'watermark.set.workflow', title: 'watermark.set.workflow_title', act: () => opts.toWorkflow && opts.toWorkflow() },
      ],
    });
    // the shared panel draws the two buttons once: marked, they follow a language change (shared/i18n apply())
    const keys = [['watermark.set.reset', 'watermark.set.reset_title'], ['watermark.set.workflow', 'watermark.set.workflow_title']];
    $('wm-settings').querySelectorAll('.swp-actions > button').forEach((b, i) => {
      if (keys[i]) { b.dataset.i18n = keys[i][0]; b.dataset.i18nAttr = 'title:' + keys[i][1]; }
    });
  }

  /** Puts back the saved setup when there is one (an old one too). Storage that is blocked or corrupt means the defaults. */
  function restore() {
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { rec = null; }
    const data = rec && rec.data && typeof rec.data === 'object' ? rec.data : null;
    if (!data || (rec.v !== 1 && rec.v !== VERSION)) return;
    if (rec.v === 1 && data.cfg && typeof data.cfg === 'object') state.spec = S.fromCfg(data.cfg, data.logo && data.logo.dataUrl);
    else if (data.spec) state.spec = S.normalize(data.spec);
    else return;
    state.groups = {};
    for (const k of G.KINDS) { const ov = G.clean(data.groups && data.groups[k], state.spec); if (ov) state.groups[k] = ov; }
    if (panel) panel.set(state.spec);
    status(t(state.spec.layers.some((L) => L.logo) ? 'watermark.saved.logo' : 'watermark.saved.plain'));
  }

  window.WMSettings = {
    init, restore, set, setGroup, group,
    spec: () => state.spec,
    panel: () => panel,
    specFor: (kind) => G.applyOverride(state.spec, state.groups[kind]),
  };
})();
