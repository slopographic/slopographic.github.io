/* GeoJSON written as GPX or as a table of points. Pure (no DOM); geo-read.js reads GPX and KML into GeoJSON.
 *   featuresOf(value) -> [Feature]          a FeatureCollection, a Feature or a bare geometry; throws when it is none
 *   geojsonToGpx(value, { name }) -> { text, waypoints, tracks, outlines }
 *        Point and MultiPoint become waypoints (<wpt>), LineString a track (<trk>) with one segment, MultiLineString a track
 *        with a segment per line; a Polygon's rings become a track (its outline, counted in `outlines`). name, desc and time
 *        come from the properties, elevation from the third coordinate, point times from properties.coordTimes.
 *   geojsonToRows(value) -> rows            one row per point: feature, name, geometry, part, point, latitude, longitude,
 *                                            elevation, time, then each other property that is a plain value */
import { tr } from './i18n.js';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TYPES = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']; // i18n-ignore: GeoJSON names

export function featuresOf(v) {
  if (v && v.type === 'FeatureCollection' && Array.isArray(v.features)) return v.features.filter((f) => f && f.geometry); // i18n-ignore: GeoJSON names
  if (v && v.type === 'Feature') return v.geometry ? [v] : []; // i18n-ignore: GeoJSON names
  if (v && TYPES.includes(v.type)) return [{ type: 'Feature', properties: {}, geometry: v }]; // i18n-ignore: GeoJSON names
  throw new Error(tr('convert.geo.not_geojson'));
}

/** Each part of a geometry as a list of positions with the kind of GPX element it becomes. */
function parts(g, out = []) {
  if (!g) return out;
  const c = g.coordinates;
  if (g.type === 'Point') out.push({ as: 'wpt', points: [c] }); // i18n-ignore: GeoJSON names
  else if (g.type === 'MultiPoint') for (const p of c) out.push({ as: 'wpt', points: [p] }); // i18n-ignore: GeoJSON names
  else if (g.type === 'LineString') out.push({ as: 'seg', points: c, line: 0 }); // i18n-ignore: GeoJSON names
  else if (g.type === 'MultiLineString') c.forEach((l, i) => out.push({ as: 'seg', points: l, line: i })); // i18n-ignore: GeoJSON names
  else if (g.type === 'Polygon') c.forEach((r, i) => out.push({ as: 'seg', points: r, line: i, ring: true })); // i18n-ignore: GeoJSON names
  else if (g.type === 'MultiPolygon') { let i = 0; for (const poly of c) for (const r of poly) out.push({ as: 'seg', points: r, line: i++, ring: true }); } // i18n-ignore: GeoJSON names
  else if (g.type === 'GeometryCollection') for (const x of g.geometries || []) parts(x, out); // i18n-ignore: GeoJSON names
  return out;
}

const valid = (p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]));
function pt(tag, p, time, pad, extra = '') {
  const ele = p.length > 2 && Number.isFinite(Number(p[2])) ? `<ele>${Number(p[2])}</ele>` : '';
  return `${pad}<${tag} lat="${Number(p[1])}" lon="${Number(p[0])}">${ele}${time ? `<time>${esc(time)}</time>` : ''}${extra}</${tag}>\n`;
}
const meta = (pr) => `${pr.name != null ? `<name>${esc(pr.name)}</name>` : ''}${pr.desc ?? pr.description ? `<desc>${esc(pr.desc ?? pr.description)}</desc>` : ''}`;

export function geojsonToGpx(value, { name = '' } = {}) {
  const feats = featuresOf(value);
  let wpts = '', trks = '', waypoints = 0, tracks = 0, outlines = 0;
  for (const f of feats) {
    const pr = f.properties || {};
    const times = Array.isArray(pr.coordTimes) ? pr.coordTimes : [];
    const segs = [];
    for (const part of parts(f.geometry)) {
      if (part.as === 'wpt') {
        if (!valid(part.points[0])) continue;
        wpts += pt('wpt', part.points[0], pr.time, '  ', meta(pr));
        waypoints++;
      } else {
        const t = Array.isArray(times[0]) ? times[part.line] || [] : part.line === 0 ? times : [];
        const pts = part.points.filter(valid).map((p, i) => pt('trkpt', p, t[i], '      ')).join('');
        if (pts) segs.push(`    <trkseg>\n${pts}    </trkseg>\n`);
        if (part.ring) outlines++;
      }
    }
    if (segs.length) { trks += `  <trk>${meta(pr)}\n${segs.join('')}  </trk>\n`; tracks++; }
  }
  if (!waypoints && !tracks) throw new Error(tr('convert.geo.no_coords'));
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Slopographic File convert" xmlns="http://www.topografix.com/GPX/1/1">\n';
  const md = name ? `  <metadata><name>${esc(name)}</name></metadata>\n` : '';
  return { text: `${head}${md}${wpts}${trks}</gpx>\n`, waypoints, tracks, outlines };
}

const plain = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const SKIP = new Set(['name', 'time', 'coordTimes']);

export function geojsonToRows(value) {
  const feats = featuresOf(value);
  const extra = [];
  for (const f of feats) for (const [k, v] of Object.entries(f.properties || {})) if (!SKIP.has(k) && plain(v) && !extra.includes(k)) extra.push(k);
  const rows = [['feature', 'name', 'geometry', 'part', 'point', 'latitude', 'longitude', 'elevation', 'time', ...extra]];
  feats.forEach((f, fi) => {
    const pr = f.properties || {}, times = Array.isArray(pr.coordTimes) ? pr.coordTimes : [];
    parts(f.geometry).forEach((part, pi) => {
      const t = Array.isArray(times[0]) ? times[part.line] || [] : times;
      part.points.filter(valid).forEach((p, i) => rows.push([fi + 1, pr.name ?? '', f.geometry.type, pi + 1, i + 1, Number(p[1]), Number(p[0]),
        p.length > 2 ? Number(p[2]) : '', (part.as === 'wpt' ? pr.time : t[i]) ?? '', ...extra.map((k) => (plain(pr[k]) && pr[k] !== null ? pr[k] : ''))]));
    });
  });
  if (rows.length === 1) throw new Error(tr('convert.geo.no_points'));
  return rows;
}
