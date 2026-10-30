/* Slop PDF macros — the stylesheet for the macro dialog, injected once by ui.js. Colours come from the --sl-* tokens. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  M.ui = M.ui || {};
  M.ui.CSS = [
    '.spm-dlg{width:min(680px,calc(100vw - 24px));max-width:100%}',
    '.spm-dlg .sui-body{max-height:min(72vh,680px);overflow:auto;-webkit-overflow-scrolling:touch}',
    '.spm-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;align-items:end}',
    '.spm-grid .spm-wide{grid-column:1/-1}',
    '.spm-dlg .sui-field{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0}',
    '.spm-dlg .sui-field .sui-label{white-space:normal}',
    '.spm-grid .sui-input{width:100%;box-sizing:border-box;min-width:0}',
    '.spm-sec{border:1px solid var(--sl-border,#333);border-radius:10px;padding:10px 12px;margin:10px 0;background:var(--sl-surface,transparent)}',
    '.spm-sec h4{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--sl-text-muted,var(--sl-text,inherit));display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
    '.spm-sec h4 .spm-grow{flex:1 1 auto}',
    '.spm-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}',
    '.spm-step{border:1px solid var(--sl-border,#333);border-radius:8px;padding:8px 10px;margin:0 0 8px;background:var(--sl-background,transparent)}',
    '.spm-step-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '.spm-step-head .sui-input{flex:1 1 180px;min-width:0;max-width:100%}',
    '.spm-step-no{font-weight:700;color:var(--sl-text-muted,inherit);min-width:1.4em}',
    '.spm-btn{font:inherit;font-size:13px;min-width:34px;min-height:34px;padding:4px 9px;border-radius:8px;border:1px solid var(--sl-border,#444);background:var(--sl-surface-2,var(--sl-surface,transparent));color:var(--sl-text,inherit);cursor:pointer}',
    '.spm-btn:disabled{opacity:.4;cursor:default}',
    '.spm-btn:focus-visible{outline:2px solid var(--sl-accent,#d4ff3a);outline-offset:2px}',
    '.spm-danger{color:var(--sl-danger,#ff4f6e)}',
    '.spm-colour{width:44px;height:34px;padding:0;border:1px solid var(--sl-border,#444);border-radius:6px;background:none}',
    '.spm-thumb{max-width:120px;max-height:60px;border:1px solid var(--sl-border,#444);border-radius:4px;background:#fff}',
    '.spm-check{display:flex;align-items:center;gap:8px;min-height:34px}',
    '.spm-problems{color:var(--sl-danger,#ff4f6e);margin:0 0 8px;padding-left:18px;font-size:13px}',
    '.spm-problems:empty{display:none}',
    '.spm-log{list-style:none;margin:0;padding:0;font-size:13px;display:grid;gap:6px}',
    '.spm-log li{display:grid;grid-template-columns:20px 1fr;gap:4px 6px;padding:6px 8px;border-radius:6px;background:var(--sl-background,transparent);border:1px solid var(--sl-border,#333)}',
    '.spm-log .spm-mark{font-weight:700;text-align:center}',
    '.spm-log .spm-step-name{font-weight:600;overflow-wrap:anywhere}',
    '.spm-log .spm-msg{grid-column:2;color:var(--sl-text-muted,inherit);overflow-wrap:anywhere}',
    '.spm-ok .spm-mark{color:var(--sl-accent,#2e8b57)}',
    '.spm-warn .spm-mark{color:#b07a00}',
    '.spm-err .spm-mark{color:var(--sl-danger,#ff4f6e)}',
    '.spm-hint{font-size:12px;color:var(--sl-text-muted,inherit);margin:4px 0 0}',
    '@media (max-width:560px){.spm-grid{grid-template-columns:1fr}.spm-step-head .sui-input{flex-basis:100%}}'
  ].join('\n');
})();
