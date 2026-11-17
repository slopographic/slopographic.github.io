/* Slop Code: the extra languages. Each entry says which file names it covers and which CodeMirror legacy mode
 * (vendor/codemirror/legacy-<mode>.js) highlights it; the mode itself is loaded on demand by lang-load.js.
 * Pure data and string rules: no CodeMirror import, no DOM. The built-in languages stay in lang.js. */

// id, label (a name, never translated), mime, mode (module), exportName (the parser inside it), extensions,
// whole lower-case file names, and name prefixes (a file called Dockerfile.dev).
const L = (id, label, mime, mode, exportName, exts, names = [], prefixes = []) =>
  ({ id, label, ext: exts[0] || id, exts, names, prefixes, mime, mode, exportName });

export const MORE = [
  L('shell', 'Shell', 'text/x-sh', 'shell', 'shell', ['sh', 'bash', 'zsh', 'ksh', 'fish', 'command'],   // i18n-ignore: a language name, not translated
    ['.bashrc', '.bash_profile', '.bash_login', '.bash_logout', '.bash_aliases', '.zshrc', '.zshenv', '.zprofile', '.zlogin',
      '.profile', '.kshrc', '.xinitrc', '.xprofile', 'pkgbuild']),
  L('makefile', 'Makefile', 'text/x-makefile', 'shell', 'shell', ['mk', 'mak'], ['makefile', 'gnumakefile']),   // i18n-ignore: a language name, not translated
  L('yaml', 'YAML', 'text/yaml', 'yaml', 'yaml', ['yml', 'yaml'], ['.clang-format', '.clang-tidy', '.yamllint']),
  L('toml', 'TOML', 'application/toml', 'toml', 'toml', ['toml'], ['cargo.lock', 'pipfile', 'poetry.lock']),
  L('properties', 'Properties', 'text/x-properties', 'properties', 'properties', ['properties', 'ini', 'cfg', 'env'],   // i18n-ignore: a language name, not translated
    ['.gitconfig', '.gitmodules', '.editorconfig', '.env', '.npmrc', '.hgrc', '.pylintrc', '.flake8'], ['.env.']),
  L('xml', 'XML', 'application/xml', 'xml', 'xml',
    ['xml', 'xsd', 'xsl', 'xslt', 'svg', 'rss', 'atom', 'plist', 'xaml', 'csproj', 'vbproj', 'fsproj', 'props', 'targets', 'wsdl', 'kml', 'gpx', 'resx']),
  L('sql', 'SQL', 'text/x-sql', 'sql', 'standardSQL', ['sql']),
  L('c', 'C', 'text/x-csrc', 'clike', 'c', ['c', 'h']),
  L('cpp', 'C++', 'text/x-c++src', 'clike', 'cpp', ['cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'h++', 'ino']),
  L('java', 'Java', 'text/x-java', 'clike', 'java', ['java']),   // i18n-ignore: a language name, not translated
  L('csharp', 'C#', 'text/x-csharp', 'clike', 'csharp', ['cs']),
  L('kotlin', 'Kotlin', 'text/x-kotlin', 'clike', 'kotlin', ['kt', 'kts']),   // i18n-ignore: a language name, not translated
  L('scala', 'Scala', 'text/x-scala', 'clike', 'scala', ['scala', 'sbt']),   // i18n-ignore: a language name, not translated
  L('objectivec', 'Objective-C', 'text/x-objectivec', 'clike', 'objectiveC', ['m']),   // i18n-ignore: a language name, not translated
  L('objectivecpp', 'Objective-C++', 'text/x-objectivec++', 'clike', 'objectiveCpp', ['mm']),   // i18n-ignore: a language name, not translated
  L('dart', 'Dart', 'application/dart', 'clike', 'dart', ['dart']),   // i18n-ignore: a language name, not translated
  L('glsl', 'GLSL', 'text/x-glsl', 'clike', 'shader', ['glsl', 'vert', 'frag', 'geom']),
  L('go', 'Go', 'text/x-go', 'go', 'go', ['go']),   // i18n-ignore: a language name, not translated
  L('rust', 'Rust', 'text/x-rust', 'rust', 'rust', ['rs']),   // i18n-ignore: a language name, not translated
  L('ruby', 'Ruby', 'text/x-ruby', 'ruby', 'ruby', ['rb', 'rake', 'gemspec', 'ru', 'thor', 'podspec', 'jbuilder'],   // i18n-ignore: a language name, not translated
    ['rakefile', 'gemfile', 'vagrantfile', 'guardfile', 'podfile', 'brewfile', 'capfile', 'berksfile', 'fastfile', 'appfile', 'cheffile', '.irbrc', '.pryrc']),
  L('perl', 'Perl', 'text/x-perl', 'perl', 'perl', ['pl', 'pm', 'pod']),   // i18n-ignore: a language name, not translated
  L('lua', 'Lua', 'text/x-lua', 'lua', 'lua', ['lua']),   // i18n-ignore: a language name, not translated
  L('swift', 'Swift', 'text/x-swift', 'swift', 'swift', ['swift']),   // i18n-ignore: a language name, not translated
  L('dockerfile', 'Dockerfile', 'text/x-dockerfile', 'dockerfile', 'dockerFile', ['dockerfile'], ['dockerfile', 'containerfile'], ['dockerfile.']),   // i18n-ignore: a language name, not translated
  L('diff', 'Diff', 'text/x-diff', 'diff', 'diff', ['diff', 'patch']),   // i18n-ignore: a language name, not translated
  L('powershell', 'PowerShell', 'text/x-powershell', 'powershell', 'powerShell', ['ps1', 'psm1', 'psd1']),   // i18n-ignore: a language name, not translated
  L('r', 'R', 'text/x-rsrc', 'r', 'r', ['r']),
  L('haskell', 'Haskell', 'text/x-haskell', 'haskell', 'haskell', ['hs', 'lhs']),   // i18n-ignore: a language name, not translated
  L('julia', 'Julia', 'text/x-julia', 'julia', 'julia', ['jl']),   // i18n-ignore: a language name, not translated
  L('erlang', 'Erlang', 'text/x-erlang', 'erlang', 'erlang', ['erl', 'hrl']),   // i18n-ignore: a language name, not translated
  L('commonlisp', 'Common Lisp', 'text/x-common-lisp', 'commonlisp', 'commonLisp', ['lisp', 'lsp', 'cl', 'asd']),   // i18n-ignore: a language name, not translated
  L('scheme', 'Scheme', 'text/x-scheme', 'scheme', 'scheme', ['scm', 'ss', 'sch', 'sld', 'rkt']),   // i18n-ignore: a language name, not translated
  L('clojure', 'Clojure', 'text/x-clojure', 'clojure', 'clojure', ['clj', 'cljs', 'cljc', 'edn']),   // i18n-ignore: a language name, not translated
  L('tcl', 'Tcl', 'text/x-tcl', 'tcl', 'tcl', ['tcl']),   // i18n-ignore: a language name, not translated
  L('vb', 'Visual Basic', 'text/x-vb', 'vb', 'vb', ['vb', 'bas']),   // i18n-ignore: a language name, not translated
  L('vbscript', 'VBScript', 'text/vbscript', 'vbscript', 'vbScript', ['vbs']),
  L('pascal', 'Pascal', 'text/x-pascal', 'pascal', 'pascal', ['pas', 'dpr', 'lpr']),   // i18n-ignore: a language name, not translated
  L('fortran', 'Fortran', 'text/x-fortran', 'fortran', 'fortran', ['f', 'f90', 'f95', 'f03', 'f08', 'f77', 'for']),   // i18n-ignore: a language name, not translated
  L('verilog', 'Verilog', 'text/x-verilog', 'verilog', 'verilog', ['v', 'vh', 'sv', 'svh']),   // i18n-ignore: a language name, not translated
  L('vhdl', 'VHDL', 'text/x-vhdl', 'vhdl', 'vhdl', ['vhd', 'vhdl']),
  L('coffeescript', 'CoffeeScript', 'text/x-coffeescript', 'coffeescript', 'coffeeScript', ['coffee']),   // i18n-ignore: a language name, not translated
  L('latex', 'LaTeX', 'application/x-tex', 'stex', 'stex', ['tex', 'latex', 'ltx', 'sty', 'cls']),   // i18n-ignore: a language name, not translated
  L('cmake', 'CMake', 'text/x-cmake', 'cmake', 'cmake', ['cmake'], ['cmakelists.txt']),
  L('nginx', 'Nginx', 'text/x-nginx-conf', 'nginx', 'nginx', ['nginx'], ['nginx.conf']),   // i18n-ignore: a language name, not translated
  L('protobuf', 'Protocol Buffers', 'text/x-protobuf', 'protobuf', 'protobuf', ['proto']),   // i18n-ignore: a language name, not translated
  L('groovy', 'Groovy', 'text/x-groovy', 'groovy', 'groovy', ['groovy', 'gradle', 'gvy'], ['jenkinsfile']),   // i18n-ignore: a language name, not translated
  L('http', 'HTTP', 'message/http', 'http', 'http', ['http']),
  L('d', 'D', 'text/x-d', 'd', 'd', ['d']),
  L('elm', 'Elm', 'text/x-elm', 'elm', 'elm', ['elm']),   // i18n-ignore: a language name, not translated
  L('ocaml', 'OCaml', 'text/x-ocaml', 'mllike', 'oCaml', ['ml', 'mli']),
  L('fsharp', 'F#', 'text/x-fsharp', 'mllike', 'fSharp', ['fs', 'fsi', 'fsx']),
  L('sml', 'Standard ML', 'text/x-sml', 'mllike', 'sml', ['sml']),   // i18n-ignore: a language name, not translated
  L('gherkin', 'Gherkin', 'text/x-feature', 'gherkin', 'gherkin', ['feature']),   // i18n-ignore: a language name, not translated
  L('puppet', 'Puppet', 'text/x-puppet', 'puppet', 'puppet', ['pp']),   // i18n-ignore: a language name, not translated
  L('crystal', 'Crystal', 'text/x-crystal', 'crystal', 'crystal', ['cr']),   // i18n-ignore: a language name, not translated
  L('haxe', 'Haxe', 'text/x-haxe', 'haxe', 'haxe', ['hx']),   // i18n-ignore: a language name, not translated
  L('jinja2', 'Jinja2', 'text/x-jinja2', 'jinja2', 'jinja2', ['j2', 'jinja', 'jinja2']),   // i18n-ignore: a language name, not translated
  L('asm', 'Assembly', 'text/x-asm', 'gas', 'gas', ['s', 'asm']),   // i18n-ignore: a language name, not translated
  L('wast', 'WebAssembly text', 'text/x-wast', 'wast', 'wast', ['wat', 'wast']),   // i18n-ignore: a language name, not translated
  L('cobol', 'COBOL', 'text/x-cobol', 'cobol', 'cobol', ['cob', 'cbl', 'cobol', 'cpy']),
];

const BY_EXT = new Map(), BY_NAME = new Map();
for (const e of MORE) {
  for (const x of e.exts) BY_EXT.set(x, e);
  for (const n of e.names) BY_NAME.set(n, e);
}

/** The entry for an id ('go', 'yaml'...), or null. */
export const moreById = (id) => MORE.find((e) => e.id === id) || null;

/** The extra language for a file name, or null. Looks at the extension first, then at the whole lower-case name
 * (Dockerfile, Makefile, CMakeLists.txt, .bashrc), then at the prefixes (Dockerfile.dev, .env.local). A path is
 * reduced to its last part. Only names of MORE are answered: the built-in languages stay with lang.js. */
export function moreByName(name) {
  const base = String(name || '').split(/[\\/]/).pop().toLowerCase();
  const dot = base.lastIndexOf('.');
  const x = dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : '';
  const hit = BY_EXT.get(x) || BY_NAME.get(base);
  if (hit) return hit;
  return MORE.find((e) => e.prefixes.some((p) => base.startsWith(p))) || null;
}

// Interpreter names (a '#!' line) and the language each one runs. Version digits are cut first (python3.11, lua5.4).
const INTERPRETERS = new Map(Object.entries({
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell', dash: 'shell', ash: 'shell', fish: 'shell',
  python: 'python', pypy: 'python',
  node: 'javascript', nodejs: 'javascript', deno: 'javascript', bun: 'javascript', 'ts-node': 'typescript', tsx: 'typescript',
  ruby: 'ruby', perl: 'perl', lua: 'lua', luajit: 'lua', pwsh: 'powershell', powershell: 'powershell',
  tclsh: 'tcl', wish: 'tcl', rscript: 'r', julia: 'julia', groovy: 'groovy', swift: 'swift', escript: 'erlang',
  runghc: 'haskell', runhaskell: 'haskell', racket: 'scheme', guile: 'scheme', sbcl: 'commonlisp',
}));
const SNIFF_BYTES = 4096;

/** The language a '#!' line names ('#!/usr/bin/env -S node --x' is node), or null. */
function fromShebang(line) {
  const parts = line.slice(2).trim().split(/\s+/);
  let cmd = (parts[0] || '').split('/').pop();
  if (cmd === 'env') cmd = (parts.slice(1).find((p) => !p.startsWith('-') && !p.includes('=')) || '').split('/').pop();
  return INTERPRETERS.get(cmd.toLowerCase().replace(/[\d.]+$/, '')) || null;
}

/** True when the text is JSON. A whole sample is parsed; a cut one (a long file) only has to open like JSON. */
function looksJson(head, whole) {
  if (!/^[{[]/.test(head)) return false;
  if (whole) { try { JSON.parse(head); return true; } catch (e) { return false; } }
  return /^(\{\s*("|\})|\[\s*([[{"\-\d\]]|true\b|false\b|null\b))/.test(head);
}

/** A language id for the content of a file whose name says nothing, or null. Ids of the built-in languages
 * (javascript typescript html css json markdown python text) come back as they are. Only the first 4 KB are read. */
export function sniffLanguage(text) {
  const all = String(text == null ? '' : text).replace(/^﻿/, '');
  const head = all.slice(0, SNIFF_BYTES).trimStart();
  if (!head) return null;
  if (head.startsWith('#!')) return fromShebang(head.split('\n', 1)[0]);
  if (/^<\?xml\b/i.test(head)) return 'xml';
  if (/^(<!doctype\s+html\b|<html\b)/i.test(head)) return 'html';
  if (/^<svg\b/i.test(head)) return 'xml';
  if (looksJson(head, all.length <= SNIFF_BYTES)) return 'json';
  if (/^(diff --git |Index: \S|--- \S[^\n]*\n\+\+\+ \S)/.test(head)) return 'diff';
  return null;
}
