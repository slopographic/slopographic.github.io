/* Slop package: the page. The seed is in the link (#seed=...). Regenerate draws a new seed, Copy link copies the address,
 * and each file can be downloaded: the document opens in Docs, the table in Tables, the outline in any slide tool.
 * Classic module: loaded by package/index.html. */
import { buildPackage, seedFromHash, newPackageSeed, SEED_PATTERN } from './package.js';

const $ = (id) => document.getElementById(id);
let current = null;

function freshSeed() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return newPackageSeed(bytes);
}

function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function show(seed) {
  current = buildPackage(seed);
  $('seed').value = current.seed;
  $('summary').textContent = `${current.names.title}: ${current.names.company} for ${current.names.client}, on ${current.vars.paper} paper.`;
  const rows = current.table.trim().split('\r\n').map((line) => line.split(','));
  $('table-preview').replaceChildren(...rows.map((cells, i) => {
    const tr = document.createElement('tr');
    cells.forEach((c) => { const td = document.createElement(i ? 'td' : 'th'); td.textContent = c; tr.append(td); });
    return tr;
  }));
  $('outline').textContent = current.outline;
  const url = new URL(location.href);
  url.hash = 'seed=' + encodeURIComponent(current.seed);
  history.replaceState(null, '', url);
}

function regenerate(seed) { show(seed || freshSeed()); }

$('regen').addEventListener('click', () => regenerate());
$('seed').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const typed = $('seed').value.trim();
  if (!SEED_PATTERN.test(typed)) { $('summary').textContent = 'A seed is 8 to 64 letters, digits or dashes.'; return; }
  regenerate(typed);
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); $('copy').textContent = 'Link copied'; }
  catch (e) { $('copy').textContent = 'Copy failed: select the address bar'; }
  setTimeout(() => { $('copy').textContent = 'Copy link'; }, 1600);
});
$('dl-doc').addEventListener('click', () => download(`package-${current.seed}.sdoc`, JSON.stringify(current.doc, null, 2), 'application/json'));
$('dl-csv').addEventListener('click', () => download(`package-${current.seed}.csv`, current.table, 'text/csv'));
$('dl-outline').addEventListener('click', () => download(`package-${current.seed}.md`, current.outline, 'text/markdown'));

regenerate(seedFromHash(location.hash));
