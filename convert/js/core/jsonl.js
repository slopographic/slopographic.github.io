/* JSON Lines (.jsonl, .ndjson: one JSON value per line) to and from a JSON array. Pure (no DOM).
 *   jsonlToJson(text, { indent }) -> text     blank lines are skipped; a bad line is named with its line number and the
 *                                             place of the mistake (structured.js parseJson)
 *   jsonToJsonl(text) -> { text, count }      an array gives one line per item; any other value is one line */
import { parseJson, formatJson } from './structured.js';
import { tr } from './i18n.js';

export function jsonlToJson(text, { indent = 2 } = {}) {
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  const items = [];
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try { items.push(JSON.parse(line)); } catch (e) {
      let why = '';
      try { parseJson(line); } catch (err) { why = err.message.replace(/^This is not valid JSON:?\s*/, '').replace(/line 1, /, '').replace(/^\.\s*/, ''); }
      throw new Error(why ? tr('convert.md.jsonl_bad_why', { line: String(i + 1), why }) : tr('convert.md.jsonl_bad', { line: String(i + 1) }));
    }
  });
  if (!items.length) throw new Error(tr('convert.md.jsonl_empty'));
  return formatJson(JSON.stringify(items), { indent });
}

export function jsonToJsonl(text) {
  const v = parseJson(text);
  const items = Array.isArray(v) ? v : [v];
  return { text: items.map((x) => JSON.stringify(x)).join('\n') + (items.length ? '\n' : ''), count: items.length };
}
