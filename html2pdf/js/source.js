/* Slop HTML to PDF: reads the HTML the person gave us. Parsed inertly (DOMParser runs no script and loads nothing).
 * Maps relative image paths to attached files by file name, then SlopSanitize (shared/sanitize) removes scripts,
 * handlers, frames, links and everything that would load from the network (remote images, url() and @import).
 * Classic script. Exposes window.H2P.source. */
(function () {
  'use strict';
  const SRC_ATTRS = { src: 1, 'xlink:href': 1 };

  /** A relative reference: no scheme, not a fragment, not a site-root or protocol-relative path. */
  const isRelative = (u) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(String(u).trim());

  /** The file name a reference points at: 'images/a%20b.png?x=1' gives 'a b.png'. */
  function baseName(u) {
    let s = String(u).split(/[?#]/)[0];
    try { s = decodeURIComponent(s); } catch (e) { /* keep the raw text */ }
    return s.split(/[\\/]/).pop().trim();
  }

  /** CSS: no @import (it would fetch), and url() to an attached file becomes its blob URL. */
  function rewriteCss(css, images) {
    return String(css)
      .replace(/@import[^;]*;?/gi, '')
      .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, u) => {
        const t = u.trim();
        if (!isRelative(t)) return m;
        const blob = images.get(baseName(t));
        return blob ? `url("${blob}")` : m;
      });
  }

  /** Cleans the HTML. images: Map of file name to blob URL. Returns { styles, body } for the sheet. */
  function prepare(html, images = new Map()) {
    const S = window.SlopSanitize;
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const styles = [...doc.querySelectorAll('style')].map((s) => {
      const css = S.css(rewriteCss(s.textContent, images), 'local');
      s.remove();
      return `<style>${css}</style>`;
    }).join('');
    // An attached file by name becomes its blob URL first; the sanitiser then drops every other reference.
    for (const n of doc.body.querySelectorAll('*')) {
      const tag = n.tagName.toLowerCase();
      for (const a of [...n.attributes]) {
        const name = a.name.toLowerCase(), v = a.value.trim();
        if (name === 'style') n.setAttribute(a.name, rewriteCss(a.value, images));
        else if ((SRC_ATTRS[name] || (name === 'href' && tag === 'image')) && isRelative(v) && images.has(baseName(v))) n.setAttribute(a.name, images.get(baseName(v)));
      }
    }
    return { styles, body: S.html(doc.body.innerHTML, { urls: 'local', links: false }) };
  }

  window.H2P = Object.assign(window.H2P || {}, { source: { prepare, rewriteCss, baseName, isRelative } });
})();
