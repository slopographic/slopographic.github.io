// Slop Effects commands: every action with a keyboard shortcut or a palette entry (SlopCmd). Keys that edit text (undo,
// copy, paste, delete, space) do nothing while a text field has the focus, so the field keeps its own behaviour. Classic
// script: window.SlopEffects.cmd.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const D = () => ns.defs, t = (k, v) => ns.defs.t(k, v);

  /** Registers the commands. ctx: { S, act, ka, io, tr (transport), preview, toast }. */
  function init(ctx) {
    const C = g.SlopCmd;
    if (!C || !C.register) return;
    const { S, act, ka, io, tr } = ctx;
    const typing = () => ns.dom.typing();
    const notTyping = () => !typing();
    const hasLayer = () => !!S.sel.layer;
    const cmds = () => [
      { id: 'fx.undo', title: t('ui.undo'), group: t('menu.edit'), keys: ['Mod+Z'], keywords: 'back revert', when: notTyping, run: () => S.undo() }, // i18n-ignore: search keywords
      { id: 'fx.redo', title: t('ui.redo'), group: t('menu.edit'), keys: ['Mod+Shift+Z', 'Mod+Y'], keywords: 'forward again', when: notTyping, run: () => S.redo() }, // i18n-ignore: search keywords
      { id: 'fx.copy', title: t('effects.cmd.copy'), group: t('menu.edit'), keys: ['Mod+C'], when: () => notTyping() && S.sel.keys.length > 0, run: () => ka.copy() },
      { id: 'fx.paste', title: t('effects.cmd.paste'), group: t('menu.edit'), keys: ['Mod+V'], when: notTyping, run: () => ka.paste() },
      { id: 'fx.delete', title: t('effects.cmd.delete'), group: t('menu.edit'), keys: ['Delete', 'Backspace'], when: notTyping, run: () => act.deleteSelection() },
      { id: 'fx.dup', title: t('effects.cmd.dup'), group: t('effects.app.layer'), keys: ['Mod+D'], when: () => notTyping() && hasLayer(), run: () => act.duplicateLayer() },
      { id: 'fx.up', title: t('effects.cmd.up'), group: t('effects.app.layer'), keys: [']'], when: hasLayer, run: () => act.moveLayer(-1) },
      { id: 'fx.down', title: t('effects.cmd.down'), group: t('effects.app.layer'), keys: ['['], when: hasLayer, run: () => act.moveLayer(1) },
      { id: 'fx.play', title: t('effects.cmd.play'), group: t('effects.cmd.group_playback'), keys: ['Space'], when: notTyping, run: () => tr.toggle() },
      { id: 'fx.start', title: t('effects.tr.start'), group: t('effects.cmd.group_playback'), keys: ['Home'], when: notTyping, run: () => tr.start() },
      { id: 'fx.end', title: t('effects.tr.end'), group: t('effects.cmd.group_playback'), keys: ['End'], when: notTyping, run: () => tr.end() },
      { id: 'fx.prev', title: t('effects.tr.prev'), group: t('effects.cmd.group_playback'), keys: ['ArrowLeft'], repeat: true, when: notTyping, run: () => tr.stepFrames(-1) },
      { id: 'fx.next', title: t('effects.tr.next'), group: t('effects.cmd.group_playback'), keys: ['ArrowRight'], repeat: true, when: notTyping, run: () => tr.stepFrames(1) },
      { id: 'fx.prev10', title: t('effects.cmd.prev10'), group: t('effects.cmd.group_playback'), keys: ['Shift+ArrowLeft'], repeat: true, when: notTyping, run: () => tr.stepFrames(-10) },
      { id: 'fx.next10', title: t('effects.cmd.next10'), group: t('effects.cmd.group_playback'), keys: ['Shift+ArrowRight'], repeat: true, when: notTyping, run: () => tr.stepFrames(10) },
      { id: 'fx.nudge-l', title: t('effects.cmd.nudge_l'), group: t('effects.cmd.group_keys'), keys: ['Alt+ArrowLeft'], repeat: true, when: () => S.sel.keys.length > 0, run: () => ka.nudge(-1) },
      { id: 'fx.nudge-r', title: t('effects.cmd.nudge_r'), group: t('effects.cmd.group_keys'), keys: ['Alt+ArrowRight'], repeat: true, when: () => S.sel.keys.length > 0, run: () => ka.nudge(1) },
      { id: 'fx.loop', title: t('effects.cmd.loop'), group: t('effects.cmd.group_playback'), keys: ['L'], when: notTyping, run: () => S.setLoop(!S.loop) },
      { id: 'fx.in', title: t('effects.cmd.in'), group: t('effects.cmd.group_playback'), keys: ['I'], when: notTyping, run: () => tr.setIn() },
      { id: 'fx.out', title: t('effects.cmd.out'), group: t('effects.cmd.group_playback'), keys: ['O'], when: notTyping, run: () => tr.setOut() },
      { id: 'fx.range-clear', title: t('effects.cmd.range_clear'), group: t('effects.cmd.group_playback'), keys: ['Alt+X'], when: notTyping, run: () => tr.clearRange() },
      { id: 'fx.new-solid', title: t('effects.cmd.add_solid'), group: t('effects.app.layer'), keys: ['Mod+Shift+N'], run: () => act.addLayer('solid') },
      { id: 'fx.new-text', title: t('effects.cmd.add_text'), group: t('effects.app.layer'), keys: ['Mod+Shift+T'], run: () => act.addLayer('text', { size: 120 }) },
      { id: 'fx.new-null', title: t('effects.cmd.add_null'), group: t('effects.app.layer'), run: () => act.addLayer('null') },
      { id: 'fx.media', title: t('effects.cmd.media'), group: t('effects.app.layer'), run: () => io.importFromComputer() },
      { id: 'fx.media-drive', title: t('effects.cmd.media_drive'), group: t('effects.app.layer'), run: () => io.importFromDrive() },
      { id: 'fx.render', title: t('effects.app.render'), group: t('menu.file'), keys: ['Mod+E'], run: () => ctx.renderDialog() },
      { id: 'fx.save', title: t('effects.cmd.save'), group: t('menu.file'), keys: ['Mod+S'], run: () => io.saveDrive() },
      { id: 'fx.open', title: t('effects.cmd.open'), group: t('menu.file'), keys: ['Mod+O'], run: () => io.openDrive() },
      { id: 'fx.new', title: t('effects.menu.new'), group: t('menu.file'), run: () => io.newProject() },
      { id: 'fx.comp', title: t('effects.cmd.comp'), group: t('effects.app.comp'), run: () => ctx.compDialog() },
      { id: 'fx.random', title: t('effects.cmd.random'), group: t('effects.app.motion'), when: hasLayer, run: () => ctx.focusMotion() },
    ];
    const all = () => { const list = cmds(); more(list); return list; };
    const more = (cmds) => {
    for (const kind of ['solid', 'shape', 'text', 'null']) {
      cmds.push({ id: `fx.add-${kind}`, title: t({ solid: 'effects.cmd.add_solid', shape: 'effects.cmd.add_shape', text: 'effects.cmd.add_text', null: 'effects.cmd.add_null' }[kind]), group: t('effects.app.layer'), run: () => act.addLayer(kind, kind === 'text' ? { size: 120 } : {}) });
    }
    for (const [name, label] of ns.propsFx.presetList()) {
      cmds.push({ id: `fx.in-${name}`, title: t('effects.cmd.anim_in', { name: label }), group: t('effects.app.motion'), when: hasLayer, run: () => ka.animate('in', name) });
      cmds.push({ id: `fx.out-${name}`, title: t('effects.cmd.anim_out', { name: label }), group: t('effects.app.motion'), when: hasLayer, run: () => ka.animate('out', name) });
    }
    for (const [v, l] of D().EASES.filter((e) => e[0] !== 'bezier')) {
      cmds.push({ id: `fx.ease-${v}`, title: t('effects.cmd.ease', { ease: D().word('ease', v, l) }), group: t('effects.cmd.group_keys'), when: () => S.sel.keys.length > 0, run: () => ka.setEaseAll(v) });
    }
    for (const kind of D().EFFECT_KINDS) {
      cmds.push({ id: `fx.effect-${kind}`, title: t('effects.cmd.add_effect', { name: D().word('fx', kind, D().EFFECTS[kind].label) }), group: t('effects.app.effects'), when: hasLayer, run: () => act.addEffect(kind) });
    }
    };
    C.register(all());
    D().onLang(() => C.register(all()));   // the same ids again with the new titles (register replaces by id)
    if (ns.aiCmd) ns.aiCmd.init(ctx);   // the commands with arguments (ai-commands.js)
  }

  ns.cmd = { init };
})(typeof window !== 'undefined' ? window : globalThis);
