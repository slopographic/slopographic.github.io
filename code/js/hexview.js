/* Slop Code: the hex view, a read-only dump of any blob, 16 bytes a row:
 *   00000010  89 50 4e 47 0d 0a 1a 0a  00 00 00 0d 49 48 44 52  |.PNG........IHDR|
 * Virtualised: a spacer gives the scroller its height and only the rows on screen (and a few more) exist, redrawn on scroll
 * in requestAnimationFrame. When rows x row height passes 8,000,000 px the spacer stops there and the scroll position maps
 * linearly to the first row, so a file of any size scrolls end to end. Bytes come from hex-data.js (64 KB chunks, read
 * when a row needs them), finding from hex-find.js. No mouse listeners: a click on a byte marks it. */
import { t, el } from './dom.js';
import { createChunks, CHUNK } from './hex-data.js';
import { search } from './hex-find.js';
import { HEX, CH, hex8, offsetText, sizeLine, parseOffset, parseQuery } from './hex-fmt.js';

const PER_ROW = 16, OVERSCAN = 6, MAX_PX = 8000000;

/** Show `blob` as a hex dump in `host` (emptied first). opts.name is the file name, opts.kind a line already worded
 *  ('SQLite 3 database'). Returns { destroy(), goto(offset), find(query, backwards) }; find resolves true when it found. */
