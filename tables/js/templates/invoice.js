/* Template data: Invoice. Line items with quantity, unit price, tax and total formulas. */
export default {
  id: 'invoice',
  name: 'Invoice',
  description: 'An invoice with line items: quantity, unit price, tax at the rate in B5, and the line total.',
  sheets: [{
    name: 'Invoice',
    widths: { A: 26, B: 14, C: 14, D: 14, E: 14, F: 14 },
    styles: [
      ['A1', { b: true }],
      ['B5', { nf: '0%' }],
      ['A8:F8', { b: true, al: 'c' }],
      ['B9:B11', { nf: '0', al: 'r' }],
      ['C9:F12', { nf: '#,##0.00' }],
      ['A12:F12', { b: true }],
    ],
    cells: {
      A1: 'Invoice',
      A3: 'Invoice number', B3: 'INV-1001',
      A4: 'Invoice date', B4: '2026-10-01',
      A5: 'Tax rate', B5: '20%',
      A6: 'Bill to', B6: 'Client name',
      A8: 'Description', B8: 'Qty', C8: 'Unit price', D8: 'Net', E8: 'Tax', F8: 'Total',
      A9: 'Website design', B9: '1', C9: '1200', D9: '=B9*C9', E9: '=D9*$B$5', F9: '=D9+E9',
      A10: 'Hosting (per month)', B10: '12', C10: '25', D10: '=B10*C10', E10: '=D10*$B$5', F10: '=D10+E10',
      A11: 'Support (hours)', B11: '6', C11: '80', D11: '=B11*C11', E11: '=D11*$B$5', F11: '=D11+E11',
      A12: 'Totals', D12: '=SUM(D9:D11)', E12: '=SUM(E9:E11)', F12: '=SUM(F9:F11)',
    },
  }],
};
