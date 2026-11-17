/* The Authenticator: paste a text, get a certificate that says how machine-written it reads. The homepage's #detector
 * view (home/view.js loads detector/rules.js, samples.js, this file and detector.css the first time the view opens).
 *   SlopDetect.mount(section)  fills the empty <section id="view-detector"> and wires it; returns { input, run }.
 * The score counts up and the stamp slams in (not under reduced motion). Copy verdict uses the shared kit (SlopUI). */
(function () {
  'use strict';
  const S = window.SlopDetect;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const MARKUP = `
    <div class="hero small">
      <p class="kicker"><span>Slopographic</span><span>Authentication Department</span></p>
      <h1 class="page-title" data-perch>The <em>Authenticator</em></h1>
      <p class="lede">Is it genuine slop, or a cheap human counterfeit? Paste any text and get a certificate.</p>
    </div>
    <div class="detector">
      <label for="detect-input" class="sr">Text to authenticate</label>
      <textarea id="detect-input" placeholder="Paste a LinkedIn post, a cover letter, your boss’s email, your own soul…" spellcheck="false"></textarea>
      <div class="detect-actions">
        <button type="button" class="btn" id="sample-slop">Paste genuine slop</button>
        <button type="button" class="btn" id="sample-human">Paste a counterfeit</button>
        <button type="button" class="btn ghost" id="clear">Clear</button>
      </div>
      <div id="result" class="cert" hidden>
        <div class="cert-head"><span>Slopographic</span><span>Certificate of Authenticity</span><span id="serial"></span></div>
        <div class="cert-main">
          <div class="score"><span id="score">0</span><small>%</small><p>slop content</p></div>
          <div class="verdict">
            <div class="tier"><span id="tier-emoji"></span> <span id="tier-name"></span></div>
            <p id="tier-blurb"></p>
            <div class="bar" aria-hidden="true"><div id="bar-fill"></div></div>
          </div>
          <div id="stamp" class="stamp" aria-hidden="true"></div>
        </div>
        <h3>Tells detected</h3>
        <ul id="tells"></ul>
        <h3>Annotated text</h3>
        <div id="annotated"></div>
        <div class="cert-foot"><span>Authenticated by Slopographic</span><span id="cert-date"></span></div>
        <div class="detect-actions"><button type="button" class="btn" id="copy-verdict">Copy verdict</button></div>
      </div>
    </div>`;

  const escapeHTML = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /** The shared kit once the shell has loaded it. */
  const kit = () => Promise.resolve(window.SlopShell && window.SlopShell.ready).then(() => window.SlopUI);
  async function copyText(text, msg) {
    const ui = await kit();
    try {
      await navigator.clipboard.writeText(text);
      if (ui) ui.toast(msg);
    } catch {
      if (!ui) return;
      const field = ui.el('input', { class: 'sui-input', type: 'text', readonly: true, value: text, 'aria-label': 'Text to copy' });
      ui.dialog({ title: 'Copy this', body: ui.el('div', null, field), buttons: [{ label: 'Done', primary: true }] });
      field.addEventListener('focus', () => field.select());
    }
  }

  function mount(section) {
    section.innerHTML = MARKUP;
    const $ = (sel) => section.querySelector(sel);
    const input = $('#detect-input');
    let machineIdx = 0, humanIdx = 0, lastVerdict = '', lastStamp = '', shown = 0, countRaf = 0;

    function countTo(score) {
      const out = $('#score');
      cancelAnimationFrame(countRaf);
      if (reduce()) { shown = score; out.textContent = score; return; }
      const from = shown, t0 = performance.now();
      (function step(now) {
        const p = Math.min(1, (now - t0) / 900);
        shown = Math.round(from + (score - from) * (1 - Math.pow(1 - p, 3)));
        out.textContent = shown;
        if (p < 1) countRaf = requestAnimationFrame(step);
      })(t0);
    }

    function slam(stamp) {
      if (stamp.textContent === lastStamp) return;
      lastStamp = stamp.textContent;
      if (reduce()) return;
      const cert = $('#result');
      stamp.classList.remove('slam');
      cert.classList.remove('thud');
      void stamp.offsetWidth;   // restart the animations
      stamp.classList.add('slam');
      cert.classList.add('thud');
    }

    function run() {
      const text = input.value;
      const box = $('#result');
      if (!text.trim()) { box.hidden = true; return; }
      const r = S.analyze(text);
      box.hidden = false;
      $('#serial').textContent = 'Nº SLP-' + S.hashString(text).toString(36).toUpperCase().padStart(7, '0');
      $('#cert-date').textContent = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      $('#tier-emoji').textContent = r.tier.emoji;
      $('#tier-name').textContent = r.tier.name;
      $('#tier-blurb').textContent = r.tier.blurb;
      $('#bar-fill').style.width = Math.max(1, r.score) + '%';
      const genuine = r.score >= 55;
      const stamp = $('#stamp');
      stamp.className = 'stamp ' + (genuine ? 'genuine' : 'fake');
      stamp.textContent = genuine ? 'Genuine Slop' : r.score >= 30 ? 'Partial Slop' : 'Counterfeit · Human Made';
      countTo(r.score);
      slam(stamp);

      const tells = $('#tells');
      tells.textContent = '';
      const entries = Object.entries(r.tally).sort((a, b) => b[1] - a[1]);
      if (!entries.length) tells.append(el('li', 'none', 'No tells found. Suspiciously human.'));
      for (const [label, n] of entries) {
        const li = el('li');
        li.append(el('b', '', `×${n}`), document.createTextNode(' ' + label));
        tells.append(li);
      }
      let html = '', pos = 0;
      for (const s of r.spans) {
        html += escapeHTML(text.slice(pos, s.start)) + `<mark title="${escapeHTML(s.label)}">${escapeHTML(text.slice(s.start, s.end))}</mark>`;
        pos = s.end;
      }
      $('#annotated').innerHTML = html + escapeHTML(text.slice(pos));
      lastVerdict = `Authenticated by Slopographic: my text is ${r.score}% slop. ${r.tier.emoji} ${r.tier.name}. ${genuine ? 'Genuine slop.' : 'A human counterfeit.'} slopographic.com`;
    }

    const paste = (text) => { input.value = text; run(); };
    let timer = 0;
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });
    $('#sample-slop').addEventListener('click', () => paste(S.samples.MACHINE[machineIdx++ % S.samples.MACHINE.length]));
    $('#sample-human').addEventListener('click', () => paste(S.samples.HUMAN[humanIdx++ % S.samples.HUMAN.length]));
    $('#clear').addEventListener('click', () => { paste(''); input.focus(); });
    $('#copy-verdict').addEventListener('click', () => copyText(lastVerdict, 'Verdict copied.'));
    return { input, run };
  }

  S.mount = mount;
})();
