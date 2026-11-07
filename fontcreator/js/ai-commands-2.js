/* Slop Font for the assistant, part 2 (after ai-commands.js, loaded by the same prepare()). Font units, y up.
 *   draw_strokes     char, strokes [{ points: [[x, y]…], closed? } | { d }], width, cap, advance, add
 *                    a monoline glyph from centre lines (core/stroke.js): the quick way to a rounded or square font
 *   path_operation   char, op union | minus | intersect | exclude | merge, first [contour indexes], others [indexes]
 *   transform_glyph  char, dx, dy, scale, scaleY, flip none | h | v
 *   copy_glyph       from, to, add, dx, dy      (an accented letter: copy A to Å, then add ˚ above)
 *   remove_glyph, clear_glyph   char           subset_font  chars | set
 *   select_glyph     char                       show_view  view draw | kerning | test, text
 *   export_font      format ttf | otf | woff | woff2 | sfont, to drive | download | both
 *   get_css          the @font-face rule (read-only) */
(function (g) {
  'use strict';
  const C = g.SlopCmd, FC = g.FC, F = g.SlopFont;
  if (!C || C.get('fontcreator.ai.draw-strokes')) return;
  const S = FC.state, M = F.model, P = F.paths, CS = F.charset;
  const add = (tool, title, args, run, extra) => Object.assign({ id: 'fontcreator.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args,
    run: (a) => run(a || g.SlopCmdArgs.defaults(args)) }, extra);
  const CHAR = { name: 'char', type: 'string', required: true, maxLength: 40, description: 'the character, U+XXXX, or a glyph name' }; // i18n-ignore
  function glyphId(ch, make) {
    const k = String(ch || '').trim(), gl = M.find(S.project(), k);
    if (gl) { S.select(gl.id); return gl.id; }
    if (!make) throw new Error(`“${k}” is not in the font`);
    const cp = /^U\+[0-9A-F]{4,6}$/i.test(k) ? parseInt(k.slice(2), 16) : [...k].length === 1 ? k.codePointAt(0) : null;
    if (cp == null) throw new Error(`“${k}” is not a character`);
    S.select(cp);
    return CS.idOf(cp);
  }
  const said = (id) => { const gl = M.find(S.project(), id), sd = M.sides(gl); return { char: gl.unicode != null ? CS.label(gl.unicode) : gl.name, contours: gl.contours.length, advance: gl.advance, lsb: sd.lsb, rsb: sd.rsb }; };
  const IDX = (name, d) => ({ name, type: 'array', items: { type: 'number' }, maxItems: 200, description: d });
  C.register([
    add('draw_strokes', 'Draw a glyph from strokes', [CHAR, { name: 'strokes', type: 'array', required: true, maxItems: 100, // i18n-ignore
      items: { type: 'object', properties: { points: { type: 'array', items: { type: 'array', items: { type: 'number' } } }, closed: { type: 'boolean' }, d: { type: 'string' } } },
      description: 'centre lines: { points: [[x, y], …], closed? } or { d: "SVG path data" } (curves allowed), font units, y up' },
      { name: 'width', type: 'number', min: 1, max: 2000, default: 80, description: 'pen width in font units' }, // i18n-ignore
      { name: 'cap', type: 'enum', values: ['round', 'square', 'butt'], default: 'round', description: 'the ends of open strokes; joints are always round' },
      { name: 'advance', type: 'number', min: 0, max: 20000, description: 'the width (default: the outline plus equal side bearings)' }, // i18n-ignore
      { name: 'add', type: 'boolean', default: false }], (a) => {
      const id = glyphId(a.char, true), cs = F.stroke.outline(a.strokes || [], { width: a.width, cap: a.cap });
      if (!cs.length) throw new Error('The strokes made no outline: give at least one point per stroke');
      S.edit(`Draw ${a.char} with strokes`, { glyph: id }, (p, gl) => { // i18n-ignore
        gl.contours = a.add ? gl.contours.concat(cs) : cs;
        if (a.advance != null) gl.advance = Math.round(a.advance);
        else if (!a.add) { const b = P.bbox(gl.contours); gl.advance = Math.round(b.x + b.w + Math.max(0, b.x)); }
      });
      return said(id);
    }, { description: 'Draw a glyph as strokes of a round or square pen along centre lines: a monoline (rounded, monospace, stencil…) font.' }), // i18n-ignore
    add('path_operation', 'Combine a glyph\'s contours', [CHAR, { name: 'op', type: 'enum', values: ['merge', 'union', 'minus', 'intersect', 'exclude'], default: 'merge', // i18n-ignore
      description: 'merge removes every overlap; the others combine the first contours with the other ones' }, IDX('first', 'contour indexes, 0 = the first contour'), IDX('others', 'contour indexes')], (a) => { // i18n-ignore
      const id = glyphId(a.char), gl = M.find(S.project(), id);
      if (a.op === 'merge') { S.edit('Remove overlap', { glyph: id }, (p, x) => { x.contours = P.merge(x.contours); }); return said(id); } // i18n-ignore
      const first = (a.first || []).filter((i) => gl.contours[i]), others = (a.others || []).filter((i) => gl.contours[i] && !first.includes(i));
      if (!first.length || !others.length) throw new Error(`Give first and others: contour indexes from 0 to ${gl.contours.length - 1}`);
      const out = P.boolean(first.map((i) => gl.contours[i]), others.map((i) => gl.contours[i]), a.op);
      S.edit(`${a.op} contours`, { glyph: id }, (p, x) => { x.contours = x.contours.filter((_, i) => !first.includes(i) && !others.includes(i)).concat(out); });
      return said(id);
    }),
    add('transform_glyph', 'Move, scale or flip a glyph', [CHAR, { name: 'dx', type: 'number', min: -20000, max: 20000, default: 0 }, { name: 'dy', type: 'number', min: -20000, max: 20000, default: 0 }, // i18n-ignore
      { name: 'scale', type: 'number', min: 0.01, max: 100, default: 1, description: 'about the left end of the baseline' }, { name: 'scaleY', type: 'number', min: 0.01, max: 100, description: 'default: scale' }, // i18n-ignore
      { name: 'flip', type: 'enum', values: ['none', 'h', 'v'], default: 'none' }], (a) => {
      const id = glyphId(a.char);
      S.edit(`Transform ${a.char}`, { glyph: id }, (p, gl) => { // i18n-ignore
        let cs = P.scaleAt(gl.contours, a.scale || 1, a.scaleY || a.scale || 1, 0, 0);
        cs = P.move(cs, a.dx || 0, a.dy || 0);
        const b = P.bbox(cs);
        if (b && a.flip === 'h') cs = P.transform(cs, [-1, 0, 0, 1, 2 * b.x + b.w, 0]);
        if (b && a.flip === 'v') cs = P.transform(cs, [1, 0, 0, -1, 0, 2 * b.y + b.h]);
        gl.contours = cs;
      });
      return said(id);
    }),
    add('copy_glyph', 'Copy one glyph into another', [{ name: 'from', type: 'string', required: true, maxLength: 40 }, { name: 'to', type: 'string', required: true, maxLength: 40 }, // i18n-ignore
      { name: 'add', type: 'boolean', default: false, description: 'add on top (an accent) instead of replacing' }, { name: 'dx', type: 'number', min: -20000, max: 20000, default: 0 }, { name: 'dy', type: 'number', min: -20000, max: 20000, default: 0 }], (a) => { // i18n-ignore
      glyphId(a.to, true);
      FC.ops.copyFrom(a.from, { add: a.add, dx: a.dx, dy: a.dy });
      return said(S.cur());
    }, { description: 'Copy a glyph\'s outline (and width) into another, or add it on top moved by dx, dy: build Å from A and ˚.' }), // i18n-ignore
    add('remove_glyph', 'Remove a glyph from the font', [CHAR], (a) => { // i18n-ignore
      const id = glyphId(a.char);
      S.edit(`Remove ${a.char}`, 'project', (p) => M.remove(p, id)); // i18n-ignore
      return `${S.project().glyphs.length} glyphs left.`;
    }, { destructive: true }),
    add('clear_glyph', 'Clear a glyph\'s outline', [CHAR], (a) => { const id = glyphId(a.char); S.edit(`Clear ${a.char}`, { glyph: id }, (p, gl) => { gl.contours = []; }); return said(id); }, { destructive: true }), // i18n-ignore
    add('subset_font', 'Keep only some characters', [{ name: 'chars', type: 'string', maxLength: 5000 }, { name: 'set', type: 'enum', values: [...CS.SETS.map((s) => s.id), 'all'] }], (a) => { // i18n-ignore
      if (!a.chars && !a.set) throw new Error('Give chars or a set to keep');
      FC.panelMore.subset(a.set || a.chars);
      return `${S.project().glyphs.length} glyphs left.`;
    }, { destructive: true }),
    add('select_glyph', 'Show a glyph in the editor', [CHAR], (a) => { const id = glyphId(a.char, true); FC.main.tab('draw'); return said(M.find(S.project(), id) ? id : S.cur()) ; }), // i18n-ignore
    add('show_view', 'Show the editor, kerning or type test', [{ name: 'view', type: 'enum', values: ['draw', 'kerning', 'test'], default: 'test' }, // i18n-ignore
      { name: 'text', type: 'string', maxLength: 2000, description: 'the type test text' }], (a) => { // i18n-ignore
      if (a.text) S.set({ tester: Object.assign({}, S.settings().tester, { text: a.text }) });
      FC.main.tab(a.view || 'test');
      return `Showing ${a.view || 'test'}.`; // i18n-ignore
    }),
    add('export_font', 'Export the font', [{ name: 'format', type: 'enum', values: FC.io.FORMATS.map((f) => f.id), default: 'ttf' }, // i18n-ignore
      { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }], async (a) => {
      S.set({ format: a.format });
      const out = [];
      if (a.to !== 'download') { const r = await FC.io.saveToDrive(a.format); out.push(`Saved ${r.name} to Slop Drive (id ${r.id})`); } // i18n-ignore
      if (a.to !== 'drive') out.push(`downloaded ${await FC.io.download(a.format)}`);
      return out.join(' and ') + '.';
    }, { description: 'The font as TTF, OTF, WOFF or WOFF2 (or the .sfont project), to Slop Drive and/or a download.' }), // i18n-ignore
    add('get_css', 'The CSS @font-face rule', [], () => FC.io.css(), { readOnly: true }), // i18n-ignore
  ]);
})(window);
