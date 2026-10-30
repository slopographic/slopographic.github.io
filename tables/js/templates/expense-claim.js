/* Template data: Expense claim. Employee details, dated expense lines, advance and the net to reimburse. */
export default {
  id: 'expense-claim',
  name: 'Expense claim',
  description: 'An expense claim: dated lines with category and amount, less any advance, and the net to reimburse.',
  sheets: [{
    name: 'Claim',
    widths: { A: 16, B: 14, C: 30, D: 14 },
    styles: [
      ['A1', { b: true }],
      ['A3:A5', { b: true }],
      ['A7:D7', { b: true, al: 'c' }],
      ['A8:A12', { nf: 'yyyy-mm-dd', al: 'c' }],
      ['D8:D15', { nf: '#,##0.00' }],
      ['A13:D15', { b: true }],
    ],
    cells: {
      A1: 'Expense claim',
      A3: 'Employee', B3: 'Dana Kowalski',
      A4: 'Department', B4: 'Sales',
      A5: 'Claim period', B5: 'September 2026',
      A7: 'Date', B7: 'Category', C7: 'Description', D7: 'Amount',
      A8: '2026-09-02', B8: 'Travel', C8: 'Train to client visit', D8: '84.50',
      A9: '2026-09-05', B9: 'Meals', C9: 'Lunch with client', D9: '46.20',
      A10: '2026-09-09', B10: 'Software', C10: 'Design tool subscription', D10: '24.00',
      A11: '2026-09-17', B11: 'Travel', C11: 'Taxi from airport', D11: '38.75',
      A12: '2026-09-22', B12: 'Supplies', C12: 'Notebooks and pens', D12: '15.30',
      A13: 'Total claimed', D13: '=SUM(D8:D12)',
      A14: 'Less advance paid', D14: '100',
      A15: 'Net to reimburse', D15: '=D13-D14',
    },
  }],
};
