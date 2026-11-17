/* GPS and map files read into GeoJSON (RFC 7946: [longitude, latitude, elevation]). Browser only (DOMParser); the pure
 * KML coordinate reader is exported for tests. geo-write.js writes GeoJSON as GPX or as a table.
 *   gpxToGeojson(text) -> FeatureCollection   waypoints are Points; a route a LineString; a track a LineString (one
 *        segment) or a MultiLineString, with its point times in properties.coordTimes (the togeojson convention)
 *   kmlToGeojson(text) -> FeatureCollection   every Placemark, in folders too: Point, LineString, LinearRing, Polygon
 *        (with holes), MultiGeometry and gx:Track; name, description and ExtendedData become properties
 *   kmlCoords(text) -> [[lon, lat, ele?]]     "lon,lat[,alt]" tuples separated by spaces or line breaks */
import { tr } from './i18n.js';
const kids = (el, name) => [...el.children].filter((c) => c.localName === name);
const kid = (el, name) => kids(el, name)[0] || null;
const all = (el, name) => [...el.getElementsByTagNameNS('*', name)];
const txt = (el) => (el ? el.textContent.trim() : '');

function parse(text, what) {
  const doc = new DOMParser().parseFromString(String(text).replace(/^\uFEFF/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(tr('convert.geo.bad_xml', { what }));
  return doc;
}
const collection = (features, what) => {
  if (!features.length) throw new Error(tr('convert.geo.empty', { what }));
  return { type: 'FeatureCollection', features }; // i18n-ignore: GeoJSON and KML names
};

/* ---------- GPX ---------- */
function gpxPoint(p) {
  const c = [Number(p.getAttribute('lon')), Number(p.getAttribute('lat'))];
  const ele = kid(p, 'ele');
  if (ele && txt(ele) !== '' && Number.isFinite(Number(txt(ele)))) c.push(Number(txt(ele)));
  return c;
}
const okPoint = (p) => Number.isFinite(Number(p.getAttribute('lat'))) && Number.isFinite(Number(p.getAttribute('lon'))) && p.getAttribute('lat') !== null;
function gpxProps(el) {
  const pr = {};
  for (const k of ['name', 'desc', 'cmt', 'type', 'sym']) { const v = txt(kid(el, k)); if (v) pr[k] = v; }
  return pr;
}

export function gpxToGeojson(text) {
  const doc = parse(text, 'GPX');
  const root = doc.documentElement;
  if (root.localName !== 'gpx') throw new Error(tr('convert.geo.not_gpx'));
  const features = [];
  for (const w of kids(root, 'wpt').filter(okPoint)) {
    const pr = gpxProps(w), t = txt(kid(w, 'time'));
    if (t) pr.time = t;
    features.push({ type: 'Feature', properties: pr, geometry: { type: 'Point', coordinates: gpxPoint(w) } }); // i18n-ignore: GeoJSON and KML names
  }
  for (const r of kids(root, 'rte')) {
    const pts = kids(r, 'rtept').filter(okPoint);
    if (pts.length) features.push({ type: 'Feature', properties: gpxProps(r), geometry: { type: 'LineString', coordinates: pts.map(gpxPoint) } }); // i18n-ignore: GeoJSON and KML names
  }
  for (const t of kids(root, 'trk')) {
    const segs = kids(t, 'trkseg').map((s) => kids(s, 'trkpt').filter(okPoint)).filter((s) => s.length);
    if (!segs.length) continue;
    const pr = gpxProps(t);
    const times = segs.map((s) => s.map((p) => txt(kid(p, 'time'))));
    if (times.some((s) => s.some(Boolean))) pr.coordTimes = segs.length === 1 ? times[0] : times;
    const geometry = segs.length === 1 ? { type: 'LineString', coordinates: segs[0].map(gpxPoint) } : { type: 'MultiLineString', coordinates: segs.map((s) => s.map(gpxPoint)) }; // i18n-ignore: GeoJSON and KML names
    features.push({ type: 'Feature', properties: pr, geometry }); // i18n-ignore: GeoJSON and KML names
  }
  return collection(features, 'GPX');
}

/* ---------- KML ---------- */
export function kmlCoords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).map((t) => t.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite))
    .map((c) => (c.length > 2 ? [c[0], c[1], c[2]] : [c[0], c[1]]));
}
const ring = (el) => (el ? kmlCoords(txt(kid(el, 'coordinates'))) : []);

