/* Slop Code: the built-in formatter (a pure function, no network). JSON is parsed and printed with two-space
 * indents. JavaScript, TypeScript and CSS are re-indented by brace depth; lines that start inside a block comment
 * or a template literal are kept as they are. Every language loses trailing spaces and gets one final newline. */

/** Format `text` for the language id ('json', 'javascript', 'typescript', 'css', or any other). Throws on bad JSON. */
export function formatText(text, langId) {
  if (langId === 'json') {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Not valid JSON: ' + e.message); }
    return JSON.stringify(data, null, 2) + '\n';
  }
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const braces = langId === 'javascript' || langId === 'typescript' || langId === 'css';
  const out = [];
  let depth = 0, mode = null, blank = false;
  for (const raw of lines) {
    if (mode) { // inside a block comment or template literal: keep the text, only track where it ends
      out.push(raw); // verbatim: trailing spaces inside a template literal are part of the text
      mode = scan(raw, mode).mode;
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) { if (!blank && out.length) out.push(''); blank = true; continue; }
    blank = false;
    const s = braces ? scan(trimmed, null) : { mode: null, delta: 0 };
    const indent = braces ? Math.max(0, depth - (/^[}\])]/.test(trimmed) ? 1 : 0)) : 0;
    out.push(braces ? '  '.repeat(indent) + trimmed : raw.replace(/[ \t]+$/, ''));
    depth = Math.max(0, depth + s.delta);
    mode = s.mode;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

/** Scan one line: the brace depth change, and whether a block comment or template literal is still open. */
function scan(line, mode) {
  let delta = 0, quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i], d = line[i + 1];
    if (mode === '/*') { if (c === '*' && d === '/') { mode = null; i++; } continue; }
    if (mode === '`') { if (c === '\\') i++; else if (c === '`') mode = null; continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && d === '/') break;
    if (c === '/' && d === '*') { mode = '/*'; i++; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '`') { mode = '`'; continue; }
    if (c === '{' || c === '(' || c === '[') delta++;
    else if (c === '}' || c === ')' || c === ']') delta--;
  }
  return { mode, delta };
}
