/* SlopSanitize: the one place that makes content from files, links and the clipboard safe to show. Every app that puts
 * markup it did not write into a page (an email body, an HTML file, an SVG) goes through html() or svg(); every link or
 * image address taken from a file goes through url(); keys read from a file go through safeKey()/own()/parseJson();
 * XML from a file goes through xmlText() first. Classic script (window.SlopSanitize) that modules may also import (it
 * then sets globalThis.SlopSanitize); Node tests read module.exports. html() and svg() need DOMPurify
 * (vendor/dompurify/purify.min.js, loaded before this file); the rest is pure.
 *
 *   url(href, kind)          the address cleaned, or '' when it may not be used. kind:
 *                              'link'  http, https, mailto, tel, in-page (#) and relative addresses
 *                              'image' http, https, data:image/…, blob:, cid: (a mail part) and relative addresses
 *                              'local' data:image/…, blob:, cid: and # only (nothing that loads from the network)
 *                            Browsers drop tabs and newlines anywhere in an address and control characters and spaces
 *                            at its ends, so the scheme is read after the same cleaning (java\tscript: is javascript:).
 *   css(text, kind)          CSS without script (expression(), javascript:, behaviors, bindings); with kind 'local' also
 *                            without @import and with every url() that is not data:/blob:/# set to none
 *   html(dirty, o)           sanitised HTML (DOMPurify: no scripts, handlers, frames, objects or forms that submit).
 *                            o.urls 'local' (default) or 'web' (images and styles may load from http/https);
 *                            o.links false drops link addresses (the text stays); o.whole true keeps <head> styles
 *                            and returns a whole <html> document. Links keep target="_blank" with rel="noopener".
 *   svg(dirty, o)            sanitised SVG markup (SVG and SVG filter elements only), same o.urls
 *   ready(src?)              Promise of SlopSanitize once DOMPurify is loaded: loads it from src (a module passes
 *                            new URL('…/vendor/dompurify/purify.min.js', import.meta.url)) or next to this script
 *   safeKey(k) / own(o, k)   false for __proto__, constructor and prototype; own: an own, safe property
 *   parseJson(text)          JSON.parse without __proto__, constructor or prototype keys at any depth
 *   xmlText(text)            the XML text, or throws when its DOCTYPE declares entities that could expand without limit
 *                            (nested or parameter entities, more than 64, or more than 4 million characters expanded) */
