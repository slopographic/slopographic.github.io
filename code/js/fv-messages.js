/* Slop Code, Formatted view: the messages the formatters give when they cannot format. Each has an i18n key,
 * code.fv.err.<id>, for the pane to show with t(key, args), and the English text below as `error`, so a caller without
 * the tables (a test, a script) still reads a message. {name} stands for an argument. */
const PREFIX = 'code.fv.err.';
const EN = {
  too_large: 'too large',   // i18n-ignore: English text of the key; every line of this table is one
  unsupported: 'not supported',   // i18n-ignore
  failed: 'could not format',   // i18n-ignore
  too_deep: 'Nested too deeply',   // i18n-ignore
  invalid_number: 'Invalid number',   // i18n-ignore
  unexpected_word: "Unexpected '{word}'",   // i18n-ignore
  single_quote: 'Strings need double quotes',   // i18n-ignore
  comment: 'Comments are not allowed in JSON',   // i18n-ignore
  unexpected_char: "Unexpected character '{char}'",   // i18n-ignore
  unterminated_string: 'Unterminated string',   // i18n-ignore
  control_char: 'Control character in string',   // i18n-ignore
  bad_unicode: 'Invalid unicode escape',   // i18n-ignore
  bad_escape: 'Invalid escape',   // i18n-ignore
  trailing_comma: 'Trailing comma',   // i18n-ignore
  expected_value: "Expected a value, found '{char}'",   // i18n-ignore
  expected_key: "Expected a string key, found '{char}'",   // i18n-ignore
  expected_colon: "Expected ':' after the key",   // i18n-ignore
  expected_comma_object: "Expected ',' or '}'",   // i18n-ignore
  expected_comma_array: "Expected ',' or ']'",   // i18n-ignore
  extra_text: 'Unexpected text after the JSON value',   // i18n-ignore
  unexpected_end: 'Unexpected end of input',   // i18n-ignore
  mismatched_end: 'Mismatched end tag </{found}>, expected </{expected}>',   // i18n-ignore
  unexpected_end_tag: 'Unexpected end tag </{found}>',   // i18n-ignore
  missing_end_tag: 'Missing end tag </{name}>',   // i18n-ignore
  open_end_tag: 'Unterminated end tag',   // i18n-ignore
  open_start_tag: 'Unterminated start tag',   // i18n-ignore
  open_quote: 'Unterminated quote',   // i18n-ignore
};

/** The fields of a failed result for message `id`: { error, key, args? } (args: the values for the {name} marks). */
export function message(id, args) {
  let error = EN[id];
  for (const k in args || {}) error = error.replace('{' + k + '}', () => String(args[k]));
  return args ? { error, key: PREFIX + id, args } : { error, key: PREFIX + id };
}