function kmlGeometry(el) {
  const n = el.localName;
  if (n === 'Point') { const c = kmlCoords(txt(kid(el, 'coordinates'))); return c.length ? { type: 'Point', coordinates: c[0] } : null; } // i18n-ignore: GeoJSON and KML names
  if (n === 'LineString' || n === 'LinearRing') { const c = ring(el); return c.length ? { type: 'LineString', coordinates: c } : null; } // i18n-ignore: GeoJSON and KML names
  if (n === 'Polygon') { // i18n-ignore: GeoJSON and KML names
    const outer = ring(kid(kid(el, 'outerBoundaryIs') || el, 'LinearRing')); // i18n-ignore: GeoJSON and KML names
    if (!outer.length) return null;
    return { type: 'Polygon', coordinates: [outer, ...kids(el, 'innerBoundaryIs').map((b) => ring(kid(b, 'LinearRing'))).filter((r) => r.length)] }; // i18n-ignore: GeoJSON and KML names
  }
  if (n === 'Track') { // i18n-ignore: GeoJSON and KML names
    const c = kids(el, 'coord').map((x) => txt(x).split(/\s+/).map(Number)).filter((x) => x.length >= 2 && x.every(Number.isFinite));
    return c.length ? { type: 'LineString', coordinates: c, times: kids(el, 'when').map(txt) } : null; // i18n-ignore: GeoJSON and KML names
  }
  if (n === 'MultiTrack' || n === 'MultiGeometry') { // i18n-ignore: GeoJSON and KML names
    const gs = [...el.children].map(kmlGeometry).filter(Boolean);
    if (!gs.length) return null;
    const one = gs.every((g) => g.type === gs[0].type) && ['Point', 'LineString', 'Polygon'].includes(gs[0].type); // i18n-ignore: GeoJSON and KML names
    if (one) {
      const times = gs.every((g) => g.times) ? gs.map((g) => g.times) : null;
      return { type: 'Multi' + gs[0].type, coordinates: gs.map((g) => g.coordinates), ...(times ? { times } : {}) }; // i18n-ignore: GeoJSON and KML names
    }
    return { type: 'GeometryCollection', geometries: gs.map(({ times, ...g }) => g) }; // i18n-ignore: GeoJSON and KML names
  }
  return null;
}
const GEOMS = ['Point', 'LineString', 'LinearRing', 'Polygon', 'MultiGeometry', 'Track', 'MultiTrack']; // i18n-ignore: GeoJSON and KML names

export function kmlToGeojson(text) {
  const doc = parse(text, 'KML');
  const features = [];
  for (const pm of all(doc, 'Placemark')) { // i18n-ignore: GeoJSON and KML names
    const g = [...pm.children].find((c) => GEOMS.includes(c.localName));
    const geom = g && kmlGeometry(g);
    if (!geom) continue;
    const pr = {};
    const name = txt(kid(pm, 'name')), desc = txt(kid(pm, 'description'));
    if (name) pr.name = name;
    if (desc) pr.description = desc;
    for (const d of all(pm, 'Data')) if (d.getAttribute('name')) pr[d.getAttribute('name')] = txt(kid(d, 'value')); // i18n-ignore: GeoJSON and KML names
    for (const d of all(pm, 'SimpleData')) if (d.getAttribute('name')) pr[d.getAttribute('name')] = txt(d); // i18n-ignore: GeoJSON and KML names
    const when = txt(kid(kid(pm, 'TimeStamp') || pm, 'when')); // i18n-ignore: GeoJSON and KML names
    if (when && geom.type === 'Point') pr.time = when; // i18n-ignore: GeoJSON and KML names
    const { times, ...geometry } = geom;
    if (times && times.flat().some(Boolean)) pr.coordTimes = times;
    features.push({ type: 'Feature', properties: pr, geometry }); // i18n-ignore: GeoJSON and KML names
  }
  return collection(features, 'KML');
}
