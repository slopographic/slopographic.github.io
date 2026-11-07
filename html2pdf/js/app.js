/* Slop HTML to PDF: the page. Opens one HTML file or pasted text, shows it on a paper-sized preview (an isolated
 * frame with the header), and prints through SlopPrint, or the built-in path when SlopPrint is missing.
 * Classic script. Nothing is uploaded: the file is read in this browser. */
(function () {
  'use strict';
  const H = window.H2P, S = H.sheet, SRC = H.source;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const PASTED = 'Pasted HTML';   // i18n-ignore: the name printed in the document's header
  const st = { name: PASTED, html: '', images: new Map(), dims: [210, 297] };
  const px = (mm) => (mm * 96) / 25.4;

  /** The options from the page, plus the header's file name, date and QR code. */
  function options() {
    const mode = $('h2p-qr-mode').value, typed = $('h2p-qr-text').value.trim();
    return {
      paper: $('h2p-paper').value, orientation: $('h2p-orient').value, margin: $('h2p-margin').value,
      scale: $('h2p-scale').value, background: $('h2p-bg').checked, header: $('h2p-header').checked,
      fileName: st.name, date: S.isoDate(new Date()),
      url: mode === 'url' ? typed : '',
      qrSvg: H.qr.svg(mode !== 'file' && typed ? typed : st.name),
    };
  }
  const hasSource = () => st.html.trim() !== '';
  const cleaned = () => SRC.prepare(st.html, st.images);
  // the status line keeps its key, so a language change says it again in the new language
  let said = null;
  const status = (k, v) => { said = [k, v]; $('h2p-status').textContent = t(k, v); };

  /** Scales the paper to the stage width. The frame keeps its paper size inside, so the page lays out as printed. */
  function fit() {
    const box = $('h2p-paper-box'), frame = $('h2p-paper-frame');
    if (!box.clientWidth) return;
    const [w, h] = st.dims, k = Math.min(1.5, box.clientWidth / px(w));
    Object.assign(frame.style, { width: px(w) + 'px', height: px(h) + 'px', transform: `scale(${k})` });
    box.style.height = px(h) * k + 'px';
  }

  function render() {
    const has = hasSource(), mode = $('h2p-qr-mode').value;
    $('h2p-empty').hidden = has;
    $('h2p-paper-box').hidden = !has;
    $('h2p-print').disabled = !has;
    $('h2p-qr-text').disabled = mode === 'file';
    $('h2p-qr-label').textContent = mode === 'url' ? t('html2pdf.header.url') : t('html2pdf.header.qr_text');
    if (!has) return;
    const o = options();
    st.dims = S.sizeMm(o);
    $('h2p-paper-frame').srcdoc = S.previewDoc(o, cleaned());
    fit();
  }

  function setSource(name, text) {
    st.name = name;
    st.html = String(text || '');
    render();
    if (hasSource()) status('html2pdf.status.ready', { name }); else status('html2pdf.status.empty');
  }

  async function openFile(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') { status('html2pdf.status.not_html'); return; }
    try { setSource(file.name, await file.text()); } catch (e) { status('html2pdf.status.read_failed'); }
  }

  function imageList() {
    const names = [...st.images.keys()];
    $('h2p-image-list').textContent = names.length ? t('html2pdf.source.attached', { names: names.join(', ') }) : t('html2pdf.source.no_images');
  }

  function attachImages(files) {
    for (const url of st.images.values()) URL.revokeObjectURL(url);
    st.images = new Map();
    for (const f of files) if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(f.name)) st.images.set(f.name, URL.createObjectURL(f));
    imageList();
    render();
  }

  function print() {
    if (!hasSource()) return;
    const o = options(), src = cleaned();
    const used = H.printPath.print({
      title: o.fileName, paper: o.paper, orientation: o.orientation,
      html: S.printHtml(o, src), fullDocument: () => S.printDocument(o, src, o.fileName),
    });
    if (used) status('html2pdf.status.opened', { path: used === 'built-in' ? t('html2pdf.status.builtin') : used });
    else status('html2pdf.status.not_opened');
  }

  /* Ctrl+P (Cmd+P) on this page prints this document through SlopPrint. */
  if (window.SlopPrint && typeof window.SlopPrint.register === 'function') {
    window.SlopPrint.register('html2pdf', () => {
      if (!hasSource()) return null;
      const o = options(), src = cleaned();
      return { title: o.fileName, html: S.printHtml(o, src), paper: o.paper, orientation: o.orientation };
    });
  }

  for (const id of ['h2p-paper', 'h2p-orient', 'h2p-margin', 'h2p-scale', 'h2p-bg', 'h2p-header', 'h2p-qr-mode']) $(id).addEventListener('change', render);
  $('h2p-qr-text').addEventListener('input', render);
  const stage = $('h2p-stage');
  // The one way in (shared/intake, spec 'html2pdf'): Open, a drop anywhere on the page, a paste of an .html file,
  // ?drive=<id> (another app's Open in) and a PWA launch reach openFile; the local images are a part of their own.
  const SI = window.SlopIntake;
  SI.register({ id: 'html2pdf', limit: 1, accept: { types: ['text/html'], exts: ['.html', '.htm'], noun: 'html2pdf.app.an_html_file' }, process: async (f) => { stage.classList.remove('h2p-over'); await openFile(f); return f.name; } });
  SI.register({ id: 'html2pdf.images', main: false, paste: false, toast: false, accept: { types: ['image/*'], exts: ['.svg'], noun: 'html2pdf.app.a_picture' }, processAll: (files) => { attachImages(files); return files.map((f) => f.name); } });
  const pickHtml = () => SI.pick({ to: 'html2pdf', multiple: false, accept: '.html,.htm,text/html' });
  $('h2p-open').addEventListener('click', pickHtml);
  $('h2p-open-empty').addEventListener('click', pickHtml);
  $('h2p-use-paste').addEventListener('click', () => {
    const text = $('h2p-paste').value;
    if (text.trim()) setSource(PASTED, text); else status('html2pdf.status.paste_first');
  });
  $('h2p-images').addEventListener('click', () => SI.pick({ to: 'html2pdf.images', accept: 'image/*' }));
  $('h2p-print').addEventListener('click', print);

  /* Drops anywhere on the page open the file (the intake's drop target). The preview frame ignores pointer input, so the
     drop reaches the page. */
  SI.dropTarget(document.body, { to: 'html2pdf' });
  addEventListener('dragenter', () => stage.classList.add('h2p-over'));
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) stage.classList.remove('h2p-over'); });
  if (window.SlopHub) { try { SlopHub.register('html2pdf'); } catch (e) { /* bus unavailable */ } }
  SI.launch({ to: 'html2pdf' });
  addEventListener('resize', fit);

  render();
  imageList();
  status('html2pdf.status.start');
  // a language change: the status line, the image list, the QR label and the commands again, in the new language
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (said) status(said[0], said[1]); imageList(); render(); cmds(); });

  /* The page's actions for the commands: Ctrl+K and the assistant (ai-commands.js, loaded by SlopCmd.prepare()). */
  H.app = { st, setSource, attachImages, options, cleaned, hasSource, render, status: () => $('h2p-status').textContent };
  function cmds() {
    if (!window.SlopCmd) return;
    window.SlopCmd.register([{ id: 'h2p.open', title: t('html2pdf.cmd.open'), group: t('menu.file'), keys: [], run: () => $('h2p-open').click() },
      { id: 'h2p.print', title: t('html2pdf.app.print'), group: t('menu.file'), keys: [], when: hasSource, run: print }]);
  }
  if (window.SlopCmd) {
    const C = window.SlopCmd;
    C.init({ app: 'html2pdf' });
    cmds();
    if (C.provide) C.provide({ prepare: () => import(new URL('js/ai-commands.js', location.href).href) });
  }
})();
