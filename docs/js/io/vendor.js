/* Slop Docs — io/vendor: loads the vendored libraries on first use, as classic scripts (they set globals).
 *   fontkit() → window.fontkit (vendor/fontkit; vendor/regenerator-runtime first: fontkit's Indic shaping needs it)
 *   pdfLib()  → window.PDFLib (vendor/pdf-lib)
 * The same files Slop PDF uses. Nothing is fetched until a language font or a PDF is needed. */
const VENDOR = new URL('../../../vendor/', import.meta.url).href;
const loading = new Map();

function script(rel, global) {
  if (globalThis[global]) return Promise.resolve(globalThis[global]);
  if (!loading.has(rel)) {
    const p = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = VENDOR + rel; s.async = false;
      s.onload = () => (globalThis[global] ? res(globalThis[global]) : rej(new Error(rel + ' did not load')));
      s.onerror = () => rej(new Error('Could not load ' + rel));
      document.head.append(s);
    });
    p.catch(() => loading.delete(rel));
    loading.set(rel, p);
  }
  return loading.get(rel);
}

export async function fontkit() {
  await script('regenerator-runtime/runtime.js', 'regeneratorRuntime');
  return script('fontkit/fontkit.min.js', 'fontkit');
}
export const pdfLib = () => script('pdf-lib/pdf-lib.min.js', 'PDFLib');
