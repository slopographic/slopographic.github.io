/* Template data: Budget. Monthly income and expenses for a quarter, with totals and the balance. */
export default {
  id: 'budget',
  name: 'Budget',
  description: 'Monthly income and expenses for a quarter, with totals and the balance each month.',
  sheets: [{
    name: 'Budget',
    widths: { A: 22, B: 13, C: 13, D: 13, E: 14 },
    styles: [
      ['A1', { b: true }],
      ['A3:E3', { b: true, al: 'c' }],
      ['A4', { b: true }], ['A9', { b: true }],
      ['B5:E16', { nf: '#,##0.00' }],
      ['A7:E7', { b: true }], ['A14:E14', { b: true }], ['A16:E16', { b: true }],
    ],
    cells: {
      A1: 'Household budget',
      A2: 'Type amounts in the month columns. Totals and the balance calculate.',
      A3: 'Category', B3: 'Jan', C3: 'Feb', D3: 'Mar', E3: 'Quarter',
      A4: 'Income',
      A5: 'Salary', B5: '3200', C5: '3200', D5: '3200', E5: '=SUM(B5:D5)',
      A6: 'Freelance', B6: '450', C6: '0', D6: '620', E6: '=SUM(B6:D6)',
      A7: 'Total income', B7: '=SUM(B5:B6)', C7: '=SUM(C5:C6)', D7: '=SUM(D5:D6)', E7: '=SUM(E5:E6)',
      A9: 'Expenses',
      A10: 'Rent', B10: '1400', C10: '1400', D10: '1400', E10: '=SUM(B10:D10)',
      A11: 'Groceries', B11: '420', C11: '380', D11: '450', E11: '=SUM(B11:D11)',
      A12: 'Utilities', B12: '160', C12: '175', D12: '150', E12: '=SUM(B12:D12)',
      A13: 'Transport', B13: '120', C13: '90', D13: '130', E13: '=SUM(B13:D13)',
      A14: 'Total expenses', B14: '=SUM(B10:B13)', C14: '=SUM(C10:C13)', D14: '=SUM(D10:D13)', E14: '=SUM(E10:E13)',
      A16: 'Balance', B16: '=B7-B14', C16: '=C7-C14', D16: '=D7-D14', E16: '=E7-E14',
    },
  }],
};
