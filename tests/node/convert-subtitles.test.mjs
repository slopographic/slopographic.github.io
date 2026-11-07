// File convert: SRT and VTT subtitles both ways, and the timing shift (no browser).
// Run: node --test tests/node/convert-subtitles.test.mjs
// Covers: convert/js/core/subtitles.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubs, toSrt, toVtt, shiftCues, fmtTime, convertSubs } from '../../convert/js/core/subtitles.js';

const SRT = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\n\r\n2\r\n00:01:02,045 --> 00:01:04,000\r\nTwo\r\nlines\r\n';
const VTT = 'WEBVTT - a title\n\nNOTE a comment\nthat is not a cue\n\nSTYLE\n::cue { color: yellow }\n\nintro\n00:01.000 --> 00:03.500 align:start line:0\nHello <i>there</i>\n\n01:02.045 --> 01:04.000\nTwo\nlines\n';

test('both formats read to the same cues; VTT notes and styles are not cues, short VTT times read', () => {
  const a = parseSubs(SRT), b = parseSubs(VTT);
  assert.deepEqual(a.map((c) => [c.start, c.end, c.text]), [[1000, 3500, 'Hello <i>there</i>'], [62045, 64000, 'Two\nlines']]);
  assert.deepEqual(b.map((c) => [c.start, c.end, c.text]), a.map((c) => [c.start, c.end, c.text]));
  assert.equal(b[0].settings, 'align:start line:0');
  assert.throws(() => parseSubs('just text'), /No subtitles found/);
});

test('SRT to VTT and back; cue settings stay in VTT and are dropped in SRT', () => {
  assert.equal(toVtt(parseSubs(SRT)), 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello <i>there</i>\n\n00:01:02.045 --> 00:01:04.000\nTwo\nlines\n');
  assert.equal(toSrt(parseSubs(VTT)), '1\n00:00:01,000 --> 00:00:03,500\nHello <i>there</i>\n\n2\n00:01:02,045 --> 00:01:04,000\nTwo\nlines\n');
  assert.match(convertSubs(VTT, 'vtt'), /00:00:01\.000 --> 00:00:03\.500 align:start line:0/);
});

test('shift: later, earlier, cut at 0:00, and a cue ending before the start dropped', () => {
  const cues = parseSubs(SRT);
  assert.deepEqual(shiftCues(cues, 1500).map((c) => [c.start, c.end]), [[2500, 5000], [63545, 65500]]);
  assert.deepEqual(shiftCues(cues, -2000).map((c) => [c.start, c.end]), [[0, 1500], [60045, 62000]]);
  assert.deepEqual(shiftCues(cues, -5000).map((c) => c.text), ['Two\nlines']);
  assert.equal(convertSubs(SRT, 'srt', { shift: '-0.5' }).split('\n')[1], '00:00:00,500 --> 00:00:03,000');
  assert.equal(fmtTime(3723004, '.'), '01:02:03.004');
});
