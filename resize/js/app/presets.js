/* Slop Resize: saved settings. A preset is { id, name, settings } where settings is the whole panel (settings.js).
 * They are kept in Slop Drive (drive.js) and, with no Drive on the page, in localStorage. Classic script; exposes
 * window.SlopResize.presets.
 *   load()                    Promise<list>   (cached after the first read)
 *   add(name, settings)       Promise<'drive' | 'local'>   the list is saved where it is kept
 *   remove(id)                Promise<'drive' | 'local'>
 *   bind({ select, apply, saveAs, del, status })   wires the panel controls; status(text) shows the outcome */
(function (g) {
  'use strict';
  const NS = g.SlopResize, P = (NS.presets = {});
  const KEY = 'slop.resize.presets';
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let cache = null;

  function localRead() {
    try { const d = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(d) ? d : []; } catch (e) { return []; }
  }
  function localWrite(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage full or blocked */ }
  }

  P.load = async function () {
    if (cache) return cache;
    let list = null;
    try { list = await NS.drive.loadPresets(); } catch (e) { list = null; }
    cache = Array.isArray(list) ? list : localRead();
    return cache;
  };

  /** Save the list where it is kept. Drive first; if Drive fails the local copy keeps the change. */
  async function store(list) {
    cache = list;
    try { if (await NS.drive.savePresets(list)) return 'drive'; } catch (e) { /* fall back below */ }
    localWrite(list);
    return 'local';
  }

  P.add = async function (name, settings) {
    const list = (await P.load()).slice();
    list.push({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name).slice(0, 60), settings: NS.settings.fromSaved(settings) });
    return store(list);
  };

  P.remove = async function (id) {
    return store((await P.load()).filter((p) => p.id !== id));
  };

  P.bind = function ({ select, apply, saveAs, del, status }) {
    const say = (msg) => { if (status) status(msg); };
    const refresh = async (keep) => {
      const list = await P.load();
      select.replaceChildren(new Option(t('resize.panel.g_saved'), ''), ...list.map((p) => new Option(p.name, p.id)));
      if (keep && list.some((p) => p.id === keep)) select.value = keep;
    };
    P.refresh = () => refresh(select.value);   // a language change: the first option in the new language
    apply.addEventListener('click', async () => {
      const p = (await P.load()).find((x) => x.id === select.value);
      if (!p) { say(t('resize.presets.choose')); return; }
      NS.settings.write(NS.settings.fromSaved(p.settings));
      say(t('resize.presets.applied', { name: p.name }));
    });
    saveAs.addEventListener('click', async () => {
      const name = await g.SlopUI.prompt(t('resize.presets.save_title'), t('resize.presets.save_label'), '', { ok: t('resize.presets.save') });
      if (!name || !String(name).trim()) return;
      const where = await P.add(String(name).trim(), NS.settings.read());
      await refresh();
      say(where === 'drive' ? t('resize.presets.saved_drive', { name: String(name).trim() }) : t('resize.presets.saved_local', { name: String(name).trim() }));
    });
    del.addEventListener('click', async () => {
      const p = (await P.load()).find((x) => x.id === select.value);
      if (!p) { say(t('resize.presets.choose_delete')); return; }
      const ok = await g.SlopUI.confirm(t('resize.presets.delete_title'), t('resize.presets.delete_q', { name: p.name }), t('resize.panel.delete'), { danger: true });
      if (!ok) return;
      await P.remove(p.id);
      await refresh();
      say(t('resize.presets.deleted', { name: p.name }));
    });
    refresh();
  };
})(typeof window !== 'undefined' ? window : globalThis);
