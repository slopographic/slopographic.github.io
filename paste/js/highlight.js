/* A small highlighter for Paste: plain, JavaScript, Python, HTML, CSS, JSON and Markdown. The Code app's
 * highlighter (CodeMirror) is not shared, so this one is kept here. Output is escaped HTML: each token is a
 * <span class="tok-…"> (com, str, num, kw, fn, prop, tag, attr, head, quote, link). Plain text gets no spans. */

export const LANGS = [
  ['plain', 'Plain text'], ['javascript', 'JavaScript'], ['python', 'Python'], ['html', 'HTML'],
  ['css', 'CSS'], ['json', 'JSON'], ['markdown', 'Markdown'],
];

const JS_KW = 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|yield|null|undefined|true|false';
const PY_KW = 'def|class|return|if|elif|else|for|while|break|continue|import|from|as|with|try|except|finally|raise|lambda|yield|pass|global|nonlocal|in|is|not|and|or|async|await|None|True|False';

const RULES = {
  javascript: [
    ['com', /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/],
    ['num', /\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/i],
    ['kw', new RegExp('\\b(?:' + JS_KW + ')\\b')],
    ['fn', /\b[A-Za-z_$][\w$]*(?=\s*\()/],
  ],
  python: [
    ['com', /#[^\n]*/],
    ['str', /"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/],
    ['num', /\b\d+(?:\.\d+)?\b/],
    ['kw', new RegExp('\\b(?:' + PY_KW + ')\\b')],
    ['fn', /\b[A-Za-z_]\w*(?=\s*\()/],
  ],
  json: [
    ['prop', /"(?:\\.|[^"\\\n])*"(?=\s*:)/],
    ['str', /"(?:\\.|[^"\\\n])*"/],
    ['num', /-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i],
    ['kw', /\b(?:true|false|null)\b/],
  ],
  css: [
    ['com', /\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/],
    ['prop', /[\w-]+(?=\s*:)/],
    ['num', /#[\da-f]{3,8}\b|-?\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?/i],
    ['kw', /@[\w-]+/],
  ],
  html: [
    ['com', /<!--[\s\S]*?(?:-->|$)/],
    ['tag', /<\/?!?[A-Za-z][\w:-]*|\/?>/],
    ['attr', /\s[\w:@.-]+(?==)/],
    ['str', /"[^"]*"|'[^']*'/],
  ],
  markdown: [
    ['head', /^#{1,6}[^\n]*/m],
    ['quote', /^>[^\n]*/m],
    ['str', /```[\s\S]*?(?:```|$(?![\s\S]))/],
    ['kw', /^\s*(?:[-*+]|\d+\.)(?=\s)/m],
    ['link', /!?\[[^\]\n]*\]\([^)\n]*\)/],
    ['kw', /\*\*[^*\n]+\*\*|__[^_\n]+__/],
  ],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sticky copies of the rules, so each one is tried at one position. Built once per language. */
const STICKY = Object.fromEntries(Object.entries(RULES).map(([lang, list]) => [lang, list.map(([cls, re]) => [cls, new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'y')])]));

/** Source text to HTML with token spans. Unknown languages are escaped and returned as they are. */
export function highlight(src, lang) {
  const text = String(src == null ? '' : src);
  const rules = STICKY[lang];
  if (!rules) return esc(text);
  let out = '', plain = '', i = 0;
  while (i < text.length) {
    let hit = null;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(text);
      if (m && m[0].length) { hit = [cls, m[0]]; break; }
    }
    if (hit) {
      out += esc(plain) + '<span class="tok-' + hit[0] + '">' + esc(hit[1]) + '</span>';
      plain = '';
      i += hit[1].length;
    } else {
      plain += text[i];
      i++;
    }
  }
  return out + esc(plain);
}

/** The file extension for a download, by language. */
export const EXT = { plain: 'txt', javascript: 'js', python: 'py', html: 'html', css: 'css', json: 'json', markdown: 'md' };
