// Loads the Slop Contacts core (classic scripts, no DOM) into this Node process, so the codec tests run the same code the
// page runs. window is set to globalThis; each file is evaluated in the global scope, in the order the page loads them.
// It lives here (not in tests/node) so the node tests in tests/node can import it.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORE = ['text', 'photo', 'model', 'phone', 'activity', 'customer-map', 'vcard-read', 'vcard-write', 'bundle', 'csv-read', 'csv-write',
  'csv-map', 'dedupe', 'bulk', 'zip', 'format', 'filters', 'table-model', 'import-plan'];

export function loadContacts() {
  if (globalThis.window && globalThis.window.SlopContacts && globalThis.window.SlopContacts.importPlan) return globalThis.window.SlopContacts;
  globalThis.window = globalThis;
  // SlopI18n with the English tables (contacts/i18n/en), so labels and messages read as on the page
  for (const f of ['shared/i18n/i18n.js', ...readdirSync(path.join(ROOT, 'contacts/i18n/en')).map((x) => 'contacts/i18n/en/' + x)]) { vm.runInThisContext(readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }); if (f === 'shared/i18n/i18n.js') vm.runInThisContext(PIN); }
  for (const name of CORE) {
    const file = path.join(ROOT, 'contacts', 'js', 'core', name + '.js');
    vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });
  }
  return globalThis.window.SlopContacts;
}
