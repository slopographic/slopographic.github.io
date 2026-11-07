/* The text of a Slop Slides deck (the model slides/js/io/pptx-in.js reads a PowerPoint file into), as plain text. Pure:
 * no DOM, so the Node tests run it on a deck object. Each slide is a "Slide n" line, its title, then the other text in
 * reading order (top to bottom, then left to right): text boxes and shapes (bulleted paragraphs get "• ", indented by
 * level), tables (one row a line, cells separated by tabs) and groups. Speaker notes follow under "Notes:" when asked.
 *   deckText(deck, { notes = false, hidden = false })   hidden: also the hidden slides (marked "(hidden)") */
const lines = (text) => (text && text.paras ? text.paras : []).map((p) => {
  const t = (p.runs || []).map((r) => r.t || '').join('').replace(/\s+$/, '');
  if (!t.trim()) return '';
  return p.bullet && p.bullet !== 'none' ? '  '.repeat(Math.max(0, p.level || 0)) + '• ' + t.trimStart() : t;
}).filter(Boolean);

function objectLines(o) {
  if (!o || o.opacity === 0) return [];
  if (o.type === 'group') return order(o.children || []).flatMap(objectLines);
  if (o.type === 'table') return (o.cells || []).map((row) => row.map((c) => lines(c && c.text).join(' ')).join('\t')).filter((r) => r.trim());
  if (o.type === 'chart') return o.title ? [o.title] : [];
  return lines(o.text);
}
/** Objects in reading order: by top edge in bands of 8 pt, then by left edge. */
const order = (objs) => objs.map((o, i) => ({ o, i })).sort((a, b) => (Math.round((a.o.y || 0) / 8) - Math.round((b.o.y || 0) / 8)) || ((a.o.x || 0) - (b.o.x || 0)) || (a.i - b.i)).map((e) => e.o);

export function slideText(slide, { notes = false } = {}) {
  const objs = slide.objects || [];
  const title = objs.filter((o) => o.placeholder === 'title' || o.placeholder === 'ctrTitle');
  const rest = order(objs.filter((o) => !title.includes(o)));
  const out = [...title.flatMap(objectLines), ...rest.flatMap(objectLines)];
  const n = String(slide.notes || '').trim();
  if (notes && n) out.push('', 'Notes:', n); // i18n-ignore: written into the text file
  return out;
}

export function deckText(deck, { notes = false, hidden = false } = {}) {
  const blocks = [];
  (deck.slides || []).forEach((s, i) => {
    if (s.hidden && !hidden) return;
    blocks.push([`Slide ${i + 1}${s.hidden ? ' (hidden)' : ''}`, ...slideText(s, { notes })].join('\n'));
  });
  return blocks.join('\n\n') + '\n';
}
