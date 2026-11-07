/* Template data: Inventory list. SKU, name, quantity, reorder level and a low-stock status formula. */
export default {
  id: 'inventory',
  name: 'Inventory list',
  description: 'Stock on hand by SKU. Status shows Reorder when quantity is at or below the reorder level.',
  sheets: [{
    name: 'Inventory',
    widths: { A: 14, B: 30, C: 15, D: 15, E: 14 },
    styles: [
      ['A1', { b: true }],
      ['A4:E4', { b: true, al: 'c' }],
      ['C5:D12', { nf: '#,##0', al: 'r' }],
      ['E5:E12', { al: 'c' }],
      ['A14:C15', { b: true }],
    ],
    cells: {
      A1: 'Inventory list',
      A2: 'Items at or below their reorder level are marked Reorder.',
      A4: 'SKU', B4: 'Item', C4: 'Qty on hand', D4: 'Reorder level', E4: 'Status',
      A5: 'SKU-1001', B5: 'Notebook A5', C5: '120', D5: '50', E5: '=IF(C5<=D5,"Reorder","OK")',
      A6: 'SKU-1002', B6: 'Ballpoint pens (box of 12)', C6: '14', D6: '20', E6: '=IF(C6<=D6,"Reorder","OK")',
      A7: 'SKU-1003', B7: 'Printer paper A4', C7: '35', D7: '25', E7: '=IF(C7<=D7,"Reorder","OK")',
      A8: 'SKU-1004', B8: 'Stapler', C8: '4', D8: '5', E8: '=IF(C8<=D8,"Reorder","OK")',
      A9: 'SKU-1005', B9: 'Desk lamp', C9: '22', D9: '10', E9: '=IF(C9<=D9,"Reorder","OK")',
      A10: 'SKU-1006', B10: 'Whiteboard marker', C10: '9', D10: '15', E10: '=IF(C10<=D10,"Reorder","OK")',
      A11: 'SKU-1007', B11: 'USB-C cable', C11: '60', D11: '20', E11: '=IF(C11<=D11,"Reorder","OK")',
      A12: 'SKU-1008', B12: 'Sticky notes', C12: '0', D12: '10', E12: '=IF(C12<=D12,"Reorder","OK")',
      A14: 'Total units', C14: '=SUM(C5:C12)',
      A15: 'Items to reorder', C15: '=COUNTIF(E5:E12,"Reorder")',
    },
  }],
};
