/* Template data: Timesheet. Hours per day by employee, with row and column totals. */
export default {
  id: 'timesheet',
  name: 'Timesheet',
  description: 'Hours worked per day for each employee in a week, with weekly totals.',
  sheets: [{
    name: 'Timesheet',
    widths: { A: 20, B: 10, C: 10, D: 10, E: 10, F: 10, G: 12 },
    styles: [
      ['A1', { b: true }],
      ['A4:G4', { b: true, al: 'c' }],
      ['B5:G9', { nf: '0.0' }],
      ['A9:G9', { b: true }],
    ],
    cells: {
      A1: 'Timesheet',
      A2: 'Hours per day, one row per employee. Totals calculate.',
      A4: 'Employee', B4: 'Mon', C4: 'Tue', D4: 'Wed', E4: 'Thu', F4: 'Fri', G4: 'Total',
      A5: 'Ana Ruiz', B5: '7.5', C5: '8', D5: '7.5', E5: '8', F5: '6', G5: '=SUM(B5:F5)',
      A6: 'Ben Okafor', B6: '8', C6: '8', D6: '8', E6: '4', F6: '8', G6: '=SUM(B6:F6)',
      A7: 'Chen Wei', B7: '6', C7: '7', D7: '8', E7: '8', F7: '7.5', G7: '=SUM(B7:F7)',
      A8: 'Dana Kowalski', B8: '8', C8: '0', D8: '8', E8: '8', F8: '8', G8: '=SUM(B8:F8)',
      A9: 'Total', B9: '=SUM(B5:B8)', C9: '=SUM(C5:C8)', D9: '=SUM(D5:D8)', E9: '=SUM(E5:E8)', F9: '=SUM(F5:F8)', G9: '=SUM(G5:G8)',
    },
  }],
};
