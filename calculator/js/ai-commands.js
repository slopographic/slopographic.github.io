/* Slopculator for the assistant: SlopCmd commands with arguments, loaded on demand by SlopCmd.prepare() (commands.js).
 * Through the page itself (SlopCalcApp): new_sheet (an empty tape and line, the variables kept or not; destructive),
 * add_calculation (an expression, calculated as Enter does, onto the paper tape; the answer comes back), clear_tape
 * (destructive), save_calculation (the last one to Slop Drive, as Save does) and export_tape (the tape as CSV or text,
 * to Slop Drive and/or a download). The checkpoint puts the tape, the last answer and the variables back. */
(function () {
  'use strict';
  const C = window.SlopCmd, A = () => window.SlopCalcApp;
  if (!C || C.get('calc.ai.add-calculation')) return;
  const add = C.aiAdder('calc');   // shared/commands/commands.js
  const TO = { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' };
  C.register([
    add('new_sheet', 'Start a new sheet', [{ name: 'keep_variables', type: 'boolean', default: false, description: 'keep the names set so far (price = 19.99)' }], (a) => {
      const n = A().snapshot().tape.length;
      A().newSheet(!!a.keep_variables);
      return `New sheet: the tape (${n} line(s)) and the last answer are cleared${a.keep_variables ? ', the variables kept' : ' and the variables forgotten'}. The history is kept.`;
    }, { destructive: true, description: 'Start fresh: an empty paper tape and line, no last answer (ans), and the variables forgotten unless kept.' }),
    add('add_calculation', 'Calculate', [{ name: 'expression', type: 'string', required: true, maxLength: 2000, description: 'e.g. 12% of 340, 3 h 20 min in min, tax(100, 20%), 2026-03-01 + 45 days, 100 USD in EUR, price = 19.99' }],
      async (a) => {
        const before = A().snapshot().tape.length;
        A().setExpr(a.expression);
        await A().commit();
        const s = A().snapshot();
        if (s.tape.length === before) throw new Error(document.getElementById('sc-status') ? document.getElementById('sc-status').textContent : 'Not calculated');
        return { expression: s.last.expr, result: s.last.text };
      }, { description: 'Calculate an expression (units, currency, dates, percentages, tax, variables) and add it to the paper tape.' }),
    add('clear_tape', 'Clear the paper tape', [], () => { A().clearTape(); return 'The tape is empty (the history is kept).'; }, { destructive: true }),
    add('save_calculation', 'Save the last calculation to Slop Drive', [], async () => {
      const s = A().snapshot();
      if (!s.last) throw new Error('Calculate something first');
      await A().saveDrive();
      return `Saved “${s.last.expr} = ${s.last.text}” to Slop Drive as a note.`;
    }),
    add('export_tape', 'Export the paper tape', [{ name: 'format', type: 'enum', values: ['csv', 'txt'], default: 'csv' }, TO, { name: 'name', type: 'string', maxLength: 120, default: 'tape' }], async (a) => {
      const tape = A().snapshot().tape;
      if (!tape.length) throw new Error('The tape is empty');
      const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const text = a.format === 'csv' ? ['Expression,Result', ...tape.map((r) => `${q(r.expr)},${q(r.text)}`)].join('\n') + '\n' : tape.map((r) => `${r.expr} = ${r.text}`).join('\n') + '\n';
      const name = `${a.name}.${a.format}`, blob = new Blob([text], { type: a.format === 'csv' ? 'text/csv' : 'text/plain' }), out = [];
      if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'calculator' })})`);
      if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
      return out.join(' and ') + '.';
    }),
  ]);
  C.provide({ state: () => Object.assign({ app: 'Slopculator' }, A().snapshot()),
    checkpoint: () => { const m = A().mark(); return () => { A().restore(m); return true; }; } });
})();
