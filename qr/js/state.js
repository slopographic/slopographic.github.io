/* QR SLOP: the state of one code, as plain data. No DOM, so the node tests run it.
 * kind (one of payload.js TYPES), values (the form values, per kind), raw (the text typed in the Raw tab, or null when the
 * form is the source), style, logo and label. snapshot() and restore() make the settings record that is saved beside the
 * PNG in Slop Drive. Classic script; exposes window.QRState. */
(function (g) {
  'use strict';
  if (g.QRState) return;
  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (node tests, other pages). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const P = g.QRPayload, R = g.QRRender;
  const SHAPES = ['square', 'round'];
  const DATA_IMG = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
  const copy = (o) => JSON.parse(JSON.stringify(o));

  const DEFAULT_STYLE = { size: 512, quiet: 4, ec: 'M', fg: '#000000', fg2: '#1f3fff', gradient: false, shape: 'square', bg: '#ffffff', transparent: false };
  const DEFAULT_LOGO = { href: null, name: '', mark: '', frac: 0.2 };

  const S = { kind: 'text', values: {}, raw: null, style: copy(DEFAULT_STYLE), logo: copy(DEFAULT_LOGO), label: '' };

  const vals = (kind = S.kind) => (S.values[kind] = S.values[kind] || {});
  /** Any edit to the form ends the raw override: the form is the source again. */
  function setValue(k, v) { vals()[k] = v; S.raw = null; }
  function setKind(kind) { if (P.TYPES.includes(kind)) { S.kind = kind; S.raw = null; } }
  function setLabel(v) { S.label = String(v == null ? '' : v).slice(0, 80); }
  function clearRaw() { S.raw = null; }

  /** The text to encode and whether there is one. Raw text is encoded exactly as typed. */
  function encodedText() {
    if (S.raw !== null) return S.raw.length ? { ok: true, text: S.raw } : { ok: false, error: tr('qr.err.raw_empty', 'Type or paste the text to encode.') };
    return P.build(S.kind, vals());
  }
  /** Options for the renderer. The logo forces error correction H, the highest level, so the code still scans. */
  function renderOpts() {
    const hasLogo = !!S.logo.href;
    return Object.assign({}, S.style, {
      size: R.clampSize(S.style.size), quiet: R.clampQuiet(S.style.quiet),
      ec: hasLogo ? 'H' : S.style.ec,
      logo: hasLogo ? { href: S.logo.href, frac: R.clampLogo(S.logo.frac) } : null,
    });
  }
  /** Raw text from the Raw tab: the form follows it when the kind allows, and the text is kept as typed. */
  function setRaw(text) {
    S.raw = String(text == null ? '' : text);
    const p = g.QRParse.parse(S.raw);
    S.kind = p.type;
    S.values[p.type] = p.values;
  }
  /** A template fills the kind and the values. */
  function applyTemplate(id) {
    const t = g.QRTemplates.copy(id);
    if (!t) return false;
    S.kind = t.type; S.values[t.type] = t.values; S.raw = null;
    return true;
  }

  /** The settings record: plain JSON with the kind, values, raw text, style, logo and label. */
  function snapshot() {
    return {
      app: 'qr', v: 1, label: S.label, kind: S.kind, values: copy(vals()), raw: S.raw,
      style: copy(S.style), logo: copy(S.logo),
    };
  }
  /** Loads a settings record. Anything that does not check out keeps its default. Returns false when it is not a record. */
  function restore(o) {
    if (!o || typeof o !== 'object' || o.app !== 'qr') return false;
    const st = copy(DEFAULT_STYLE);
    const s = o.style && typeof o.style === 'object' ? o.style : {};
    st.size = R.clampSize(s.size);
    st.quiet = R.clampQuiet(s.quiet);
    st.ec = ['L', 'M', 'Q', 'H'].includes(s.ec) ? s.ec : st.ec;
    st.fg = R.colour(s.fg, st.fg); st.fg2 = R.colour(s.fg2, st.fg2); st.bg = R.colour(s.bg, st.bg);
    st.gradient = s.gradient === true; st.transparent = s.transparent === true;
    st.shape = SHAPES.includes(s.shape) ? s.shape : st.shape;
    const lg = o.logo && typeof o.logo === 'object' ? o.logo : {};
    const logo = copy(DEFAULT_LOGO);
    logo.href = DATA_IMG.test(String(lg.href || '')) ? lg.href : null;
    logo.name = String(lg.name || '').slice(0, 80);
    logo.mark = String(lg.mark || '').slice(0, 20);
    logo.frac = R.clampLogo(lg.frac);
    S.style = st; S.logo = logo;
    S.label = String(o.label || '').slice(0, 80);
    S.kind = P.TYPES.includes(o.kind) ? o.kind : 'text';
    S.values[S.kind] = o.values && typeof o.values === 'object' ? copy(o.values) : {};
    S.raw = typeof o.raw === 'string' ? o.raw : null;
    return true;
  }
  /** A task page's link, for this visit only (nothing is saved): ?type=wifi|vcard|url|… opens that form,
   *  ?tab=templates|content|design|logo|raw|batch opens that tab. Unknown values are ignored. */
  function presetOf(search) {
    const q = new URLSearchParams(search || ''), out = {}, type = q.get('type'), tab = q.get('tab');
    if (P.TYPES.includes(type)) out.kind = type;
    if (['templates', 'content', 'design', 'logo', 'raw', 'batch'].includes(tab)) out.tab = tab;
    return out;
  }
  /** Back to a new code: text, no logo, default style. */
  function reset() {
    S.kind = 'text'; S.values = {}; S.raw = null; S.style = copy(DEFAULT_STYLE); S.logo = copy(DEFAULT_LOGO); S.label = '';
  }

  g.QRState = Object.freeze({
    S, DEFAULT_STYLE, SHAPES, vals, setValue, setKind, setLabel, clearRaw, encodedText, renderOpts, setRaw, applyTemplate, snapshot, restore, reset, presetOf,
  });
})(typeof window !== 'undefined' ? window : globalThis);
