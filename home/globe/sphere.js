/* The app globe's maths (home/globe/globe.js draws it, home/globe/paint.js paints its lines). Pure functions, no DOM:
 * unit-tested in tests/node/globe-sphere.test.mjs. Classic script: sets window.SlopGlobeMath, and module.exports under Node.
 * Space: y up, z towards the viewer (z = 1 is the front of the globe, z = -1 the back).
 *   tier({ reduced, cores, memory, saveData, coarse, width }) -> 'static' | 'lite' | 'full'
 *   TIERS[tier] -> { icons, fps, delay (ms after load before it starts), redraw (radians the lines may lag, 0: every frame) }
 *   fibonacci(n) -> [{ x, y, z }]          n points spread evenly over the unit sphere
 *   rotate(p, yaw, pitch) -> { x, y, z }    turn about the vertical axis (yaw), then tip about the horizontal one (pitch)
 *   project(q, geom) -> { x, y, scale }     true perspective: geom { cx, cy, r, d } (d: eye distance in radii)
 *   look(z) -> { alpha, blur, front }       how an icon at depth z is drawn: the back smaller, fainter and blurred
 *   spin(s, dt, o) -> s                     one step of the turn: velocity relaxes to the idle speed (inertia damping)
 *   seek(s, target, dt, tau) -> s           eases yaw and pitch towards a target (bringing an icon to the front)
 *   frontOf(p, tilt, lean) -> { yaw, pitch }  the turn that brings p to the front (pitch leaned `lean` of the way, 0.6)
 *   nearAngle(from, to) -> to + 2πk         the copy of an angle closest to another (the short way round)
 *   keepOut(x, y, rects, margin) -> .05..1  how much an icon shows over the text boxes
 *   grid(lat, lon, step) -> [[{x,y,z}]]     latitude and longitude lines as point lists, for the wireframe
 *   due(now, last, fps) -> bool             whether a frame is due under an fps cap
 *   weighted(weights) -> [{x,y,z}]          one point per weight: the heavy ones (weight > 1) spread round the equator, so
 *                                           they pass the front on every turn, the rest on a Fibonacci sphere kept clear of them
 *   centroid(points, weights?) -> {x,y,z}|null  the (weighted) mean direction of some points (null when they cancel out)
 *   zoomFor(n) -> factor                    how far the globe leans in for n search matches (1 for none or many)
 *   leadRank(lead) -> (id) -> 0..n          an id's place in the lead list (shared/apps.js SLOP_LEAD); n for the rest
 *   leadFirst(items, lead) -> items         the lead apps first, in the lead order; the rest after, as they were
 *   gather(points, weights, lead) -> points the lead indices moved next to the first one (its nearest points of their own
 *                                           size, nearest first) by swapping places: the same points, the same spread */
