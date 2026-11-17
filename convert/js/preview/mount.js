/* Entry point for the live preview. Loaded after js/ui/mount.js, so each converter root already has its
 * ConvertTool (root.convertTool). Mounts every [data-convert-preview] block on the page, for the converter
 * on the page or the hub's converter. */
import { PreviewPanel } from './controller.js';

for (const block of document.querySelectorAll('[data-convert-preview]')) {
  const root = document.querySelector('[data-convert-root]');
  if (root && root.convertTool) new PreviewPanel(block, root.convertTool, root);
}
