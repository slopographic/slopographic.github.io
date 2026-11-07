/* Slop Docs — bridge: the ES-module engine, exposed as window.SlopDocEngine for the classic UI scripts in
 * docs/js/ui/ (classic scripts cannot import modules). Loaded first, as a deferred module, so it runs
 * before the deferred UI scripts. Fires 'slopdocs:engine' when ready. */
import * as M from './model/doc.js';
import * as S from './model/styles.js';
import * as O from './model/ops.js';
import * as F from './fonts/registry.js';
import { layoutDoc } from './layout/index.js';
import { resolvedProps, clearParaCache } from './layout/para.js';
import { marksAt } from './model/ops.js';
import * as SD from './io/sdoc.js';
import * as DX from './io/docx.js';
import * as TB from './model/table-ops.js';
import * as TPL from '../../shared/templates/generate.js';
import { checkDoc } from '../../shared/templates/check.js';
import { fragRuns, visualChars } from './layout/runs.js';
import * as LANG from './fonts/lang.js';
import { ensureDocLang, mayNeedLang } from './fonts/lang-doc.js';
import * as HF from './model/hf.js';
import { ensureDocFonts } from './fonts/doc-fonts.js';   // every face the runs use (the layout falls back to nearby faces until they arrive)
/** The PDF writer is loaded on first use (it pulls in pdf-lib). */
const exportPdf = async (doc, layout, opts) => (await import('./io/pdf.js')).exportPdf(doc, layout, opts);

// a face that finishes loading changes the metrics: drop cached paragraph layouts and let the UI re-lay out
F.onFontLoad(() => { clearParaCache(); window.dispatchEvent(new Event('slopdocs:fonts')); });
LANG.onLangLoad(() => { clearParaCache(); window.dispatchEvent(new Event('slopdocs:fonts')); });

window.SlopDocEngine = {
  M, S, O, F, SD, DX, TB, LANG, HF,
  fragRuns, visualChars, ensureLangFonts: ensureDocLang, mayNeedLang, exportPdf,
  TPL: { ...TPL, checkDoc },
  layoutDoc, resolvedProps, marksAt, ensureDocFonts, clearParaCache,
  textWidth: F.textWidth, vmetrics: F.vmetrics, bestFace: F.bestFace, familyOf: F.familyOf, cssFamily: F.cssFamily,
  FAMILIES: F.FAMILIES, onFontLoad: F.onFontLoad,
  ready: true,
};
document.dispatchEvent(new Event('slopdocs:engine'));