(function (root, factory) {
  const api = root.SlopSanitize || globalThis.SlopSanitize || factory(root);
  root.SlopSanitize = globalThis.SlopSanitize = api;   // the same object for classic scripts and modules
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  // ---- addresses ----
  const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
  const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i;
  const ALLOW = {
    link: { http: 1, https: 1, mailto: 1, tel: 1 },
    image: { http: 1, https: 1, blob: 1, cid: 1 },
    local: { blob: 1, cid: 1 },
  };
  /** The address as a browser reads it: no tabs or newlines anywhere, no control characters or spaces at the ends. */
  const clean = (s) => String(s).replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');

  function url(href, kind) {
    if (href == null) return '';
    const k = ALLOW[kind] ? kind : 'link';
    const u = clean(href);
    if (u === '') return '';
    if (/[\u0000-\u001f\u007f]/.test(u)) return '';
    const m = SCHEME.exec(u);
    if (m) {
      const scheme = m[1].toLowerCase();
      if (scheme === 'data') return k !== 'link' && DATA_IMAGE.test(u) ? u : '';
      return ALLOW[k][scheme] ? u : '';
    }
    if (k === 'local') return u[0] === '#' ? u : '';
    return u; // relative, in-page or protocol-relative (//host: https on this site)
  }

  // ---- CSS ----
  const CSS_SCRIPT = /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|\bbehavior\s*:/i;
  /** CSS with its escapes resolved (u\72l( is url(, \65 xpression is expression), to see what a browser would read. */
  const unescapeCss = (s) => s.replace(/\\([0-9a-f]{1,6}\s?|[^\n0-9a-f])/gi, (m, c) => {
    if (!/^[0-9a-f]/i.test(c)) return c;
    const cp = parseInt(c, 16);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '\ufffd';
  });
  function css(text, kind) {
    const local = kind === 'local';
    let s = String(text == null ? '' : text);
    if (s.includes('\\')) {
      // escapes are kept (a string such as "\201C" needs them) unless the unescaped text holds something blocked
      const u = unescapeCss(s);
      if (CSS_SCRIPT.test(u) || (local && /@import|url\s*\(|image-set\s*\(/i.test(u))) s = u;
    }
    s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(new RegExp(CSS_SCRIPT.source, 'gi'), 'x-');
    if (local) {
      s = s.replace(/@import[^;]*;?/gi, '').replace(/(-webkit-)?image-set\s*\((?:[^()]|\([^()]*\))*\)/gi, 'none')
        .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, u) => (url(u, 'local') ? m : 'none'));
    }
    return s.replace(/<\/(style)/gi, '<\\/$1');
  }

  // ---- HTML and SVG (DOMPurify) ----
  const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background', 'cite', 'data',
    'codebase', 'longdesc', 'lowsrc', 'dynsrc', 'ping', 'manifest', 'icon']);
  const SRCSET = new Set(['srcset', 'imagesrcset']);
  const instances = new Map();

  function purifier(urls, links) {
    const P = root.DOMPurify;
    if (!P || typeof P !== 'function') throw new Error('SlopSanitize needs DOMPurify (vendor/dompurify/purify.min.js).');
    const key = urls === 'web' ? 'web' : 'local', id = key + (links === false ? ':nolinks' : '');
    if (instances.has(id)) return instances.get(id);
    const D = P(root);
    if (!D.isSupported) throw new Error('This browser cannot sanitise HTML.');
    const imgKind = key === 'web' ? 'image' : 'local';
    D.addHook('uponSanitizeElement', (node, data) => {
      if (data.tagName === 'style' && node.textContent) node.textContent = css(node.textContent, key);
    });
    D.addHook('uponSanitizeAttribute', (node, data) => {
      const name = data.attrName, tag = (node.nodeName || '').toLowerCase();
      if (name === 'style') { data.attrValue = css(data.attrValue, key); return; }
      if (SRCSET.has(name)) {
        const ok = String(data.attrValue).split(',').every((part) => url(part.trim().split(/\s+/)[0], imgKind));
        if (!ok) data.keepAttr = false;
        return;
      }
      if (!URL_ATTRS.has(name)) return;
      let kind;
      if (tag === 'use' || tag === 'feimage') kind = String(data.attrValue).trim()[0] === '#' ? 'local' : null;
      else if ((tag === 'a' || tag === 'area') && name === 'href') kind = links === false ? null : 'link';
      else if (name === 'action' || name === 'formaction' || name === 'ping' || name === 'codebase' || name === 'manifest') kind = null;
      else kind = imgKind;
      const v = kind ? url(data.attrValue, kind) : '';
      if (!v) data.keepAttr = false; else data.attrValue = v;
    });
    D.addHook('afterSanitizeAttributes', (node) => {
      if (node.nodeName === 'A' && node.hasAttribute('target')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    instances.set(id, D);
    return D;
  }

  const BASE = {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['form', 'meta', 'link', 'base', 'noscript', 'noembed', 'noframes', 'template', 'portal'],
    FORBID_ATTR: ['action', 'formaction', 'ping', 'srcdoc'],
    ALLOW_DATA_ATTR: false,
  };

  function run(dirty, o, extra) {
    const D = purifier(o && o.urls, o && o.links);
    return D.sanitize(String(dirty == null ? '' : dirty), Object.assign({}, BASE, extra));
  }
  const html = (dirty, o = {}) => run(dirty, o, o.whole ? { WHOLE_DOCUMENT: true } : {});
  const svg = (dirty, o = {}) => run(dirty, o, { USE_PROFILES: { svg: true, svgFilters: true }});

  const ME = typeof document !== 'undefined' && document.currentScript && document.currentScript.src;
  let loading = null;
  function ready(src) {
    if (root.DOMPurify) return Promise.resolve(api);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const href = src || (ME ? new URL('../../vendor/dompurify/purify.min.js', ME).href : '');
        const fail = (why) => { loading = null; reject(new Error(why)); };
        if (!href || typeof document === 'undefined') { fail('DOMPurify is not loaded.'); return; }
        const el = document.createElement('script');
        el.src = href;
        el.onload = () => (root.DOMPurify ? resolve(api) : fail('DOMPurify did not load.'));
        el.onerror = () => fail('Could not load ' + href);
        document.head.append(el);
      });
    }
    return loading;
  }

  // ---- keys ----
  const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const safeKey = (k) => !BAD_KEYS.has(String(k));
  const own = (o, k) => o != null && safeKey(k) && Object.prototype.hasOwnProperty.call(o, k);
  const parseJson = (text) => JSON.parse(String(text), (k, v) => (BAD_KEYS.has(k) ? undefined : v));

  // ---- XML ----
  const MAX_ENTITIES = 64, MAX_EXPANDED = 4e6;
  function xmlText(text) {
    const s = String(text == null ? '' : text);
    const start = s.search(/<!DOCTYPE/i);
    if (start < 0) return s;
    const decls = s.slice(start).match(/<!ENTITY[\s\S]*?>/gi) || [];
    if (!decls.length) return s;
    const refuse = () => { throw new Error('This file declares XML entities that could expand without limit, so it was not opened.'); };
    if (decls.length > MAX_ENTITIES) refuse();
    let total = 0;
    for (const d of decls) {
      const m = /^<!ENTITY\s+(%\s+)?([^\s]+)\s+(?:(["'])([\s\S]*?)\3|(SYSTEM|PUBLIC)\b)/i.exec(d);
      if (!m || m[1] || m[5]) refuse();          // parameter or external entities
      if (/[&%]/.test(m[4])) refuse();           // an entity made of entities
      const uses = s.split('&' + m[2] + ';').length - 1;
      total += uses * m[4].length;
      if (total > MAX_EXPANDED) refuse();
    }
    return s;
  }

  const api = { url, css, html, svg, ready, safeKey, own, parseJson, xmlText };
  return api;
});
