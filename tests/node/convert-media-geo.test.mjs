// File convert: cutting audio (times, the piece, fades), GeoJSON to GPX and to a table, the multi-size ICO and the favicon
// set's text files (no browser).
// Run: node --test tests/node/convert-media-geo.test.mjs
// Covers: convert/js/core/cut.js, convert/js/core/geo-write.js, convert/js/core/ico.js, convert/js/core/favicon.js, convert/js/core/media-geo.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClock, cutRange, cutChannels } from '../../convert/js/core/cut.js';
import { geojsonToGpx, geojsonToRows, featuresOf } from '../../convert/js/core/geo-write.js';
import { encodeIcoImages, encodeIco } from '../../convert/js/core/ico.js';
import { manifestJson, headTags, FAVICON_PNGS } from '../../convert/js/core/favicon.js';
import { MEDIA_GEO } from '../../convert/js/core/media-geo.js';

test('times: seconds, m:ss, h:mm:ss, a decimal comma, blank; mistakes are said plainly', () => {
  assert.deepEqual(['90', '1:30', '1:02:03.5', '1,5', ' ', '.25'].map(parseClock), [90, 90, 3723.5, 1.5, null, 0.25]);
  assert.throws(() => parseClock('1:75'), /seconds go up to 59/);
  assert.throws(() => parseClock('soon'), /not a time/);
  assert.deepEqual(cutRange({ start: '1', end: '' }, 10), { from: 1, to: 10 });
  assert.deepEqual(cutRange({ start: '', end: '20' }, 10), { from: 0, to: 10 });   // past the end: the end
  assert.deepEqual(cutRange({ start: '2' }), { from: 2, to: Infinity });   // a video's length is not known here
  assert.throws(() => cutRange({ start: '12' }, 10), /after the end of the file \(0:10\)/);
  assert.throws(() => cutRange({ start: '5', end: '4' }, 10), /end must be after the start/);
});

test('the piece of each channel, with linear fades', () => {
  const rate = 10, ramp = Float32Array.from({ length: 50 }, (_, i) => i), ones = new Float32Array(50).fill(1);
  const [a, b] = cutChannels([ramp, ones], rate, { start: '1', end: '3' });
  assert.equal(a.length, 20);
  assert.deepEqual([a[0], a[19]], [10, 29]);
  assert.equal(b.length, 20);
  const [f] = cutChannels([ones], rate, { start: 0, end: 2, fadeIn: 0.5, fadeOut: 1 });
  assert.deepEqual([...f.slice(0, 5)].map((x) => Math.round(x * 100) / 100), [0, 0.2, 0.4, 0.6, 0.8]);
  assert.equal(f[9], 1);
  assert.equal(f[19], 0);
  assert.equal(Math.round(f[15] * 10) / 10, 0.4);
});

const FC = { type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { name: 'Café & bar', time: '2026-05-01T10:00:00Z', kind: 'stop' }, geometry: { type: 'Point', coordinates: [18.07, 59.33, 12] } },
  { type: 'Feature', properties: { name: 'Run', coordTimes: ['2026-05-01T10:00:00Z', '2026-05-01T10:01:00Z'] }, geometry: { type: 'LineString', coordinates: [[18, 59], [18.01, 59.01, 20]] } },
  { type: 'Feature', properties: { name: 'Park' }, geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4], [5, 6], [1, 2]]] } },
] };

test('GeoJSON to GPX: waypoints, a track with times and elevation, an area as its outline', () => {
  const r = geojsonToGpx(FC, { name: 'trip' });
  assert.deepEqual([r.waypoints, r.tracks, r.outlines], [1, 2, 1]);
  assert.match(r.text, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<gpx version="1.1" creator="Slopographic File convert" xmlns="http:\/\/www.topografix.com\/GPX\/1\/1">\n  <metadata><name>trip<\/name><\/metadata>\n/);
  assert.match(r.text, /<wpt lat="59.33" lon="18.07"><ele>12<\/ele><time>2026-05-01T10:00:00Z<\/time><name>Café &amp; bar<\/name><\/wpt>/);
  assert.match(r.text, /<trk><name>Run<\/name>\n {4}<trkseg>\n {6}<trkpt lat="59" lon="18"><time>2026-05-01T10:00:00Z<\/time><\/trkpt>\n {6}<trkpt lat="59.01" lon="18.01"><ele>20<\/ele><time>2026-05-01T10:01:00Z<\/time><\/trkpt>/);
  assert.equal(geojsonToGpx({ type: 'LineString', coordinates: [[1, 2], [3, 4]] }).tracks, 1);   // a bare geometry
  assert.throws(() => geojsonToGpx({ type: 'FeatureCollection', features: [] }), /no points or lines/);
  assert.throws(() => featuresOf({ hello: 1 }), /not GeoJSON/);
});

test('GeoJSON to rows: one row per point, with the other properties as columns', () => {
  const rows = geojsonToRows(FC);
  assert.deepEqual(rows[0], ['feature', 'name', 'geometry', 'part', 'point', 'latitude', 'longitude', 'elevation', 'time', 'kind']);
  assert.deepEqual(rows[1], [1, 'Café & bar', 'Point', 1, 1, 59.33, 18.07, 12, '2026-05-01T10:00:00Z', 'stop']);
  assert.deepEqual(rows[3], [2, 'Run', 'LineString', 1, 2, 59.01, 18.01, 20, '2026-05-01T10:01:00Z', '']);
  assert.equal(rows.length, 1 + 1 + 2 + 4);
});

test('a multi-size ICO: the directory names each size and points at its PNG', () => {
  const png = (n) => Uint8Array.from({ length: n }, (_, i) => i);
  const ico = encodeIcoImages([{ png: png(5), width: 16, height: 16 }, { png: png(7), width: 256, height: 256 }]);
  const dv = new DataView(ico.buffer);
  assert.deepEqual([dv.getUint16(2, true), dv.getUint16(4, true)], [1, 2]);
  assert.deepEqual([ico[6], ico[22], dv.getUint32(14, true), dv.getUint32(18, true), dv.getUint32(30, true), dv.getUint32(34, true)], [16, 0, 5, 38, 7, 43]);
  assert.equal(ico.length, 38 + 5 + 7);
  assert.deepEqual([...encodeIco(png(3), 32, 32).slice(0, 8)], [0, 0, 1, 0, 1, 0, 32, 32]);
  assert.throws(() => encodeIcoImages([{ png: png(1), width: 300, height: 300 }]), /1 to 256/);
});

test('the favicon set: the manifest, the head tags, the files', () => {
  const m = JSON.parse(manifestJson({ name: 'Bakery Lund', color: '#aa3300' }));
  assert.deepEqual([m.name, m.short_name, m.theme_color, m.icons.map((i) => i.sizes)], ['Bakery Lund', 'Bakery Lund', '#aa3300', ['192x192', '512x512']]);
  assert.equal(JSON.parse(manifestJson({ color: 'red' })).theme_color, '#ffffff');
  assert.match(headTags({ color: '#112233' }), /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon.png">\n<link rel="manifest" href="\/site.webmanifest">\n<meta name="theme-color" content="#112233">\n$/);
  assert.deepEqual(FAVICON_PNGS.map(([, s]) => s), [16, 32, 48, 180, 192, 512]);
  assert.deepEqual(MEDIA_GEO.map((c) => c.id), ['favicon-pack', 'audio-trim', 'video-trim', 'gpx-to-geojson', 'kml-to-geojson', 'geojson-to-gpx', 'geojson-to-csv']);
});
