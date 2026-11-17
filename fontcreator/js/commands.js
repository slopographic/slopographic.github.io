/* Slop Font: SlopCmd commands (Ctrl+K, the shortcut editor) for the page's own actions, the same functions as the
 * buttons, and what the assistant gets: the app state, the "Undo all AI changes" checkpoint (the whole project), a
 * picture of the font for look_at_canvas (snapshot), and the commands with arguments (js/ai-commands.js, loaded by
 * SlopCmd.prepare() when the AI panel, a macro or WebMCP first asks). Classic script, after main.js.
 *   FC.commands.specimen() → canvas   the current glyph large and every drawn glyph in lines */
(function (g) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const load = (src) => new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: new URL(src, HERE).href });
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
  function specimen() {
    const FC = g.FC, p = FC.state.project(), m = p.metrics, c = document.createElement('canvas'), W = 1200, H = 760;
    c.width = W; c.height = H;
    const x = c.getContext('2d'), P = g.SlopFont.paths, draw = (gl, ox, base, size) => {
      if (!gl.contours.length) return;
      FC.editorDraw.trace(x, P.orient(gl.contours), { z: size / m.upm, ox, oy: base }); x.fillStyle = '#111'; x.fill('nonzero');
    };
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#555'; x.font = '18px system-ui, sans-serif';
    x.fillText(`${p.info.family} ${p.info.style} · ${g.SlopFont.model.stats(p).drawn} glyphs drawn · ${p.metrics.upm} units per em`, 24, 34);
    const cur = FC.state.view(), big = 300, bz = big / m.upm, base0 = 60 + m.ascender * bz;
    x.strokeStyle = '#bbb';
    for (const v of [0, m.xHeight, m.capHeight]) { x.beginPath(); x.moveTo(24, base0 - v * bz); x.lineTo(24 + Math.max(cur.advance, 200) * bz, base0 - v * bz); x.stroke(); }
    draw(cur, 24, base0, big);
    const drawn = p.glyphs.filter((gl) => gl.contours.length && gl.id !== '.notdef'), size = 56, z = size / m.upm;
    let ox = 420, base = 60 + m.ascender * z;
    for (const gl of drawn) {
      if (ox + gl.advance * z > W - 24) { ox = 420; base += (m.ascender - m.descender) * z + 8; }
      if (base > H - 10) break;
      draw(gl, ox, base, size); ox += gl.advance * z;
    }
    return c;
  }
  /** What the assistant reads with app_state: the font, the glyph on screen, which characters are drawn and which not. */
  function state() {
    const FC = g.FC, S = FC.state, p = S.project(), CS = g.SlopFont.charset, M = g.SlopFont.model;
    const ch = (gl) => (gl.unicode != null ? CS.label(gl.unicode) : gl.name);
    const v = S.view(), sd = M.sides(v), st = M.stats(p);
    return { app: 'Slop Font', family: p.info.family, style: p.info.style, weight: p.info.weight, license: p.info.license ? p.info.license.slice(0, 120) : '',
      metrics: p.metrics, glyphs: st.glyphs, drawn: p.glyphs.filter((gl) => gl.contours.length && gl.id !== '.notdef').map(ch).slice(0, 400),
      notDrawn: p.glyphs.filter((gl) => !gl.contours.length && gl.id !== '.notdef' && gl.unicode !== 0x20).map(ch).slice(0, 200),
      current: { char: ch(v), name: v.name, code: v.unicode != null ? CS.hex(v.unicode) : null, advance: v.advance, lsb: sd.lsb, rsb: sd.rsb, contours: v.contours.length, inFont: !v.virtual },
      kerningPairs: st.pairs, view: S.settings().tab, exportFormat: S.settings().format,
      units: 'Font units: y up, baseline at 0, ' + p.metrics.upm + ' units per em; cap height ' + p.metrics.capHeight + ', x-height ' + p.metrics.xHeight + '.' };
  }
  function init() {
    const C = g.SlopCmd, FC = g.FC;
    if (!C || !FC || !FC.state) return;
    C.init({ app: 'fontcreator' });
    const S = FC.state, drawn = () => g.SlopFont.model.stats(S.project()).drawn > 0, t = FC.t;
    const safe = (fn) => () => Promise.resolve().then(fn).catch((e) => g.SlopUI.toast(e.message));
    // built on every call (registration and each language change), so the palette reads the current language
    const all = () => {
    const G = { file: t('menu.file'), edit: t('menu.edit'), view: t('menu.view'), tools: t('fontcreator.cmd.group_tools'), path: t('fontcreator.cmd.group_path'), glyph: t('fontcreator.cmd.group_glyph') };
    const tool = (id, key) => ({ id: 'fontcreator.tool-' + id, title: t('fontcreator.cmd.tool', { tool: t(`fontcreator.tool.${id}`) }), group: G.tools, keys: [key], run: () => FC.tools.set(id) });
    return [
      { id: 'fontcreator.new', title: t('fontcreator.cmd.new'), group: G.file, keywords: ['create', 'blank', 'start'], run: safe(() => FC.main.newFont()) },
      { id: 'fontcreator.open', title: t('fontcreator.cmd.open'), group: G.file, keys: ['Mod+O'], keywords: ['ttf', 'otf', 'woff', 'import', 'edit font'], run: () => g.SlopIntake.pick({ to: 'fontcreator' }) },
      { id: 'fontcreator.download', title: t('fontcreator.cmd.download'), group: G.file, keywords: ['export', 'ttf', 'otf', 'woff2', 'save'], when: drawn, run: safe(() => FC.io.download()) },
      { id: 'fontcreator.drive', title: t('fontcreator.cmd.drive'), group: G.file, when: drawn, run: safe(() => FC.io.saveToDrive()) },
      { id: 'fontcreator.save-project', title: t('fontcreator.cmd.save_project'), group: G.file, keys: ['Mod+S'], keywords: ['sfont', 'keep'], run: safe(() => FC.io.saveToDrive('sfont')) },
      { id: 'fontcreator.download-project', title: t('fontcreator.cmd.download_project'), group: G.file, run: safe(() => FC.io.download('sfont')) },
      { id: 'fontcreator.css', title: t('fontcreator.cmd.css'), group: G.file, keywords: ['web font', 'css'], run: safe(() => FC.io.copyCss()) },
      { id: 'fontcreator.undo', title: t('ui.undo'), group: G.edit, keys: ['Mod+Z'], when: () => S.canUndo(), run: () => S.undo() },
      { id: 'fontcreator.redo', title: t('ui.redo'), group: G.edit, keys: ['Mod+Shift+Z', 'Mod+Y'], when: () => S.canRedo(), run: () => S.redo() },
      { id: 'fontcreator.union', title: t('fontcreator.cmd.union'), group: G.path, keywords: ['boolean', 'join', 'merge'], run: safe(() => FC.ops.boolean('union')) },
      { id: 'fontcreator.subtract', title: t('fontcreator.cmd.subtract'), group: G.path, keywords: ['boolean', 'cut', 'minus'], run: safe(() => FC.ops.boolean('minus')) },
      { id: 'fontcreator.intersect', title: t('fontcreator.cmd.intersect'), group: G.path, keywords: ['boolean'], run: safe(() => FC.ops.boolean('intersect')) },
      { id: 'fontcreator.merge', title: t('fontcreator.cmd.merge'), group: G.path, keywords: ['merge', 'union all', 'clean'], run: safe(() => FC.ops.merge()) },
      { id: 'fontcreator.flip-h', title: t('fontcreator.cmd.flip_h'), group: G.path, run: safe(() => FC.ops.flip('h')) },
      { id: 'fontcreator.flip-v', title: t('fontcreator.cmd.flip_v'), group: G.path, run: safe(() => FC.ops.flip('v')) },
      { id: 'fontcreator.svg', title: t('fontcreator.cmd.svg'), group: G.glyph, keywords: ['import svg', 'paste path'], run: () => FC.svgUi.open() },
      { id: 'fontcreator.trace', title: t('fontcreator.cmd.trace'), group: G.glyph, keywords: ['handwriting', 'image', 'scan'], run: safe(() => FC.traceUi.pick()) },
      { id: 'fontcreator.sheet', title: t('fontcreator.cmd.sheet'), group: G.glyph, keywords: ['template', 'pdf', 'handwriting'], run: () => FC.sheetUi.template() },
      { id: 'fontcreator.sheet-read', title: t('fontcreator.cmd.sheet_read'), group: G.glyph, keywords: ['scan', 'photo', 'handwriting'], run: safe(() => FC.sheetUi.pick()) },
      { id: 'fontcreator.prev', title: t('fontcreator.cmd.prev'), group: G.glyph, keys: ['Mod+['], run: () => FC.toolbar.step(-1) },
      { id: 'fontcreator.next', title: t('fontcreator.cmd.next'), group: G.glyph, keys: ['Mod+]'], run: () => FC.toolbar.step(1) },
      { id: 'fontcreator.view-draw', title: t('fontcreator.cmd.view_draw'), group: G.view, run: () => FC.main.tab('draw') },
      { id: 'fontcreator.view-kerning', title: t('fontcreator.cmd.view_kerning'), group: G.view, keywords: ['pairs', 'spacing'], run: () => FC.main.tab('kerning') },
      { id: 'fontcreator.view-test', title: t('fontcreator.cmd.view_test'), group: G.view, keywords: ['preview', 'tester', 'specimen'], run: () => FC.main.tab('test') },
      { id: 'fontcreator.fit', title: t('fontcreator.cmd.fit'), group: G.view, keys: ['Mod+0'], run: () => FC.editor.fit() },
      tool('select', 'V'), tool('pen', 'P'), tool('rect', 'R'), tool('ellipse', 'E'), tool('stroke', 'S'),
    ];
    };
    C.register(all());
    FC.onLang(() => C.register(all()));
    C.provide({
      prepare: () => (g.SlopCmdSources ? Promise.resolve() : load('../../shared/commands/sources.js')).then(() => (C.get('fontcreator.ai.new-font') ? null : load('ai-commands.js')))
        .then(() => (C.get('fontcreator.ai.draw-strokes') ? null : load('ai-commands-2.js'))),
      state,
      checkpoint: () => { const snap = S.snapshot(); return () => S.restore(snap); },
      snapshot: () => specimen(),
    });
  }
  g.FC.commands = { specimen, state };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
