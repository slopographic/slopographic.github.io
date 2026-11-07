// The actions for one customer, as a SlopUI menu. Used by right-click and keyboard menus on the board and the list,
// and by the Move button on each card. Stage moves save at once; the store change redraws the open view.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const UI = g.SlopUI;
  const tr = (k, v) => NS.tr(k, v);   // the string tables (crm/i18n)

  /** Saves one stage move and tells the person what happened. */
  async function moveTo(id, stage) {
    const r = await NS.customers.moveStage(id, stage);
    UI.toast(r.ok ? tr('crm.mn.moved', { stage: NS.stageLabel(stage) }) : NS.util.refusal(r));
    return r;
  }

  /** Soft-deletes after a confirmation in a SlopUI dialog. */
  function removeCustomer(c) {
    UI.confirm(tr('crm.mn.del_q', { name: c.name }), tr('crm.mn.del_body'), tr('ui.delete'), { danger: true })
      .then(async (yes) => {
        if (!yes) return;
        const r = await NS.customers.remove(c.id);
        if (!r.ok) { UI.toast(NS.util.refusal(r)); return; }
        UI.toast(tr('crm.mn.deleted', { name: c.name }));
        if (NS.state.current === c.id) NS.app.close();
      });
  }

  /** Menu items for one customer record. */
  function items(c) {
    return [
      { label: tr('crm.mn.open'), act: () => NS.app.show('customer', c.id) },
      { label: tr('crm.mn.edit'), act: () => NS.form.open(c.id) },
      '-',
      ...NS.STAGES.filter((s) => s !== c.stage).map((s) => ({ label: tr('crm.mn.move_to', { stage: NS.stageLabel(s) }), act: () => moveTo(c.id, s) })),
      '-',
      { label: tr('crm.mn.delete'), act: () => removeCustomer(c) },
    ];
  }

  NS.menu = { items, moveTo, removeCustomer };
})(typeof window !== 'undefined' ? window : globalThis);
