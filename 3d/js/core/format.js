/* Slop 3D file format: .s3d is the scene JSON itself, with "format": "slop-3d" and "version": 1.
 * serialize(scene) → text. parse(text) → { ok: true, scene } | { ok: false, errors: [...] }.
 * validate(obj) → { ok, errors }. Validation never throws; a bad file comes back as a list of problems.
 * Newer versions are refused (never half-read). Sets window.Slop3D.format. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, G = S.geometry;
  const HEX = /^#[0-9a-f]{6}$/i;
  const MIME = 'application/x-slop-3d', EXT = 's3d';
  const MAX_ERRORS = 20;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isNum);
  const isStr = (v) => typeof v === 'string';

  function serialize(scene) { return JSON.stringify(scene); }

  /** Checks one node's own fields. Pushes problems into errs. */
  function checkNode(id, n, nodes, errs) {
    const bad = (m) => errs.push(`node ${id}: ${m}`);
    if (!n || typeof n !== 'object') return bad('not an object');
    if (n.id !== id) bad('id does not match its key');
    if (!M.TYPES.includes(n.type)) bad(`unknown type "${n.type}"`);
    if (!isStr(n.name)) bad('name must be text');
    if (typeof n.visible !== 'boolean') bad('visible must be true or false');
    if (n.parent !== null && !(isStr(n.parent) && nodes[n.parent] && nodes[n.parent].type === 'group')) bad('parent must be null or a group');
    const t = n.transform;
    if (!t || !isVec3(t.p) || !isVec3(t.r) || !isVec3(t.s)) bad('transform needs p, r and s as three numbers');
    if (n.type === 'mesh') {
      const e = G.check(n.geom);
      if (e) bad(e);
      const m = n.material || {};
      if (!HEX.test(m.color || '')) bad('material colour must be #rrggbb');
      for (const k of ['roughness', 'metallic', 'opacity']) if (!isNum(m[k]) || m[k] < 0 || m[k] > 1) bad(`material.${k} must be 0 to 1`);
      if (m.map !== undefined && !(isStr(m.map) && /^data:image\//.test(m.map) && m.map.length < 12000000)) bad('texture must be an embedded image');
    }
    if (n.type === 'group') {
      if (!Array.isArray(n.children) || !n.children.every((c) => isStr(c) && nodes[c] && nodes[c].parent === id)) bad('children must list nodes whose parent is this group');
    } else if (n.children !== undefined) bad('only groups have children');
    if (n.type === 'light') {
      const l = n.light || {};
      if (!M.LIGHT_KINDS.includes(l.kind)) bad('light kind must be directional or ambient');
      if (!HEX.test(l.color || '')) bad('light colour must be #rrggbb');
      if (!isNum(l.intensity) || l.intensity < 0 || l.intensity > 100) bad('light intensity must be 0 to 100');
    }
  }

  /** Scene-wide checks: roots, parents, cycles. */
  function checkTree(s, errs) {
    const roots = s.roots;
    if (!Array.isArray(roots) || !roots.every((r) => isStr(r) && s.nodes[r] && s.nodes[r].parent === null) || new Set(roots).size !== roots.length) errs.push('roots must list each top-level node once');
    for (const id of Object.keys(s.nodes)) {
      const n = s.nodes[id];
      if (!n || typeof n !== 'object') continue;
      if (n.parent === null && !roots.includes(id)) errs.push(`node ${id} is not in roots`);
      const seen = new Set();
      for (let p = n.parent; p; p = s.nodes[p] ? s.nodes[p].parent : null) {
        if (seen.has(p)) { errs.push(`node ${id} sits in a loop`); break; }
        seen.add(p);
      }
    }
  }

  /** Validates an already-parsed object. */
  function validate(obj) {
    const errs = [];
    try {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['not a Slop 3D scene'] };
      if (obj.format !== M.FORMAT) errs.push('not a Slop 3D file (format is missing)');
      if (!Number.isInteger(obj.version) || obj.version < 1) errs.push('version must be a whole number');
      else if (obj.version > M.VERSION) errs.push(`made by a newer Slop 3D (file version ${obj.version}, this app reads ${M.VERSION})`);
      if (!isStr(obj.name)) errs.push('name must be text');
      if (!Number.isInteger(obj.seq) || obj.seq < 0) errs.push('seq must be a whole number');
      if (obj.background !== undefined && !HEX.test(obj.background)) errs.push('background must be #rrggbb');
      if (!obj.nodes || typeof obj.nodes !== 'object' || Array.isArray(obj.nodes)) errs.push('nodes must be an object');
      if (!Array.isArray(obj.roots)) errs.push('roots must be a list');
      if (!errs.length) {
        const ids = Object.keys(obj.nodes);
        for (const id of ids) checkNode(id, obj.nodes[id], obj.nodes, errs);
        checkTree(obj, errs);
      }
    } catch (e) { errs.push('the file could not be read'); }
    return { ok: errs.length === 0, errors: errs.slice(0, MAX_ERRORS) };
  }

  /** Parses .s3d text. Never throws. */
  function parse(text) {
    let obj;
    try { obj = JSON.parse(String(text)); } catch (e) { return { ok: false, errors: ['this file is not valid JSON'] }; }
    const v = validate(obj);
    return v.ok ? { ok: true, scene: obj } : { ok: false, errors: v.errors };
  }

  S.format = { FORMAT: M.FORMAT, VERSION: M.VERSION, MIME, EXT, serialize, parse, validate };
})();
