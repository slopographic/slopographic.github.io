/* More picture, sound, video and map conversions, added to CONVERSIONS in catalog.js:
 *   favicon-pack                        a picture as a website's favicon set in a ZIP (favicon.js)
 *   audio-trim                          a piece of an audio or video file's sound as WAV or MP3, with fades (cut.js, audio.js)
 *   video-trim                          a piece of a video, streams copied (fast) or cut at the exact frame (ffmpeg-engine.js)
 *   gpx-to-geojson, kml-to-geojson      GPS tracks and Google Earth files as GeoJSON (geo-read.js)
 *   geojson-to-gpx, geojson-to-csv      GeoJSON as GPX or as a table of points (geo-write.js; csv.js writes the table)
 * Exports MEDIA_GEO. */
import { faviconZip } from './favicon.js';
import { cutChannels, cutRange } from './cut.js';
import { decodeAudio, channelsOf, encodeWav, encodeMp3, loadLame } from './audio.js';
import { convertVideo } from './ffmpeg-engine.js';
import { gpxToGeojson, kmlToGeojson } from './geo-read.js';
import { geojsonToGpx, geojsonToRows } from './geo-write.js';
import { parseJson } from './structured.js';
import { rowsToCsv } from './csv.js';
import { decodeText } from './text.js';
import { stemOf as base } from '../io/files.js';
import { tr } from './i18n.js';

const textOf = async (f) => decodeText(new Uint8Array(await f.file.arrayBuffer()));
const out = (name, data, type) => ({ name, blob: new Blob([data], { type }) });
const IMAGE = ['png', 'jpg', 'webp', 'bmp', 'gif', 'svg', 'avif', 'ico'];
const AUDIO_IN = ['mp4', 'webm', 'mov', 'm4a', 'mp3', 'wav', 'ogg', 'flac'];
const VIDEO_IN = ['mp4', 'webm', 'mov'];
const START = { key: 'start', type: 'text', get label() { return tr('convert.media.start'); }, value: '0', placeholder: '0:00', get hint() { return tr('convert.media.start_hint'); } };
const END = { key: 'end', type: 'text', get label() { return tr('convert.media.end'); }, get placeholder() { return tr('convert.media.end_placeholder'); }, get hint() { return tr('convert.media.end_hint'); } };
const n = (v) => Math.round(v * 1000) / 1000;

async function favicon(files, o = {}) {
  const f = files[0], fill = !!o.fill;
  const blob = await faviconZip(f.file, f.kind, { name: o.name || base(f.name), background: fill ? o.background : 'transparent', color: fill ? o.background : '#ffffff', padding: o.padding });
  return [{ name: `${base(f.name)}-favicons.zip`, blob }];
}

async function audioTrim(files, o = {}) {
  const f = files[0];
  const buf = await decodeAudio(new Uint8Array(await f.file.arrayBuffer()));
  const chans = cutChannels(channelsOf(buf), buf.sampleRate, o);
  const res = o.output === 'mp3'
    ? [{ name: `${base(f.name)}-cut.mp3`, blob: encodeMp3(await loadLame(), chans, buf.sampleRate, Number(o.bitrate) || 192), kind: 'mp3' }]
    : [{ name: `${base(f.name)}-cut.wav`, blob: new Blob([encodeWav(chans, buf.sampleRate)], { type: 'audio/wav' }), kind: 'wav' }];
  res.info = tr('convert.media.kept', { kept: String(n(chans[0].length / buf.sampleRate)), total: String(n(buf.duration)) });
  return res;
}

const ENC = {
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  mov: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-f', 'mov'],
  webm: ['-c:v', 'libvpx', '-b:v', '1M', '-c:a', 'libvorbis', '-b:a', '128k'],
};
async function videoTrim(files, o = {}) {
  const f = files[0], ext = VIDEO_IN.includes(f.kind) ? f.kind : 'mp4';
  const { from, to } = cutRange(o);
  const len = Number.isFinite(to) ? ['-t', String(n(to - from))] : [];
  const copy = (i, x) => ['-ss', String(from), '-i', i, ...len, '-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', ...(ext === 'webm' ? [] : ['-movflags', '+faststart']), x];
  const exact = (i, x) => ['-i', i, '-ss', String(from), ...len, ...ENC[ext], x];
  const r = await convertVideo(f.file, { name: `${base(f.name)}-cut`, output: ext, args: o.exact ? exact : copy, fallback: o.exact ? null : exact });
  return [{ ...r, kind: ext }];
}

