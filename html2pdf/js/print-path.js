/* Slop HTML to PDF: the print path. Uses window.SlopPrint (shared/print/print.js) when it is loaded, otherwise a
 * built-in print of the same document in a hidden frame. Classic script. Exposes window.H2P.printPath. */
(function () {
  'use strict';

  /** Built-in path: prints a full document from a hidden frame, and removes the frame after printing. */
  function builtIn(fullDocument) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.setAttribute('sandbox', 'allow-same-origin allow-modals'); // no script runs in it; print() from here needs modals
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    f.srcdoc = fullDocument();
    document.body.append(f);
    let timer = 0;
    const done = () => { clearTimeout(timer); f.remove(); };
    f.addEventListener('load', () => {
      timer = setTimeout(done, 600000); // safety net if afterprint never fires
      const w = f.contentWindow;
      w.addEventListener('afterprint', done, { once: true });
      try { w.focus(); w.print(); } catch (e) { done(); }
    }, { once: true });
    return true;
  }

  /** job: { title, html (fragment), paper, orientation, fullDocument: () => string }.
   *  Returns the path used: 'SlopPrint' or 'built-in', or '' when no dialog opened. */
  function print(job) {
    const SP = window.SlopPrint;
    if (SP && typeof SP.open === 'function') {
      const dlg = SP.open({ title: job.title, html: job.html, paper: job.paper, orientation: job.orientation });
      return dlg ? 'SlopPrint' : '';
    }
    return builtIn(job.fullDocument) ? 'built-in' : '';
  }

  window.H2P = Object.assign(window.H2P || {}, { printPath: { print } });
})();
