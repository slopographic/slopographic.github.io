/* Slop Recorder: what this browser can record, in plain words. Pure: the page passes the features it detected and the user
 * agent; Node-tested (tests/node/recorder-core.test.mjs). Classic script: SlopRec.support; also a CommonJS module.
 *   browserOf(ua)        { name: 'chrome' | 'edge' | 'firefox' | 'safari' | 'other', os: 'windows' | 'mac' | 'linux' |
 *                          'chromeos' | 'android' | 'ios' | 'other', mobile, label: 'Chrome on Windows' }
 *   rows(caps, ua)       [{ id, what, status: 'yes' | 'no' | 'partial', note }] for this browser, from
 *                        caps = { display, user, recorder, canvasStream, mediaStream, types: [the MediaRecorder types it writes] }
 *   TABLE                the same facts for every browser (the page shows it under "Other browsers")
 *   Each row also carries key names for the page's language (view.js): a row's `nk` (its note), a TABLE row's `k` and `sk`.
 * Facts (2026): only desktop browsers have getDisplayMedia (screen capture); sound from the screen is a Chromium feature:
 * a tab's sound in Chrome and Edge everywhere, the whole screen's sound on Windows and ChromeOS only, never a window's;
 * Firefox and Safari share no system sound. Every browser here records the webcam and the microphone. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SlopRec = root.SlopRec || {}).support = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const NAMES = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', safari: 'Safari', other: 'This browser' };
  const OSES = { windows: 'Windows', mac: 'macOS', linux: 'Linux', chromeos: 'ChromeOS', android: 'Android', ios: 'iPhone or iPad', other: '' };

  function browserOf(ua = '') {
    const s = String(ua);
    const os = /iPhone|iPad|iPod/.test(s) ? 'ios' : /Android/.test(s) ? 'android' : /CrOS/.test(s) ? 'chromeos' : /Windows/.test(s) ? 'windows'
      : /Macintosh|Mac OS X/.test(s) ? 'mac' : /Linux|X11/.test(s) ? 'linux' : 'other';
    const name = /Edg\//.test(s) ? 'edge' : /Firefox\/|FxiOS/.test(s) ? 'firefox' : /Chrome\/|CriOS|Chromium/.test(s) ? 'chrome'
      : /Safari\//.test(s) ? 'safari' : 'other';
    const mobile = os === 'ios' || os === 'android' || /Mobile/.test(s);
    return { name, os, mobile, label: NAMES[name] + (OSES[os] ? ' on ' + OSES[os] : '') };
  }
  /** Sound from the screen for a browser: { tab, screen, window } each 'yes' | 'no'. */
  function systemAudio(b) {
    if (b.mobile) return { tab: 'no', screen: 'no', window: 'no' };
    if (b.name === 'chrome' || b.name === 'edge') return { tab: 'yes', screen: b.os === 'windows' || b.os === 'chromeos' ? 'yes' : 'no', window: 'no' };
    return { tab: 'no', screen: 'no', window: 'no' };
  }
  const yes = (v) => (v ? 'yes' : 'no');

  function rows(caps = {}, ua = '') {
    const b = browserOf(ua), sa = systemAudio(b), types = caps.types || [];
    const mp4 = types.some((t) => /mp4/.test(t)), webm = types.some((t) => /webm/.test(t));
    const sound = sa.tab === 'yes' && sa.screen === 'yes' ? 'yes' : sa.tab === 'yes' ? 'partial' : 'no';
    return [
      { id: 'screen', what: 'Screen, window or tab', status: yes(caps.display && caps.recorder),
        nk: caps.display ? 'screen_yes' : b.mobile ? 'screen_mobile' : 'screen_no',
        note: caps.display ? 'You pick the screen, a window or a browser tab when you press Record.' : b.mobile ? 'Phones and tablets do not let web pages record the screen. Use the phone\'s own screen recorder.' : 'This browser does not let pages capture the screen.' },
      { id: 'system', what: 'Sound from the screen', status: caps.display ? sound : 'no', nk: 'system_' + sound,
        note: sound === 'yes' ? 'Tick “Share tab audio” or “Share system audio” in the browser\'s sharing window. A single window shares no sound.'
          : sound === 'partial' ? 'Only a browser tab\'s sound: pick a tab and tick “Share tab audio”. A whole screen or a window shares no sound here (it does on Windows and ChromeOS).'
            : 'This browser shares no sound from the screen. Your microphone still records.' },
      { id: 'camera', what: 'Webcam', status: yes(caps.user && caps.recorder), nk: caps.user ? 'camera_yes' : 'camera_no', note: caps.user ? 'The browser asks you once for the camera.' : 'This browser gives pages no camera.' },
      { id: 'mic', what: 'Microphone', status: yes(caps.user && caps.recorder), nk: caps.user ? 'mic_yes' : 'mic_no', note: caps.user ? 'Recorded with the screen or webcam, or on its own.' : 'This browser gives pages no microphone.' },
      { id: 'pip', what: 'Screen + webcam in a corner', status: yes(caps.display && caps.user && caps.canvasStream && caps.recorder),
        nk: 'pip', note: 'The two are drawn together on this device while you record.' },
      { id: 'trim', what: 'Trim without converting', status: caps.mediaStream ? 'yes' : 'partial', nk: caps.mediaStream ? 'trim_yes' : 'trim_engine',
        note: caps.mediaStream ? 'The kept part plays once in real time and is recorded again.' : 'Trimming uses the video engine (a one-time download) in this browser.' },
      { id: 'format', what: 'Recorded as', status: caps.recorder ? 'yes' : 'no',
        nk: !caps.recorder ? 'format_none' : webm ? (mp4 ? 'format_webm_mp4' : 'format_webm') : mp4 ? 'format_mp4' : 'format_unknown',
        note: !caps.recorder ? 'This browser cannot record media.' : webm ? 'WebM' + (mp4 ? ' or MP4' : '') + '. MP4 and GIF are made on this device with the video engine.' : mp4 ? 'MP4 (this browser writes no WebM).' : 'An unknown type.' },
    ];
  }

  const TABLE = [
    { k: 'win', sk: 'both', browser: 'Chrome, Edge (Windows, ChromeOS)', screen: 'yes', system: 'Tab and whole screen', camera: 'yes' },
    { k: 'mac', sk: 'tab', browser: 'Chrome, Edge (macOS, Linux)', screen: 'yes', system: 'A tab only', camera: 'yes' },
    { k: 'firefox', sk: 'none', browser: 'Firefox (desktop)', screen: 'yes', system: 'none', camera: 'yes' },
    { k: 'safari', sk: 'none', browser: 'Safari (macOS)', screen: 'yes', system: 'none', camera: 'yes' },
    { k: 'mobile', sk: 'none', browser: 'Phones and tablets (iOS, Android)', screen: 'no', system: 'none', camera: 'yes' },
  ];
  return { browserOf, systemAudio, rows, TABLE, NAMES, OSES };
});
