/* Slop Drive — ui/folder-ui: the "Local folder" box in the sidebar, Connect folder (menu and palette), the question
 * about saving the Slopographic config in the folder, and Load config from folder (the changes are listed before
 * Apply). Logic is in core/folder.js and shared/config/folder.js. Where showDirectoryPicker is missing, the box and the
 * menu say that folders need Chrome or Edge. */
'use strict';
(function (DR) {
  const el = DR.el, $ = DR.$, ui = () => window.SlopUI;
  const FILE = 'slopographic.slop.json';
  const F = () => DR.folderState;
  const failed = (title) => (e) => ui().alert(title, (e && e.message) || String(e));

  /** Runs a folder action and turns a throw into a message, so a button never fails silently. */
  const act = (fn, title = DR.t('drive.folder.folder')) => async () => { try { await fn(); } catch (e) { failed(title)(e); } };
  DR.folderAct = act;
  /** The config scripts, or a message that says why they did not load. */
  const configReady = async () => { try { await DR.ensureConfig(); return true; } catch (e) { await ui().alert(DR.t('drive.folder.config_na'), DR.t('drive.folder.config_na_body', { msg: e.message })); return false; } };

  DR.connectFolder = async function () {
    if (!DR.folderSupported()) return ui().alert(DR.t('drive.folder.need_chrome'), DR.folderUnsupported());
    const r = await window.SlopSyncProviders.local.pick();
    if (!r.ok) { if (!r.cancelled) ui().alert(DR.t('drive.folder.not_connected'), r.error); return; }
    await DR.folderRefresh();
    DR.renderFolder();
    const yes = await ui().confirm(DR.t('drive.folder.save_q'), DR.t('drive.folder.save_body', { file: FILE, name: r.name }),
      DR.t('drive.folder.save_config'), { cancel: DR.t('drive.folder.not_now') });
    if (yes) await DR.folderSaveConfig();
    DR.status && DR.status(DR.t('drive.folder.writing', { name: r.name }));
    await DR.folderMirrorAll();
    await DR.folderRefresh();
    DR.renderFolder();
    DR.status && DR.status('');
    DR.toast(DR.t('drive.folder.connected', { name: r.name }));
  };

  DR.folderSaveConfig = async function () {
    if (!(await configReady())) return;
    const r = await window.SlopConfigFolder.save();
    if (!r.ok) return ui().alert(DR.t('drive.folder.not_saved'), r.error);
    DR.toast(DR.t('drive.folder.saved_in', { name: r.name }));
  };

  DR.folderLoadConfig = async function () {
    if (!(await configReady())) return;
    const p = await window.SlopConfigFolder.preview();
    if (!p.ok) return ui().alert(DR.t('drive.folder.not_loaded'), p.error);
    const body = p.changes.length
      ? el('div', null, el('p', { class: 'sui-p' }, DR.t('drive.folder.applying')),
        el('ul', { class: 'folder-changes' }, p.changes.map((c) => el('li', null, `${c.label}: ${c.from} → ${c.to}`))))
      : DR.t('drive.folder.no_change');
    ui().dialog({
      title: DR.t('drive.folder.load_q', { name: p.name }), body,
      buttons: [{ label: DR.t('menu.cancel') }, {
        label: p.changes.length ? DR.t('drive.folder.apply') : DR.t('menu.ok'), primary: true,
        act: p.changes.length ? async () => {
          const r = await window.SlopConfigFolder.apply(p);
          if (!r.ok) { ui().alert(DR.t('drive.folder.not_applied'), r.error); return false; }
          DR.toast(DR.t('drive.folder.applied_n', { n: r.applied }));
        } : undefined,
      }],
    });
  };

  DR.folderDisconnectAsk = async function () {
    const yes = await ui().confirm(DR.t('drive.folder.disconnect_q'), DR.t('drive.folder.disconnect_body', { name: F().name }), DR.t('drive.folder.disconnect'), { cancel: DR.t('drive.folder.keep_it') });
    if (yes) await DR.folderDisconnect();
  };

  /** The rows for the More menu: one "Connect" row, or the connected folder's submenu. */
  DR.folderMenuRows = function () {
    const st = F();
    if (!st.name) return [{ label: DR.t('drive.folder.connect'), act: act(() => DR.connectFolder()) }];
    const granted = st.perm === 'granted';
    return [{
      label: DR.t('drive.folder.local_of', { name: st.name }), sub: [
        ...(granted ? [] : [{ label: DR.t('drive.folder.allow', { name: st.name }), act: act(() => DR.folderAllow()) }, '-']),
        ...(granted ? [{ label: DR.t('drive.folder.load_from'), act: act(() => DR.folderLoadConfig()) }, { label: DR.t('drive.folder.save_to'), act: act(() => DR.folderSaveConfig()) }, '-'] : []),
        { label: DR.t('drive.folder.disconnect_dots'), act: () => DR.folderDisconnectAsk() },
      ],
    }];
  };

  const btn = (label, fn, cls = 'btn') => { const b = el('button', { type: 'button', class: cls }, label); b.addEventListener('click', act(fn)); return b; };

  /** The sidebar box: the state in plain words, and one button per next step. */
  DR.folderNodes = function () {
    const st = F();
    if (!DR.folderSupported()) return [el('p', { class: 'folder-note' }, DR.folderUnsupported())];
    if (!st.name) return [el('p', { class: 'folder-note' }, DR.t('drive.folder.keep_copy')), btn(DR.t('drive.folder.connect'), () => DR.connectFolder())];
    const out = [el('p', { class: 'folder-name' }, el('b', null, DR.t('drive.folder.folder_label')), el('span', { title: st.name }, st.name))];
    if (st.perm !== 'granted') {
      out.push(el('p', { class: 'folder-note' }, st.perm === 'denied'
        ? DR.t('drive.folder.refused')
        : DR.t('drive.folder.asks_again')));
      out.push(btn(DR.t('drive.folder.allow', { name: st.name }), () => DR.folderAllow(), 'btn primary'));
    } else if (st.missing.length) {
      const n = st.missing.length;
      out.push(el('p', { class: 'folder-note' }, DR.t('drive.folder.missing_n', { n })));
      out.push(btn(DR.t('drive.folder.import_them'), () => DR.folderImport()));
    }
    const row = el('div', { class: 'folder-row' });
    if (st.perm === 'granted') {
      row.append(btn(DR.t('drive.folder.load_config'), () => DR.folderLoadConfig()), btn(DR.t('drive.folder.save_config'), () => DR.folderSaveConfig()));
    }
    row.append(btn(DR.t('drive.folder.disconnect'), () => DR.folderDisconnectAsk()));
    out.push(row);
    return out;
  };
  DR.renderFolder = function () {
    const box = $('folderBox');
    if (box) box.replaceChildren(...DR.folderNodes());
    // Settings > Storage links to drive/#connect-folder: point at the Connect button once (the picker itself needs a press).
    const b = box && !linked && location.hash === '#connect-folder' && !F().name ? box.querySelector('button') : null;
    if (!b) return;
    linked = true;
    if (DR.isMobile()) DR.drawer(true);
    b.classList.add('primary');
    b.setAttribute('data-linked', '');
    b.scrollIntoView({ block: 'nearest' });
    b.focus({ preventScroll: true });
  };
  let linked = false;
})(window.DR);
