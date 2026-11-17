// Finds hard-coded, user-visible English in source text, to guide a translation pass (tools/i18n/i18n.mjs extract).
// It is a heuristic, not a parser: it reads string literals in JavaScript (skipping comments, regular expressions,
// console.* and thrown errors) and text and labelling attributes in HTML, and keeps what reads like words for a person.
// A literal counts when a UI API takes it (label:, title:, toast(), textContent =, h('b', ..., 'Text'), ...), or when it
// reads like prose (a capital and a lower-case letter, or two words). Keys (dotted lower case), ids, CSS, URLs, file
// names and code do not count. A template literal counts by its static text (`Saved ${n} files` → 'Saved {…} files'),
// and a lower-case fragment ('selected', ' more', `${n} of ${m}`) counts where only text can go (STRONG_UI: textContent,
// a label:, a toast, an h() child), so a word joined to a number is found while ids and enum values are not.
// Pure functions; no file system.

const UI_PROP = /(?:^|[^\w$])(label|title|desc|description|placeholder|text|tip|tooltip|hint|empty|emptyLabel|message|msg|caption|heading|help|note|summary|confirm|ok|cancel|alt|name|sub|status|error|aria-label|ariaLabel|label2|unit|group)\s*:\s*(?:[^,{}:;'"`]*\+\s*)?$/;
const UI_CALL = /(?:toast|alert|confirm|prompt|status|setStatus|announce|say|busy|guarded|notify|warn|fail|tip|dialog|ask|err|note|info|live|progress|msg|menuItem|item|option|button|btn|cmd|addItem|section|row|field|check|tab)\s*\(\s*(?:[^()]*[,+]\s*)?$/i;
const UI_ASSIGN = /(?:textContent|innerText|title|placeholder|ariaLabel|label|value|alt)\s*(?:\+?=)\s*(?:[^=;]*\?\s*)?(?:[^=;]*:\s*)?(?:[^=;?:'"`]*\+\s*)?$/;
const UI_ATTR_CALL = /setAttribute\(\s*['"](?:aria-label|title|placeholder|alt|aria-description|data-tip)['"]\s*,\s*$/;
const H_CHILD = /\bh\(\s*['"][\w.-]+['"]\s*,\s*(?:null|\{[^{}]*\}|\w+)\s*,\s*(?:[^()]*[,+]\s*)?$/;
// Where only text a person reads can go: here a lower-case fragment ('selected', ' more') counts too.
const STRONG_UI = [
  /(?:^|[^\w$])(label|title|placeholder|text|tooltip|hint|message|caption|heading|aria-label|ariaLabel|desc|description|summary|alt)\s*:\s*(?:[^,{}:;'"`]*\+\s*)?$/,
  /(?:toast|alert|confirm|prompt|setStatus|announce|notify)\s*\(\s*(?:[^()]*[,+]\s*)?$/,
  /(?:textContent|innerText|title|placeholder|ariaLabel|alt)\s*(?:\+?=)\s*(?:[^=;]*\?\s*)?(?:[^=;]*:\s*)?(?:[^=;?:'"`]*\+\s*)?$/,
  UI_ATTR_CALL, H_CHILD,
];
// A bare word ('more', not ' more' or 'to move') is more often an id or an enum value: it counts only as an element's text.
const BARE_UI = /(?:textContent|innerText)\s*\+?=\s*$|\bh\(\s*['"][\w.-]+['"]\s*,\s*(?:null|\{[^{}]*\}|\w+)\s*,\s*$/;
const NOT_TEXT = /(?:\b(?:className|class|cls|font)\s*[:=]|setProperty\([^()]*,)\s*$/;
const NOT_WORDS = /^(none|auto|true|false|null|undefined|inherit|initial|block|inline|flex|grid|hidden|visible|on|off|px|em|rem|mm|cm|pt|in|ms|kb|mb|gb|deg|rad|fr|vh|vw|x|y)$/;
/** True when s is a lower-case fragment of text: words of letters only ('selected', ' more', 'to move'). */
export function fragment(s) {
  const v = s.trim().replace(/^[(,·–—-]+\s*|[\s.,:;!?…)]+$/g, '');
  return /^[a-z][a-z'’]+(?:\s+[a-z][a-z'’]*)*$/.test(v) && !NOT_WORDS.test(v);
}
/** The static text of a template literal (its ${} parts dropped), or null when no word is left: only units, numbers,
 * marks and operator-like tokens (a PDF content stream 'q {…} 0 0 {…} cm Do Q', a printer command 'SIZE {…} mm'). */
export function staticText(v) {
  const s = v.replace(/\{…\}/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(?:[a-z]{3,}|[A-Z][a-z]{2,}|of|to|in|on|at|by|or|an|is|no)\b/.test(s.replace(/\b(px|em|rem|vh|vw|deg|rad|ms|fr|pt|mm|cm)\b/g, '')) ? s : null;
}

const SKIP_CTX = /(?:console\.\w+|throw\s+new\s+\w*Error|new\s+\w*Error|querySelector(?:All)?|getElementById|addEventListener|removeEventListener|dispatchEvent|matches|closest|classList\.\w+|getAttribute|hasAttribute|removeAttribute|createElement|localStorage\.\w+|getItem|setItem|import|require|postMessage|fetch|(?:^|[^\w$])(?:t|tr|i18n)|\.t)\s*\(\s*(?:[^()]*,\s*)?$/;

/** True when s reads like words a person sees, rather than an id, key, selector, path or code. */
export function wordy(s) {
  const v = s.trim();
  if (v.length < 2 || !/[A-Za-z]{2}/.test(v) || v === 'use strict') return false;
  if (/^[a-z][\w-]*(\.[\w-]+)+$/.test(v)) return false;   // a dotted key or a file name
  if (/^(https?:|data:|blob:|mailto:|\/|\.\/|\.\.\/|#[\w-]|[\w-]+\/[\w-])/.test(v)) return false;   // URL or path
  if (/\.(js|mjs|css|html|json|svg|png|jpe?g|webp|pdf|zip|txt|md|woff2?)$/i.test(v) && !/\s/.test(v)) return false;
  if (/[{};<>]|=>|\$\{|^\W|\b(function|return|var|const|let)\b/.test(v) && !/^[A-Z][a-z]/.test(v)) return false;
  if (/^[\w-]+(\s*[:,]\s*[\w-]+)+$/.test(v) && !/\s\w+\s/.test(v)) return false;  // css-ish or a list of ids
  if (/\b(sans-serif|monospace|system-ui|endobj|endstream)\b/.test(v)) return false;   // a CSS font or PDF syntax
  if (/^(rgba?|hsla?|var|calc|url|translate|scale|rotate|matrix|[\w-]*gradient)\(/.test(v)) return false;
  const words = v.split(/\s+/);
  if (words.every((w) => /^[a-z0-9_-]+$/.test(w)) && words.some((w) => /[-_]/.test(w))) return false;   // a class list
  if (/^[a-z]+([A-Z][a-z]*)+$/.test(v) || /^[a-z0-9_-]+$/.test(v)) return false;   // camelCase or a lower-case id
  if (/^[A-Z0-9_]+$/.test(v) && v.length > 1 && !/^[A-Z]{2,5}$/.test(v)) return false;   // CONSTANT_NAME
  if (/^[A-Z]{2,5}$/.test(v)) return false;   // an acronym on its own (PDF, PNG): a format, not a sentence
  if (/^(Ctrl|Alt|Shift|Meta|Cmd|Mod)\+/.test(v) || /^(Arrow|Page)(Up|Down|Left|Right)$|^(Enter|Escape|Tab|Backspace|Delete|Home|End)$/.test(v)) return false;   // key names
  return /^[A-Z][a-z]/.test(v) || /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(v) || /^[A-Z][a-z]*…$/.test(v);
}

/** The string literals of a script with their line, and the code just before each one (its context). */
export function literals(src) {
  const out = [];
  let i = 0, line = 1, last = '';   // last: the previous significant character (for regex detection)
  const n = src.length;
  const ctxStart = () => Math.max(0, i - 120);
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; line += (src.slice(i, end).match(/\n/g) || []).length; i = end; continue; }
    if (c === '/' && /[(,=:[!&|?{};+\-*%<>~^]|^$|return$|typeof$/.test(last)) {   // a regular expression literal
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { const ch = src[j]; if (ch === '\\') { j += 2; continue; } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; j++; }
      i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; last = 'x'; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = i, ln = line, before = src.slice(ctxStart(), start);
      let j = i + 1, val = '', depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { val += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; }
        if (ch === '\n') { line++; if (c !== '`') break; }
        if (c === '`' && ch === '$' && src[j + 1] === '{') { depth = 1; j += 2; val += '{…}'; while (j < n && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; else if (src[j] === '\n') line++; j++; } continue; }
        if (ch === c) break;
        val += ch; j++;
      }
      out.push({ value: val, line: ln, before, quote: c });
      i = j + 1; last = 'x'; continue;
    }
    if (!/\s/.test(c)) {
      if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; last = src.slice(i, j); i = j; continue; }
      last = c;
    }
    i++;
  }
  return out;
}

/** How a literal is used: 'ui' (a UI API takes it), 'prose' (reads like words), or null (not user text). */
export function classify(lit) {
  const b = lit.before.replace(/\s+/g, ' ');
  if (SKIP_CTX.test(b)) return null;
  if (lit.quote === '`' && /<[a-z]/i.test(lit.value)) return htmlText(lit.value).length ? 'ui' : null;
  const hole = lit.quote === '`' && lit.value.includes('{…}');
  const text = hole ? staticText(lit.value) : lit.value;
  if (text == null) return null;
  if (NOT_TEXT.test(b)) return null;
  if (!wordy(text)) {
    if (!fragment(text)) return null;
    const bare = !hole && /^[a-z'’]+$/.test(text);
    return (bare ? BARE_UI.test(b) : STRONG_UI.some((re) => re.test(b))) ? 'ui' : null;
  }
  if (UI_PROP.test(b) || UI_CALL.test(b) || UI_ASSIGN.test(b) || UI_ATTR_CALL.test(b) || H_CHILD.test(b)) return 'ui';
  if (/\b(case|===?|!==?|in|typeof)\s*$/.test(b) || /\[\s*$/.test(b)) return null;   // compared or used as a key
  return 'prose';
}

/** User-visible strings in a script: [{ line, text, kind }] (kind 'ui' or 'prose'). */
export function scanJs(src) {
  const out = [];
  const skip = new Set(src.split('\n').map((l, i) => (/i18n-ignore/.test(l) ? i + 1 : 0)).filter(Boolean));
  for (const lit of literals(src)) {
    if (skip.has(lit.line)) continue;
    const kind = classify(lit);
    if (!kind) continue;
    if (lit.quote === '`' && /<[a-z]/i.test(lit.value)) { for (const t of htmlText(lit.value)) out.push({ line: lit.line, text: t, kind }); continue; }
    out.push({ line: lit.line, text: lit.value.replace(/\s+/g, ' ').trim(), kind });
  }
  return out;
}

const ATTRS = /\s(title|aria-label|placeholder|alt|aria-description|data-tip|label)="([^"]*)"/g;
/** The words in an HTML fragment: text between tags and labelling attributes, outside script, style, svg and code. */
export function htmlText(html) {
  const out = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|svg|code|pre|noscript)\b[\s\S]*?<\/\1>/gi, (m) => m.replace(/[^\n]/g, ' '));
  for (const m of clean.matchAll(/<[a-z][^>]*>/gi)) {
    if (/data-i18n-attr=/.test(m[0])) continue;
    for (const a of m[0].matchAll(ATTRS)) if (wordy(decode(a[2]))) out.push(decode(a[2]).trim());
  }
  for (const m of clean.replace(/<[^>]*>/g, '\u0000').split('\u0000')) {
    const t = decode(m).replace(/\s+/g, ' ').trim();
    if (t && /[A-Za-z]{2}/.test(t) && !/^[\w.-]+$/.test(t.replace(/^[A-Z][a-z]+$/, '')) && !/^\{…\}$/.test(t)) out.push(t);
  }
  return out;
}
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/** User-visible strings in an HTML page's <body> (not its head, scripts or templates of scripts): [{ line, text, kind }].
 * Elements marked data-i18n are already translated and do not count. */
export function scanHtml(src) {
  const at = src.search(/<body\b/i);
  const body = at < 0 ? src : src.slice(at);
  const offset = at < 0 ? 0 : (src.slice(0, at).match(/\n/g) || []).length;
  const out = [];
  body.split('\n').forEach((raw, i) => {
    if (/i18n-ignore/.test(raw)) return;
    const line = raw.replace(/<([a-z][\w-]*)\b[^>]*\sdata-i18n="[^"]*"[^>]*>[^<]*<\/\1>/gi, '');
    for (const t of htmlText(line)) out.push({ line: offset + i + 1, text: t, kind: 'ui' });
  });
  return out;
}
