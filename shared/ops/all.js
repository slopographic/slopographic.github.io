/* Every operation on the site, in one registry (shared/ops/registry.js): File convert's conversions (its catalog
 * registers them) and the apps' headless operations. Slop Workflows imports this; File convert imports only its catalog.
 * The order here is the order of the apps in the step menu (File convert first, as registered by the catalog). */
import '../../convert/js/core/catalog.js';
import './isolate.js';
import './watermark.js';
import './resize.js';
import './upscale.js';
import './clean.js';
import './colors.js';
import './ocr.js';
import './files.js';
import './pdf-extract.js';   // Slop PDF: a PDF's images, attachments and fonts as files
import './diff.js';   // Slop Compare: two files → a report
import './video.js';   // SlopCut's edit list, reframe, captions and reel, and Slop Transcribe's speech to text
import './create.js';
import './create-tables.js';
import './retouch.js';   // PhotoSlop's Auto enhance and Portrait retouch, run in its hidden copy
import './macros.js';   // the apps' recorded macros (app host adapters), after the apps' own operations

export * from './registry.js';
export { macrosReady, onMacros } from './macros.js';
