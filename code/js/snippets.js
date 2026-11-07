/* Slop Code: built-in snippets, offered by Ctrl+Space when the Snippets helper is on. Templates use CodeMirror's
 * snippet syntax: ${} is a stop, ${name} a named stop, ${1:text} an ordered stop. The list is per language id. */
import { snippet } from '@codemirror/autocomplete';
import { helperOn } from './prefs.js';

const JS = [
  { label: 'log', body: 'console.log(${});' },
  { label: 'fn', body: 'function ${name}(${}) {\n\t${}\n}' },
  { label: 'arrow', body: 'const ${name} = (${}) => {\n\t${}\n};' },
  { label: 'forof', body: 'for (const ${item} of ${list}) {\n\t${}\n}' },
  { label: 'qs', body: 'document.querySelector("${selector}")' },
  { label: 'listen', body: 'addEventListener("${event}", (${e}) => {\n\t${}\n});' },
];
const SETS = {
  javascript: JS,
  typescript: JS,
  html: [
    { label: 'html5', body: '<!doctype html>\n<html lang="en">\n<head>\n\t<meta charset="utf-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1">\n\t<title>${Title}</title>\n</head>\n<body>\n\t${}\n</body>\n</html>' },
    { label: 'div', body: '<div class="${class}">${}</div>' },
    { label: 'link', body: '<link rel="stylesheet" href="${style}">' },
    { label: 'script', body: '<script src="${script}"></script>' },
  ],
  css: [
    { label: 'flex', body: 'display: flex;\n\talign-items: ${center};\n\tgap: ${8px};' },
    { label: 'grid', body: 'display: grid;\n\tgrid-template-columns: repeat(${2}, minmax(0, 1fr));\n\tgap: ${8px};' },
    { label: 'media', body: '@media (max-width: ${719px}) {\n\t${}\n}' },
    { label: 'vars', body: ':root {\n\t--${name}: ${value};\n}' },
  ],
  python: [
    { label: 'def', body: 'def ${name}(${}):\n\t${pass}' },
    { label: 'main', body: 'if __name__ == "__main__":\n\tmain()' },
    { label: 'class', body: 'class ${Name}:\n\tdef __init__(self${}):\n\t\t${pass}' },
  ],
  markdown: [
    { label: 'link', body: '[${text}](${url})' },
    { label: 'fence', body: '```${lang}\n${}\n```' },
    { label: 'table', body: '| ${Column} | ${Column} |\n| --- | --- |\n| ${} | ${} |' },
  ],
};

/** The snippets for a language id (an empty list when there are none). */
export const snippetsFor = (id) => SETS[id] || [];

/** A completion source for a language's snippets. Returns null while the helper is off or nothing is typed. */
export function snippetSource(id) {
  const options = snippetsFor(id).map((s) => ({ label: s.label, type: 'text', detail: 'snippet', apply: snippet(s.body) }));
  return (ctx) => {
    if (!helperOn('snippets') || !options.length) return null;
    const w = ctx.matchBefore(/[\w-]+/);
    if (!w || (w.from === w.to && !ctx.explicit)) return null;
    return { from: w.from, options, validFor: /^[\w-]*$/ };
  };
}
