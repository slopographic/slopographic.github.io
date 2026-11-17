/* SlopVector: the shared config kind 'document' for app 'vector' (shared/config, HANDOFF.md there). The file holds the
   artboard size and the layers (name, colour, hidden, locked) with their objects: rectangles, ellipses, paths and text,
   with a flat fill, stroke, stroke width and opacity. Groups are flattened. Gradients, effects, clipping masks, symbols and
   placed images are not in the file yet. Import replaces the open document after the person confirms. Adds the four
   Config actions to SV.actions (the File menu and the palette read them). Classic script. */
(function () {
  'use strict';
  const SV = window.SV, G = window.SVGeom, C = window.SlopConfig, D = window.SlopConfigDialog, F = C && C.F;
  const APP = 'vector';
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const solid = (c) => (typeof c === 'string' && HEX.test(c) ? c : null);

  /** One layer's objects as file objects (groups flattened, gradients and other paint left out). */
  function objectsOf(layer) {
    const out = [];
    const leaves = [];
    for (const c of layer.children || []) SV.leaves(c, leaves);
    for (const o of leaves) {
      const st = o.style || {};
      const base = { name: String(o.name || o.type).slice(0, 120), fill: solid(st.fill), stroke: solid(st.stroke), strokeWidth: r3(num(st.sw, 0)), opacity: r3(num(st.opacity, 1)) };
      if (o.type === 'rect') out.push(Object.assign({ type: 'rect', x: r3(num(o.x)), y: r3(num(o.y)), w: r3(num(o.w)), h: r3(num(o.h)) }, base));
      else if (o.type === 'ellipse') out.push(Object.assign({ type: 'ellipse', x: r3(num(o.cx)), y: r3(num(o.cy)), rx: r3(num(o.rx)), ry: r3(num(o.ry)) }, base));
      else if (o.type === 'path') out.push(Object.assign({ type: 'path', d: G.toD(o.subpaths || []).slice(0, 20000) }, base));
      else if (o.type === 'text') out.push(Object.assign({ type: 'text', x: r3(num(o.x)), y: r3(num(o.y)), text: String(o.text || '').slice(0, 2000) }, base));
    }
    return out;
  }

  function read() {
    const S = SV._core.S, doc = S.doc;
    return {
      artboard: { width: doc.width, height: doc.height },
      layers: doc.layers.map((l) => ({
        name: String(l.name || 'Layer').slice(0, 120), color: solid(l.color) || undefined,
        hidden: !!l.hidden, locked: !!l.locked, objects: objectsOf(l),
      })),
    };
  }

  /** The file's objects as document objects (SV.mk builds them, so the app's own factories shape them). */
  function objectFrom(o) {
    const mk = SV.mk;
    const style = { fill: o.fill || null, stroke: o.stroke || null, sw: o.strokeWidth || 0, opacity: o.opacity == null ? 1 : o.opacity };
    if (o.type === 'rect') return mk.rect(o.x, o.y, o.w, o.h, 0, style, o.name);
    if (o.type === 'ellipse') return mk.ellipse(o.x, o.y, o.rx, o.ry, style, o.name);
    if (o.type === 'path') return mk.d(o.d, style, o.name);
    return mk.text(o.x, o.y, o.text, { family: 'Inter Tight', size: 48, weight: 400 }, Object.assign({}, style, { fill: style.fill || '#000000' }), o.name);
  }

  function docFrom(data) {
    const doc = SV.newDoc(data.artboard.width, data.artboard.height, 'Imported'); // i18n-ignore: a name stored in the document
    doc.layers = data.layers.map((l) => {
      const layer = SV.mk.layer(l.name, l.color || '#4f8bff');
      layer.hidden = !!l.hidden; layer.locked = !!l.locked;
      layer.children = l.objects.map(objectFrom);
      return layer;
    });
    return doc;
  }

  async function apply(data, ctx) {
    const S = SV._core.S;
    if (window.SlopUI && S.doc && S.doc.layers.some((l) => l.children && l.children.length)) {
      const ok = await SlopUI.confirm(SV.t('vector.config.open_title'), SV.t('vector.config.replace', { name: ctx.name }), SV.t('menu.open'));
      if (!ok) return { ok: false, message: SV.t('vector.config.kept') };
    }
    const doc = docFrom(data);
    SV.loadDoc(doc, { fit: true, resetHistory: true });
    SV.commit('Import config');
  }

  const EXAMPLE = { kind: 'document', value: { artboard: { width: 800, height: 600 }, layers: [{ name: 'Shapes', color: '#4f8bff', hidden: false, locked: false, // i18n-ignore: sample config content
    objects: [{ type: 'rect', name: 'Card', x: 40, y: 40, w: 320, h: 200, fill: '#ffd24a', stroke: '#0a0a0a', strokeWidth: 4, opacity: 1 }] }] } }; // i18n-ignore: sample config content

  if (C && D && F && SV) {
    const obj = F.obj({
      type: F.enum(['rect', 'ellipse', 'path', 'text'], { required: true, desc: 'rect, ellipse, path (d holds SVG path data) or text' }), // i18n-ignore: config schema (API for config files and agents)
      name: F.str({ max: 120, desc: 'object name' }), // i18n-ignore: config schema (API for config files and agents)
      x: F.num({ min: -1e6, max: 1e6, desc: 'x (rect, text) or centre x (ellipse)' }), // i18n-ignore: config schema (API for config files and agents)
      y: F.num({ min: -1e6, max: 1e6, desc: 'y (rect, text) or centre y (ellipse)' }), // i18n-ignore: config schema (API for config files and agents)
      w: F.num({ min: 0, max: 1e6, desc: 'width (rect)' }), h: F.num({ min: 0, max: 1e6, desc: 'height (rect)' }),
      rx: F.num({ min: 0, max: 1e6, desc: 'horizontal radius (ellipse)' }), ry: F.num({ min: 0, max: 1e6, desc: 'vertical radius (ellipse)' }), // i18n-ignore: config schema (API for config files and agents)
      d: F.text({ max: 20000, desc: 'SVG path data such as M0 0L100 0L100 100Z (path)' }), // i18n-ignore: config schema (API for config files and agents)
      text: F.text({ max: 2000, desc: 'the words (text)' }), // i18n-ignore: config schema (API for config files and agents)
      fill: F.str({ max: 7, pattern: HEX, desc: 'fill colour #rrggbb, or leave out for none' }), // i18n-ignore: config schema (API for config files and agents)
      stroke: F.str({ max: 7, pattern: HEX, desc: 'stroke colour #rrggbb, or leave out for none' }), // i18n-ignore: config schema (API for config files and agents)
      strokeWidth: F.num({ min: 0, max: 200, desc: 'stroke width in pixels' }), // i18n-ignore: config schema (API for config files and agents)
      opacity: F.num({ min: 0, max: 1, desc: '0 to 1' }),
    });
    C.registerKind('document', APP, {
      strict: true,
      fields: {
        artboard: F.obj({
          width: F.int({ min: 1, max: 20000, required: true, desc: 'artboard width in pixels' }), // i18n-ignore: config schema (API for config files and agents)
          height: F.int({ min: 1, max: 20000, required: true, desc: 'artboard height in pixels' }), // i18n-ignore: config schema (API for config files and agents)
        }, { required: true, desc: 'the artboard size' }), // i18n-ignore: config schema (API for config files and agents)
        layers: F.list(F.obj({
          name: F.str({ max: 120, required: true, desc: 'layer name' }), // i18n-ignore: config schema (API for config files and agents)
          color: F.str({ max: 7, pattern: HEX, desc: 'layer colour in the panel, #rrggbb' }), // i18n-ignore: config schema (API for config files and agents)
          hidden: F.bool(), locked: F.bool(),
          objects: F.list(obj, { max: 2000, desc: 'the objects on this layer, bottom first' }), // i18n-ignore: config schema (API for config files and agents)
        }), { min: 1, max: 100, required: true, desc: 'layers, bottom first' }), // i18n-ignore: config schema (API for config files and agents)
      },
    }, apply, { label: 'Document', description: 'Artboard and layers with rectangles, ellipses, paths and text', read }); // i18n-ignore: config schema (API for config files and agents)
    // File ▸ Config: actions like the others (ui/actions.js), labelled vector.act.file_config_<name>.
    const cfg = (id, act) => { SV.ui._p.act(id, [], act); };
    const ad = (fn) => () => fn();
    cfg('file.config.export', ad(() => D.exportDialog({ app: APP })));
    cfg('file.config.template', ad(() => D.templateDialog({ app: APP, example: EXAMPLE })));
    cfg('file.config.import', ad(() => D.importDialog({ app: APP })));
    cfg('file.config.ai', ad(() => D.aiDialog({ app: APP })));
    D.install({ app: APP });
  }
})();
