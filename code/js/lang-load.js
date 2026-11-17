/* Slop Code: loads the extra languages (js/langs-more.js) when a file needs one. Each CodeMirror legacy mode is its
 * own small module under vendor/codemirror/, so a mode is imported the first time it is asked for and kept after
 * that. A mode that fails to load gives plain text, never an error. */
import { StreamLanguage, LanguageSupport } from '@codemirror/language';

// One literal specifier per mode, so the import map resolves it and the list can be read at a glance.
const MODES = {
  shell: () => import('@codemirror/legacy-modes/mode/shell'),
  yaml: () => import('@codemirror/legacy-modes/mode/yaml'),
  toml: () => import('@codemirror/legacy-modes/mode/toml'),
  properties: () => import('@codemirror/legacy-modes/mode/properties'),
  xml: () => import('@codemirror/legacy-modes/mode/xml'),
  sql: () => import('@codemirror/legacy-modes/mode/sql'),
  clike: () => import('@codemirror/legacy-modes/mode/clike'),
  go: () => import('@codemirror/legacy-modes/mode/go'),
  rust: () => import('@codemirror/legacy-modes/mode/rust'),
  ruby: () => import('@codemirror/legacy-modes/mode/ruby'),
  perl: () => import('@codemirror/legacy-modes/mode/perl'),
  lua: () => import('@codemirror/legacy-modes/mode/lua'),
  swift: () => import('@codemirror/legacy-modes/mode/swift'),
  dockerfile: () => import('@codemirror/legacy-modes/mode/dockerfile'),
  diff: () => import('@codemirror/legacy-modes/mode/diff'),
  powershell: () => import('@codemirror/legacy-modes/mode/powershell'),
  r: () => import('@codemirror/legacy-modes/mode/r'),
  haskell: () => import('@codemirror/legacy-modes/mode/haskell'),
  julia: () => import('@codemirror/legacy-modes/mode/julia'),
  erlang: () => import('@codemirror/legacy-modes/mode/erlang'),
  commonlisp: () => import('@codemirror/legacy-modes/mode/commonlisp'),
  scheme: () => import('@codemirror/legacy-modes/mode/scheme'),
  clojure: () => import('@codemirror/legacy-modes/mode/clojure'),
  tcl: () => import('@codemirror/legacy-modes/mode/tcl'),
  vb: () => import('@codemirror/legacy-modes/mode/vb'),
  vbscript: () => import('@codemirror/legacy-modes/mode/vbscript'),
  pascal: () => import('@codemirror/legacy-modes/mode/pascal'),
  fortran: () => import('@codemirror/legacy-modes/mode/fortran'),
  verilog: () => import('@codemirror/legacy-modes/mode/verilog'),
  vhdl: () => import('@codemirror/legacy-modes/mode/vhdl'),
  coffeescript: () => import('@codemirror/legacy-modes/mode/coffeescript'),
  stex: () => import('@codemirror/legacy-modes/mode/stex'),
  cmake: () => import('@codemirror/legacy-modes/mode/cmake'),
  nginx: () => import('@codemirror/legacy-modes/mode/nginx'),
  protobuf: () => import('@codemirror/legacy-modes/mode/protobuf'),
  groovy: () => import('@codemirror/legacy-modes/mode/groovy'),
  http: () => import('@codemirror/legacy-modes/mode/http'),
  d: () => import('@codemirror/legacy-modes/mode/d'),
  elm: () => import('@codemirror/legacy-modes/mode/elm'),
  mllike: () => import('@codemirror/legacy-modes/mode/mllike'),
  gherkin: () => import('@codemirror/legacy-modes/mode/gherkin'),
  puppet: () => import('@codemirror/legacy-modes/mode/puppet'),
  crystal: () => import('@codemirror/legacy-modes/mode/crystal'),
  haxe: () => import('@codemirror/legacy-modes/mode/haxe'),
  jinja2: () => import('@codemirror/legacy-modes/mode/jinja2'),
  gas: () => import('@codemirror/legacy-modes/mode/gas'),
  wast: () => import('@codemirror/legacy-modes/mode/wast'),
  cobol: () => import('@codemirror/legacy-modes/mode/cobol'),
};

const loaded = new Map();   // 'mode/exportName' -> the extension, so a second file with the same language is instant

/** The CodeMirror extension (a LanguageSupport) for an entry of MORE, loading its mode on first use.
 * Resolves [] (plain text) for an unknown mode, a mode without that parser, or a module that fails to load. */
export async function loadMore(entry) {
  const key = entry ? entry.mode + '/' + entry.exportName : '';
  if (!entry || !Object.hasOwn(MODES, entry.mode)) return [];
  if (loaded.has(key)) return loaded.get(key);
  try {
    const parser = (await MODES[entry.mode]())[entry.exportName];
    if (!parser || typeof parser !== 'object') return [];   // a parser is an object of token functions
    const support = new LanguageSupport(StreamLanguage.define(parser));
    loaded.set(key, support);
    return support;
  } catch (e) {
    return [];   // a failed import is not cached, so a later try can succeed
  }
}
