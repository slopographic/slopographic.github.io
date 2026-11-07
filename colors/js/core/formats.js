/* Slop Colors: a palette as text files, and back. A palette is { name, colors: [{ hex: '#rrggbb', name? }] }. Pure; the
 * factory takes the convert module (colors/js/core/convert.js). The binary ASE file is colors/js/core/ase.js.
 *   slug(text)                     a CSS-safe name: "Sea Blue" → "sea-blue"
 *   names(palette) → [name]        each colour's name for code: its own (slugged) or 100, 200… in order, made unique
 *   toCss(p)   :root { --<palette>-<name>: #hex; }        toTailwind(p)  a tailwind.config.js colors block
 *   toJson(p)  { name, colors: [{ name, hex, rgb, hsl, oklch }] }   toGpl(p)  a GIMP palette (.gpl)
 *   fromGpl(text), fromJson(text), fromCss(text) → palette (throws an Error with a plain reason)
 *   FORMATS   [{ id, label, ext, mime }]: css, tailwind, json, gpl, ase (ase is binary: see ase.js) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopColors = root.SlopColors || {}).formats = factory(root.SlopColors.convert);
})(typeof window !== 'undefined' ? window : globalThis, function (C) {
  'use strict';
  const FORMATS = [
    { id: 'css', label: 'CSS variables (.css)', ext: 'css', mime: 'text/css' },
    { id: 'tailwind', label: 'Tailwind config (.js)', ext: 'js', mime: 'text/javascript' },
    { id: 'json', label: 'JSON (.json)', ext: 'json', mime: 'application/json' },
    { id: 'ase', label: 'Adobe Swatch Exchange (.ase)', ext: 'ase', mime: 'application/octet-stream' },
    { id: 'gpl', label: 'GIMP palette (.gpl)', ext: 'gpl', mime: 'text/plain' },
  ];
  const slug = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const pname = (p) => slug(p && p.name) || 'palette';
  function names(p) {
    const seen = new Set();
    return (p.colors || []).map((c, i) => {
      let n = slug(c.name) || String((i + 1) * 100), k = 2;
      const base = n;
      while (seen.has(n)) n = `${base}-${k++}`;
      seen.add(n);
      return n;
    });
  }
  function toCss(p) {
    const ns = names(p), pre = pname(p);
    return `/* ${p.name || 'Palette'}: made with Slop Colors */\n:root {\n${p.colors.map((c, i) => `  --${pre}-${ns[i]}: ${c.hex};`).join('\n')}\n}\n`;
  }
  const key = (s) => (/^[a-z_$][\w$]*$/i.test(s) ? s : `'${s}'`);
  function toTailwind(p) {
    const ns = names(p);
    return `/** ${p.name || 'Palette'}: made with Slop Colors. Merge into tailwind.config.js. @type {import('tailwindcss').Config} */\n`
      + `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        ${key(pname(p))}: {\n`
      + p.colors.map((c, i) => `          ${key(ns[i])}: '${c.hex}',`).join('\n') + '\n        },\n      },\n    },\n  },\n};\n';
  }
  function toJson(p) {
    const ns = names(p);
    return JSON.stringify({ name: p.name || 'Palette', colors: p.colors.map((c, i) => ({ name: c.name || ns[i], hex: c.hex, rgb: C.format(c.hex, 'rgb'), hsl: C.format(c.hex, 'hsl'), oklch: C.format(c.hex, 'oklch') })) }, null, 2) + '\n';
  }
  function toGpl(p) {
    const lines = ['GIMP Palette', `Name: ${String(p.name || 'Palette').replace(/[\r\n]+/g, ' ')}`, `Columns: ${Math.min(16, p.colors.length || 1)}`, '#'];
    for (const c of p.colors) { const [r, g, b] = C.rgbOf(c.hex); lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${c.name || c.hex}`); }
    return lines.join('\n') + '\n';
  }
  const done = (name, colors) => {
    if (!colors.length) throw new Error('No colours were found in the file');
    return { name: name || 'Palette', colors: colors.slice(0, 256) };
  };
  function fromGpl(text) {
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    if (!/^GIMP Palette/i.test(lines[0] || '')) throw new Error('This is not a GIMP palette (the first line is not "GIMP Palette")');
    let name = '';
    const colors = [];
    for (const l of lines.slice(1)) {
      const m = /^Name:\s*(.*)$/i.exec(l);
      if (m) { name = m[1].trim(); continue; }
      const c = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*(.*)$/.exec(l);
      if (c) { const hex = C.hexOf([+c[1], +c[2], +c[3]]), label = c[4].trim(); colors.push(label && label !== hex && !/^untitled$/i.test(label) ? { hex, name: label } : { hex }); }
    }
    return done(name, colors);
  }
  const entry = (v, nm) => { const hex = C.parse(typeof v === 'string' ? v : v && (v.hex || v.color || v.value)); return hex ? (nm ? { hex, name: String(nm) } : { hex }) : null; };
  function fromJson(text) {
    let j;
    try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { throw new Error('This is not valid JSON'); }
    const list = Array.isArray(j) ? j : Array.isArray(j.colors) ? j.colors : null;
    let colors = [];
    if (list) colors = list.map((v) => entry(v, v && typeof v === 'object' ? v.name : '')).filter(Boolean);
    else if (j && typeof j === 'object') colors = Object.entries(j.colors && typeof j.colors === 'object' ? j.colors : j).map(([k, v]) => entry(v, k)).filter(Boolean);
    return done(!Array.isArray(j) && j.name, colors);
  }
  function fromCss(text) {
    const colors = [];
    for (const m of String(text).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) { const e = entry(m[2].trim(), m[1]); if (e) colors.push(e); }
    const name = (/\/\*\s*([^:*]+?)\s*:/.exec(String(text)) || [])[1];
    return done(name, colors);
  }
  return { FORMATS, slug, names, toCss, toTailwind, toJson, toGpl, fromGpl, fromJson, fromCss };
});
