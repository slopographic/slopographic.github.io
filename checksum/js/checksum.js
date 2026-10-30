/* Checksum: hashes a file with the browser's Web Crypto API, on this device. Classic script.
 * SHA-1 is included only for matching older published hashes; it is not collision-resistant. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  let file = null;
  let last = { alg: null, hash: null };

  /** The hash of the chosen file, computed once per algorithm. */
  async function hashOf(alg) {
    if (last.alg === alg && last.hash) return last.hash;
    const data = await file.arrayBuffer();
    const hash = hex(await crypto.subtle.digest(alg, data));
    last = { alg, hash };
    return hash;
  }

  /** Normalises a pasted hash: no spaces, lower case, and any "sha256:" style prefix removed. */
  function clean(s) {
    return String(s || '').trim().toLowerCase().replace(/^(sha-?\d+|sha256|md5)[:\s]+/, '').replace(/\s+/g, '');
  }

  async function show() {
    const alg = $('ck-alg').value;
    $('ck-copy').disabled = true;
    if (!file) { $('ck-hash').textContent = ''; $('ck-verdict').textContent = ''; $('ck-status').textContent = ''; return; }
    $('ck-status').textContent = t('checksum.app.reading', { name: file.name, mb: (file.size / 1048576).toFixed(1) });
    const hash = await hashOf(alg);
    $('ck-hash').textContent = hash;
    $('ck-copy').disabled = false;
    $('ck-status').textContent = t('checksum.app.hash_of', { alg, name: file.name });
    check();
  }

  function check() {
    const want = clean($('ck-expect').value);
    const have = last.hash;
    const v = $('ck-verdict');
    v.className = 'ck-verdict';
    if (!want) { v.textContent = ''; return; }
    if (!file || !have) { v.textContent = t('checksum.app.choose_first'); return; }
    if (!/^[0-9a-f]+$/.test(want)) { v.textContent = t('checksum.app.not_hash'); return; }
    if (want.length !== have.length) {
      v.textContent = t('checksum.app.length_differs', { alg: $('ck-alg').value, n: have.length });
      v.classList.add('bad');
      return;
    }
    const same = want === have;
    v.textContent = same ? t('checksum.app.match') : t('checksum.app.no_match');
    v.classList.add(same ? 'ok' : 'bad');
  }

  function choose(f) {
    file = f || null;
    last = { alg: null, hash: null };
    show();
  }

  /** The algorithm a task page's link asks for (?alg=sha256|sha384|sha512|sha1), or null. This visit only: the choice
   *  is not stored, and unknown values are ignored. */
  const ALGS = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512', sha1: 'SHA-1' };
  function presetOf(search) {
    const a = new URLSearchParams(search || '').get('alg');
    return a && Object.prototype.hasOwnProperty.call(ALGS, a.toLowerCase()) ? ALGS[a.toLowerCase()] : null;
  }
  const preset = presetOf(location.search);
  if (preset) $('ck-alg').value = preset;

  const drop = $('ck-drop');
  // The one way in (shared/intake, spec 'checksum'): the box (click to choose, or a drop on it) and a paste; one file.
  SlopIntake.register({ id: 'checksum', accept: { any: true, allowEmpty: true, noun: 'checksum.app.a_file' }, limit: 1, toast: false, process: async (f) => { drop.classList.remove('over'); await choose(f); return f.name; } });
  $('ck-alg').addEventListener('change', show);
  $('ck-expect').addEventListener('input', check);
  $('ck-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(last.hash); $('ck-copy').textContent = t('checksum.app.copied'); }
    catch (e) { $('ck-copy').textContent = t('checksum.app.copy_failed'); }
    setTimeout(() => { $('ck-copy').textContent = t('checksum.app.copy'); }, 1500);
  });
  drop.addEventListener('click', () => SlopIntake.pick({ to: 'checksum', multiple: false }));
  SlopIntake.dropTarget(drop, { to: 'checksum' });
  drop.addEventListener('dragenter', () => drop.classList.add('over'));
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));

  // a language change: the status and the verdict again, in the new language (the hash is kept)
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (file) show(); });

  // Exposed for the browser test and the assistant's commands (ai-commands.js).
  window.SlopChecksum = { presetOf, hashOf: (alg, f) => { file = f; last = { alg: null, hash: null }; return hashOf(alg); }, clean,
    /** Shows a file's hash on the page, checked against expected: { hash, verdict }. */
    async use(f, alg, expected) { if (alg) $('ck-alg').value = alg; if (expected != null) $('ck-expect').value = expected; file = f; last = { alg: null, hash: null }; await show(); return { hash: last.hash, verdict: $('ck-verdict').textContent }; },
    /** Sets the published hash to check against (the paste box): the verdict, or '' when there is nothing to check. */
    expectHash(text) { $('ck-expect').value = text || ''; check(); return $('ck-verdict').textContent; },
    current: () => ({ file: file ? file.name : null, size: file ? file.size : null, algorithm: $('ck-alg').value, hash: last.hash, expected: $('ck-expect').value, verdict: $('ck-verdict').textContent }) };
  // SlopCmd: the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
  const C = window.SlopCmd;
  if (C) {
    C.init({ app: 'checksum' });
    const HERE = (document.currentScript && document.currentScript.src) || location.href;
    C.provide({ prepare: () => new Promise((res, rej) => {
      const s = Object.assign(document.createElement('script'), { src: new URL('ai-commands.js', HERE).href });
      s.onload = res; s.onerror = () => rej(new Error('Could not load ai-commands.js')); document.head.append(s);
    }) });
  }
})();