const geo = (read, what) => async (files) => {
  const f = files[0], g = read(await textOf(f));
  const res = [out(`${base(f.name)}.geojson`, JSON.stringify(g, null, 2) + '\n', 'application/geo+json')];
  const c = (t) => g.features.filter((x) => x.geometry.type === t).length;
  const points = c('Point'), lines = g.features.length - points; // i18n-ignore: code and search keywords
  res.info = tr('convert.geo.read_info', {
    features: tr('convert.geo.features', { n: g.features.length, what }),
    points: tr('convert.geo.points', { n: points }),
    lines: tr('convert.geo.lines', { n: lines }) });
  return res;
};
async function toGpx(files) {
  const f = files[0], r = geojsonToGpx(parseJson(await textOf(f)), { name: base(f.name) });
  const res = [out(`${base(f.name)}.gpx`, r.text, 'application/gpx+xml')];
  res.info = tr('convert.geo.gpx_info', {
    waypoints: tr('convert.geo.waypoints', { n: r.waypoints }),
    tracks: tr('convert.geo.tracks', { n: r.tracks }),
    outlines: r.outlines ? tr('convert.geo.outlines', { n: r.outlines }) : '' });
  return res;
}
async function toCsv(files, o = {}) {
  const f = files[0], rows = geojsonToRows(parseJson(await textOf(f)));
  return [out(`${base(f.name)}.csv`, rowsToCsv(rows, { delimiter: o.delimiter || ',' }), 'text/csv')];
}

const GEO = 'Maps and GPS'; // i18n-ignore: a catalog group (the group names are translated where they are shown)
export const MEDIA_GEO = [
  { id: 'favicon-pack', get label() { return tr('convert.fav.label'); }, group: 'Images', from: IMAGE, ext: 'zip', mode: 'each', keywords: ['favicon', 'icon', 'apple-touch-icon', 'manifest', 'website'], // i18n-ignore: group id (shown through groupLabel)
    options: [{ key: 'name', type: 'text', get label() { return tr('convert.fav.site_name'); }, get placeholder() { return tr('convert.fav.my_site'); } },
      { key: 'padding', type: 'select', get label() { return tr('convert.fav.padding'); }, value: '0',
        get options() { return [['0', tr('convert.fav.pad_none')], ['5', tr('convert.fav.pad_little')], ['10', tr('convert.fav.pad_some')], ['15', tr('convert.fav.pad_more')]]; } },
      { key: 'fill', type: 'checkbox', get label() { return tr('convert.fav.fill'); }, value: false, get hint() { return tr('convert.fav.fill_hint'); } },
      { key: 'background', type: 'color', get label() { return tr('convert.fav.background'); }, value: '#ffffff' }],
    run: favicon },
  { id: 'audio-trim', get label() { return tr('convert.media.audio_trim'); }, group: 'Audio and video', from: AUDIO_IN, ext: 'wav', mode: 'each', keywords: ['trim', 'cut', 'clip', 'ringtone', 'fade'], // i18n-ignore: group id (shown through groupLabel)
    options: [START, END, { key: 'fadeIn', type: 'number', get label() { return tr('convert.media.fade_in'); }, min: 0, max: 60, step: 0.1, value: 0 },
      { key: 'fadeOut', type: 'number', get label() { return tr('convert.media.fade_out'); }, min: 0, max: 60, step: 0.1, value: 0 },
      { key: 'output', type: 'select', get label() { return tr('convert.media.save_as'); }, value: 'wav', get options() { return [['wav', tr('convert.media.wav_lossless')], ['mp3', 'MP3']]; } },
      { key: 'bitrate', type: 'select', get label() { return tr('convert.media.mp3_bitrate'); }, value: '192', options: [['128', '128 kbps'], ['192', '192 kbps'], ['320', '320 kbps']] }],
    run: audioTrim },
  { id: 'video-trim', engine: 'ffmpeg', get label() { return tr('convert.media.video_trim'); }, group: 'Audio and video', from: VIDEO_IN, ext: 'mp4', mode: 'each', keywords: ['trim', 'cut', 'clip', 'shorten'], // i18n-ignore: group id (shown through groupLabel)
    options: [START, END, { key: 'exact', type: 'checkbox', get label() { return tr('convert.media.exact'); }, value: false,
      get hint() { return tr('convert.media.exact_hint'); } }],
    run: videoTrim },
  { id: 'gpx-to-geojson', get label() { return tr('convert.geo.gpx_to_geojson'); }, group: GEO, from: ['gpx'], ext: 'geojson', mode: 'each', keywords: ['gps', 'track', 'strava', 'garmin', 'map'], options: [], run: geo(gpxToGeojson, 'GPX') },
  { id: 'kml-to-geojson', get label() { return tr('convert.geo.kml_to_geojson'); }, group: GEO, from: ['kml'], ext: 'geojson', mode: 'each', keywords: ['google earth', 'google maps', 'map', 'placemark'], options: [], run: geo(kmlToGeojson, 'KML') }, // i18n-ignore: code and search keywords
  { id: 'geojson-to-gpx', get label() { return tr('convert.geo.geojson_to_gpx'); }, group: GEO, from: ['geojson'], ext: 'gpx', mode: 'each', keywords: ['gps', 'track', 'waypoints', 'garmin'], options: [], run: toGpx },
  { id: 'geojson-to-csv', get label() { return tr('convert.geo.geojson_to_csv'); }, group: GEO, from: ['geojson'], ext: 'csv', mode: 'each', keywords: ['latitude', 'longitude', 'coordinates', 'table', 'excel'],
    options: [{ key: 'delimiter', type: 'select', get label() { return tr('convert.geo.separator'); }, value: ',',
      get options() { return [[',', tr('convert.geo.sep_comma')], [';', tr('convert.geo.sep_semicolon')], ['\t', tr('convert.geo.sep_tab')]]; } }], run: toCsv },
];