(function () {
  'use strict';
  const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  const TIERS = Object.freeze({
    full: Object.freeze({ icons: 72, fps: 60, delay: 700, redraw: 0 }),
    lite: Object.freeze({ icons: 28, fps: 20, delay: 2000, redraw: 0.012 }),
    static: Object.freeze({ icons: 72, fps: 0, delay: 700, redraw: 0 }),
  });
  function tier(o) {
    if (o.reduced) return 'static';
    const weak = (o.cores && o.cores <= 4) || (o.memory && o.memory <= 4) || o.saveData || o.coarse || (o.width && o.width < 700);
    return weak ? 'lite' : 'full';
  }

  function fibonacci(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), t = i * GOLDEN;
      out.push({ x: Math.cos(t) * r, y, z: Math.sin(t) * r });
    }
    return out;
  }

  function rotate(p, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
    return { x: x1, y: p.y * cp - z1 * sp, z: p.y * sp + z1 * cp };
  }

  /** Perspective: an eye d radii from the centre. scale is 1 for a point on the silhouette's plane (z = 0). */
  function project(q, g) {
    const f = g.d / (g.d - q.z);
    return { x: g.cx + q.x * g.r * f, y: g.cy - q.y * g.r * f, scale: f };
  }

  function look(z) {
    const t = (clamp(z, -1, 1) + 1) / 2;          // 0 at the back, 1 at the front
    return { alpha: 0.06 + 0.94 * smooth(0.05, 0.75, t), blur: z < -0.2 ? (z < -0.6 ? 2 : 1) : 0, front: z > 0.55 };   // the far side all but fades
  }

  /** s: { yaw, pitch, vel } (vel in radians per ms). The velocity relaxes towards o.idle with time constant o.tau (ms),
   * so a fling slows down to the idle turn; o.idle 0 lets it come to rest. */
  function spin(s, dt, o) {
    const k = 1 - Math.exp(-dt / (o.tau || 900));
    const vel = s.vel + ((o.idle || 0) - s.vel) * k;
    return { yaw: s.yaw + vel * dt, pitch: s.pitch, vel };
  }

  function seek(s, target, dt, tau) {
    const k = 1 - Math.exp(-dt / (tau || 420));
    return { yaw: s.yaw + (target.yaw - s.yaw) * k, pitch: s.pitch + (target.pitch - s.pitch) * k, vel: 0 };
  }

  const nearAngle = (from, to) => to + TAU * Math.round((from - to) / TAU);

  /** The yaw that turns p to face the viewer (x = 0, z > 0), and a pitch leaned part of the way (60 %) to its latitude from the
   * resting tilt, never past ±0.6 rad, so the globe never flips over. */
  function frontOf(p, tilt, lean = 0.6) {
    const yaw = Math.atan2(-p.x, p.z);
    const flat = Math.sqrt(p.x * p.x + p.z * p.z);
    const lat = Math.atan2(p.y, flat);
    return { yaw, pitch: clamp(tilt + (lat - tilt) * lean, -0.6, 0.6) };
  }

  function keepOut(x, y, rects, margin) {
    let k = 1;
    const m = margin > 0 ? margin : 1;
    for (const b of rects || []) {
      const dx = Math.max(b.l - x, 0, x - b.r), dy = Math.max(b.t - y, 0, y - b.b);
      k = Math.min(k, 0.05 + 0.95 * smooth(0, m, Math.sqrt(dx * dx + dy * dy)));
    }
    return k;
  }

  /** Latitude rings every `lat` degrees (no poles) and meridians every `lon` degrees, each a list of points `step`
   * degrees apart. */
  function grid(lat, lon, step) {
    const rad = Math.PI / 180, lines = [];
    for (let a = -90 + lat; a < 90; a += lat) {
      const ring = [], y = Math.sin(a * rad), r = Math.cos(a * rad);
      for (let b = 0; b <= 360; b += step) ring.push({ x: Math.cos(b * rad) * r, y, z: Math.sin(b * rad) * r });
      lines.push(ring);
    }
    for (let b = 0; b < 180; b += lon) {
      const m = [];
      for (let a = 0; a <= 360; a += step) m.push({ x: Math.cos(a * rad) * Math.cos(b * rad), y: Math.sin(a * rad), z: Math.cos(a * rad) * Math.sin(b * rad) });
      lines.push(m);
    }
    return lines;
  }

  const due = (now, last, fps) => (!fps ? false : fps >= 60 || now - last >= 1000 / fps - 2);

  const angle = (a, b) => Math.acos(clamp(a.x * b.x + a.y * b.y + a.z * b.z, -1, 1));
  function weighted(weights) {
    const heavy = [], light = [];
    weights.forEach((w, i) => ((w || 1) > 1 ? heavy : light).push(i));
    const out = new Array(weights.length);
    heavy.forEach((idx, k) => {
      const a = (TAU * k) / heavy.length, y = k % 2 ? -0.16 : 0.12, r = Math.sqrt(1 - y * y);
      out[idx] = { x: Math.cos(a) * r, y, z: Math.sin(a) * r };
    });
    const big = heavy.map((i) => out[i]);
    // the light points: a Fibonacci sphere with a few more points than needed, minus those too near a heavy one
    const clear = heavy.length ? 0.34 : 0;   // radians: a big icon and a small one never touch
    let pts = [];
    for (let m = light.length; m <= light.length * 3 + 8; m++) {
      pts = fibonacci(m).filter((p) => big.every((b) => angle(p, b) >= clear));
      if (pts.length >= light.length) break;
    }
    light.forEach((idx, k) => { out[idx] = pts[k]; });
    return out;
  }
  function centroid(points, weights) {
    if (!points.length) return null;
    let c = { x: 0, y: 0, z: 0 }, sum = 0;
    points.forEach((p, i) => { const w = weights ? weights[i] : 1; sum += w; c = { x: c.x + p.x * w, y: c.y + p.y * w, z: c.z + p.z * w }; });
    const l = Math.hypot(c.x, c.y, c.z);
    return l / sum < 0.2 ? null : { x: c.x / l, y: c.y / l, z: c.z / l };
  }
  const leadRank = (lead) => (id) => { const i = (lead || []).indexOf(id); return i < 0 ? (lead || []).length : i; };
  function leadFirst(items, lead) {
    const r = leadRank(lead);
    return items.map((x, i) => ({ x, i, k: r(x.id) })).sort((a, b) => a.k - b.k || a.i - b.i).map((e) => e.x);
  }
  function gather(points, weights, lead) {
    const out = points.slice(), done = new Set(lead.slice(0, 1)), heavy = (i) => (weights[i] || 1) > 1;
    const anchor = out[lead[0]];
    for (const i of lead.slice(1)) {
      let best = -1, bd = Infinity;
      out.forEach((p, j) => { const d = angle(p, anchor); if (!done.has(j) && heavy(j) === heavy(i) && d < bd) { bd = d; best = j; } });
      if (best >= 0) [out[i], out[best]] = [out[best], out[i]];
      done.add(i);
    }
    return out;
  }
  const zoomFor = (n) => (n === 1 ? 1.22 : n > 1 && n <= 6 ? 1.12 : 1);

  const M = { TAU, TIERS, clamp, smooth, tier, fibonacci, rotate, project, look, spin, seek, frontOf, nearAngle, keepOut, grid, due, weighted, centroid, zoomFor, leadRank, leadFirst, gather };
  if (typeof window !== 'undefined') window.SlopGlobeMath = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})();