export function mountHex(host, blob, opts = {}) {
  const size = blob.size, rows = Math.ceil(size / PER_ROW), pool = [];
  let rowH = 20, scaled = false, pin = null, sel = -1, frame = 0, dead = false, run = 0, later = false;
  const chunks = createChunks(blob, () => schedule());

  // ---- the page: header, the two forms, the scroller, the byte line and the status line
  const gotoIn = el('input', { type: 'text', class: 'cd-hex-in cd-hex-goto', spellcheck: 'false', autocomplete: 'off', placeholder: t('code.hex.goto_ph') });
  const findIn = el('input', { type: 'text', class: 'cd-hex-in cd-hex-findbox', spellcheck: 'false', autocomplete: 'off', placeholder: t('code.hex.find_ph') });
  const layer = el('div', { class: 'cd-hex-rows' });
  const space = el('div', { class: 'cd-hex-space' }, layer, size ? null : el('p', { class: 'cd-hex-empty' }, t('code.hex.empty')));
  const scroller = el('div', { class: 'cd-hex-scroll', tabindex: 0, role: 'region', 'aria-label': t('code.hex.label'), 'data-touch-surface': '' }, space);
  const info = el('span', { class: 'cd-hex-info', 'aria-live': 'polite' });
  const status = el('span', { class: 'cd-hex-status', role: 'status', 'aria-live': 'polite' });
  const form = (label, input, ...buttons) => el('form', { class: 'cd-hex-form', onsubmit: (e) => e.preventDefault() }, el('label', null, el('span', null, label), input), buttons);
  const btn = (text, fn) => el('button', { type: 'button', class: 'cd-hex-btn', onclick: fn }, text);
  const root = el('div', { class: 'cd-hex' },
    el('div', { class: 'cd-hex-head' }, el('strong', { class: 'cd-hex-name' }, opts.name || ''), el('span', { class: 'cd-hex-size' }, sizeLine(size)),
      opts.kind ? el('span', { class: 'cd-hex-kind' }, opts.kind) : null),
    el('div', { class: 'cd-hex-bar' },
      form(t('code.hex.goto'), gotoIn, btn(t('code.hex.go'), () => onGoto())),
      form(t('code.hex.find'), findIn, btn(t('code.hex.next'), () => find(findIn.value, false)), btn(t('code.hex.prev'), () => find(findIn.value, true)))),
    scroller, el('div', { class: 'cd-hex-foot' }, info, status));
  host.replaceChildren(root);

  // ---- rows: a pool of row elements, each a fixed set of text nodes that are rewritten when the row shows other bytes
  function makeRow() {
    const offT = document.createTextNode(''), hexT = [], ascT = [], hs = [], as = [];
    const parts = [el('span', { class: 'cd-hex-off' }, offT), '  '];
    for (let j = 0; j < PER_ROW; j++) {
      hexT.push(document.createTextNode('')); ascT.push(document.createTextNode(''));
      hs.push(el('span', { class: 'cd-hex-b', 'data-j': j }, hexT[j])); as.push(el('span', { class: 'cd-hex-c', 'data-j': j }, ascT[j]));
      parts.push(hs[j], j === 7 ? '  ' : j === 15 ? '  |' : ' ');
    }
    parts.push(...as, '|');
    return { node: el('div', { class: 'cd-hex-row' }, ...parts), offT, hexT, ascT, hs, as, sel: -1 };
  }
  const put = (n, v) => { if (n.data !== v) n.data = v; };

  /** Write row number r into a pool row: its bytes, or blanks where the chunk is still being read or the file has ended. */
  function fill(row, r) {
    const off = r * PER_ROW, chunk = chunks.at(off), base = off % CHUNK;
    row.node.dataset.off = off;
    row.node.classList.toggle('cd-hex-alt', r % 2 === 1);
    row.node.classList.toggle('cd-hex-wait', !chunk);
    put(row.offT, hex8(off));
    for (let j = 0; j < PER_ROW; j++) {
      const live = chunk && off + j < size, b = live ? chunk[base + j] : 0;
      put(row.hexT[j], live ? HEX[b] : '  ');
      put(row.ascT[j], live ? CH[b] : off + j < size ? ' ' : '');
    }
    const j = sel >= off && sel < off + PER_ROW ? sel - off : -1;
    if (row.sel === j) return;
    if (row.sel >= 0) for (const c of [row.hs[row.sel], row.as[row.sel]]) c.classList.remove('cd-hex-sel');
    if (j >= 0) for (const c of [row.hs[j], row.as[j]]) c.classList.add('cd-hex-sel');
    row.sel = j;
  }

  // ---- scrolling: the first row on screen, and the two ways it follows the scroll position
  const fullRows = () => Math.max(1, Math.floor(scroller.clientHeight / rowH));
  function firstRow() {
    const st = scroller.scrollTop, max = scroller.scrollHeight - scroller.clientHeight, last = Math.max(0, rows - fullRows());
    if (!scaled) return Math.min(Math.floor(st / rowH), last);
    if (pin && pin.top === st) return pin.row;   // the last jump (a key, Go to, Find) lands on its exact row
    return max > 0 ? (st >= max - 1 ? last : Math.round(st / max * last)) : 0;
  }
  /** A row to measure, and the spacer at its height: the scroller cannot scroll before it has them. */
  function layout() {
    if (!rows) return;
    if (!pool.length) { pool.push(makeRow()); layer.append(pool[0].node); }
    const m = pool[0].node.getBoundingClientRect().height;
    if (m > 0 && (m !== rowH || !space.style.height)) {
      rowH = m; scaled = rows * rowH > MAX_PX;
      space.style.height = (scaled ? MAX_PX : rows * rowH) + 'px';
    }
  }
  /** Scroll so that row `row` is the first on screen. */
  function setFirst(row) {
    layout();
    const last = Math.max(0, rows - fullRows());
    row = Math.min(Math.max(0, Math.round(row)), last);
    if (!scaled) scroller.scrollTop = row * rowH;
    else {
      const max = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = last ? row / last * max : 0;
      pin = { top: scroller.scrollTop, row };
    }
    schedule();
  }
  function schedule() { if (!frame && !dead) frame = requestAnimationFrame(render); }

  function render() {
    frame = 0;
    if (dead || !rows || !scroller.clientHeight) return;
    layout();
    if (later) centre();
    const first = firstRow(), from = Math.max(0, first - OVERSCAN), to = Math.min(rows, first + Math.ceil(scroller.clientHeight / rowH) + OVERSCAN);
    while (pool.length < to - from) { const r = makeRow(); pool.push(r); layer.append(r.node); }
    while (pool.length > to - from) { layer.lastChild.remove(); pool.pop(); }
    layer.style.top = (scaled ? scroller.scrollTop - (first - from) * rowH : from * rowH) + 'px';
    pool.forEach((row, i) => fill(row, from + i));
    showByte();
  }

  /** The byte line: 'Offset 0x1f40 · 0x4e · 78 · N' for the marked byte, once its chunk is here. */
  function showByte() {
    const chunk = sel >= 0 ? chunks.at(sel) : null, b = chunk ? chunk[sel % CHUNK] : 0;
    const text = chunk ? t('code.hex.byte', { offset: offsetText(sel), hex: '0x' + HEX[b], dec: String(b), char: CH[b] }) : '';
    if (info.textContent !== text) info.textContent = text;
  }
  /** Mark byte o (both columns) and bring it to the middle of the view (when the view has no height yet, once it has one). */
  function select(o) {
    sel = o;
    later = true;
    centre();
    showByte();
  }
  function centre() {
    layout();
    if (!scroller.clientHeight || sel < 0) return;
    later = false;
    setFirst(Math.floor(sel / PER_ROW) - Math.floor(fullRows() / 2));
  }

  // ---- Go to offset and Find
  const say = (text) => { status.textContent = text; };
  function onGoto() {
    const o = parseOffset(gotoIn.value);
    if (Number.isNaN(o)) return say(t('code.hex.bad_offset'));
    if (o >= size) return say(t('code.hex.range', { size: String(size) }));
    say('');
    select(o);
  }
  async function find(query, backwards = false) {
    const nd = parseQuery(query);
    if (dead || !nd) return false;
    const mine = ++run, cancelled = () => dead || mine !== run;
    say(t('code.hex.searching', { pct: '0' }));
    const from = sel >= 0 ? sel : firstRow() * PER_ROW - 1;
    const at = await search(blob, nd, from, backwards, cancelled, (p) => { if (!cancelled()) say(t('code.hex.searching', { pct: String(Math.round(p * 100)) })); });
    if (cancelled()) return false;
    if (at < 0) { say(t('code.hex.not_found')); return false; }
    select(at);
    say(t('code.hex.found', { offset: offsetText(at) }));
    return true;
  }

  // ---- events: click marks a byte; keys move the view (so a scaled view steps by rows too); Ctrl+G; Enter in the boxes
  scroller.addEventListener('scroll', schedule, { passive: true });
  scroller.addEventListener('click', (e) => {
    const c = e.target.closest ? e.target.closest('.cd-hex-b, .cd-hex-c') : null;
    const o = c ? Number(c.parentNode.dataset.off) + Number(c.dataset.j) : -1;
    if (o < 0 || o >= size) return;
    sel = o;
    cancelAnimationFrame(frame);
    render();   // the mark shows at once
  });
  scroller.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const first = firstRow(), page = fullRows() - 1;
    const to = { ArrowDown: first + 1, ArrowUp: first - 1, PageDown: first + page, PageUp: first - page, Home: 0, End: rows }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setFirst(to);
  });
  root.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); gotoIn.focus(); gotoIn.select(); }
  });
  gotoIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); onGoto(); } });
  findIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); find(findIn.value, e.shiftKey); } });
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  if (watcher) watcher.observe(scroller);
  schedule();

  return {
    /** Stop everything (a search in progress ends, false) and empty the host. */
    destroy() {
      if (dead) return;
      dead = true; run++;
      cancelAnimationFrame(frame);
      if (watcher) watcher.disconnect();
      chunks.dispose();
      if (root.parentNode === host) host.replaceChildren();
    },
    /** Mark the byte at this offset (clamped to the file) and scroll to it. */
    goto(offset) { if (!dead && size && offset >= 0) select(Math.min(Math.floor(offset), size - 1)); },
    find,
  };
}
