/* Slop Code: the encoding and the line endings of the open file. Reopen with another encoding (when the guess was wrong) and
 * change the line endings used the next time it is saved. Neither changes anything until the person saves. */
import * as docs from './docs.js';
import { askEncoding, askEol } from './dialogs.js';
import { openRecord, closeDoc } from './ops.js';
import { renderChrome, toast } from './ui.js';
import { t } from './dom.js';
import { encodingLabel } from './openfile.js';

const text = () => { const d = docs.current(); return d && d.kind === 'text' ? d : null; };

/** Read the open file again in another encoding. Needs no unsaved changes (it comes back from Slop Drive). */
export async function chooseEncoding() {
  const d = text();
  if (!d) { toast(t('code.toast.open_first')); return false; }
  if (d.dirty) { toast(t('code.toast.enc_dirty')); return false; }
  const id = await askEncoding(d.encoding);
  if (!id || id === d.encoding) return false;
  const rec = await window.SlopHub.get(d.id);
  if (!rec) return false;
  if (!(await closeDoc(d))) return false;
  await openRecord(rec, { encoding: id });
  toast(t('code.toast.encoding', { name: encodingLabel(id) }));
  return true;
}

/** Choose the line ending written at the next save; the file counts as changed until then. */
export async function chooseEol() {
  const d = text();
  if (!d) { toast(t('code.toast.open_first')); return false; }
  const id = await askEol(d.eol);
  if (!id || id === d.eol) return false;
  d.eol = id;
  d.metaDirty = true;
  docs.refreshDirty(d);
  renderChrome();
  toast(t('code.toast.eol', { name: id.toUpperCase() }));
  return true;
}
