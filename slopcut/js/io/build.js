/* SlopCut: "Download app (offline .html)". Builds one self-contained HTML file: every stylesheet and
   script listed with data-src in index.html is inlined (the vendored muxers too). Slop Hub is left out,
   because Slop Drive belongs to the website's origin; the shared command palette (SlopCmd) is inlined with all its parts. */
(function () {
  'use strict';
  const SE = window.SE;
  const B = SE.build = {};
  const root = () => (window.SlopHub ? SlopHub.ROOT : new URL('../', location.href).href);
  const esc = (code) => code.replace(/<\/(script|style)/gi, '<\\/$1');
  async function text(rel) { const r = await fetch(new URL(rel, root()).href, { cache: 'no-store' }); if (!r.ok) throw new Error('Could not load ' + rel); return r.text(); }
  async function optional(rel) { try { return await text(rel); } catch (e) { return null; } }

  /** Build the offline HTML string from the deployed sources. */
  B.make = async function () {
    let html = await text('slopcut/index.html');
    const files = new Map();
    for (const m of html.matchAll(/data-src="([^"]+)"/g)) if (!files.has(m[1]) && m[1] !== 'shared/hub.js') files.set(m[1], await text(m[1]));
    // the string tables: the copy runs in English (i18n.js fetches nothing in it), so the English parts and the shared
    // words follow slopcut/i18n/index.js inline
    const parts = (/parts:\s*\[([^\]]*)\]/.exec(files.get('slopcut/i18n/index.js') || '') || [])[1];
    const list = (src) => (src ? src.split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean) : []);
    // the shared components' English parts (UI_PARTS in i18n.js: the video lists, graphics and presets words among them)
    const uiParts = list((/\/\*ui-parts\*\/\{\s*parts:\s*\[([^\]]*)\]/.exec(files.get('shared/i18n/i18n.js') || '') || [])[1]);
    const tables = parts ? ['shared/i18n/ui/en.js'].concat(uiParts.map((x) => 'shared/i18n/ui/en/' + x + '.js'), list(parts).map((x) => 'slopcut/i18n/en/' + x + '.js')) : [];
    for (const t of tables) files.set(t, await text(t));
    html = html.replace(/^[^\n]*data-offline="strip"[^\n]*\n/gm, () => '');
    html = html.replace(/<link\b[^>]*\bdata-src="([^"]+)"[^>]*>/g, (m, p) => '<style data-src="' + p + '">\n' + esc(files.get(p) || '') + '\n</style>');
    html = html.replace(/<script\b[^>]*\bdata-src="([^"]+)"[^>]*><\/script>/g, (m, p) => {
      if (p === 'shared/hub.js') return '';
      const app = (/\sdata-app="([^"]+)"/.exec(m) || [])[1];   // theme.js reads its app id from this attribute
      let out = '<script data-src="' + p + '"' + (app ? ' data-app="' + app + '"' : '') + '>\n' + esc(files.get(p) || '') + '\n</script>';
      if (p === 'shared/slopui.js') out = '<script>window.SE = { offline: true };</script>\n' + out;
      if (p === 'slopcut/i18n/index.js') out += tables.map((t) => '\n<script data-src="' + t + '">\n' + esc(files.get(t)) + '\n</script>').join('');
      return out;
    });
    const fav = await optional('favicon.svg');
    if (fav) html = html.replace(/href="\.\.\/favicon\.svg"/, () => 'href="data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(fav))) + '"');
    html = html.replace(/href="\.\.\/"/g, () => 'href="https://slopographic.com/"');
    html = html.replace('<head>', () => '<head>\n  <meta name="slopedit-build" content="offline">');
    return html;
  };
  SE.act.downloadApp = async function () {
    if (SE.offline) { SlopUI.toast(SE.util.t('slopedit.io.this_is_already_the_offline')); return; }
    try {
      SE.app.status(SE.util.t('slopedit.io.building_the_offline_app'));
      const html = await B.make();
      SlopUI.download(new Blob([html], { type: 'text/html' }), 'slopedit.html');
      SE.app.status(SE.util.t('slopedit.io.downloaded', { kb: Math.round(html.length / 1024) }));
    } catch (e) { SlopUI.alert(SE.util.t('slopedit.io.download_app'), SE.util.t('slopedit.io.build_failed', { error: e.message })); }
  };
})();
