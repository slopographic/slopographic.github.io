/* Template data: Sales pipeline. Opportunities by stage with value, probability and weighted value. */
export default {
  id: 'sales-pipeline',
  name: 'Sales pipeline',
  description: 'Opportunities by stage. Weighted value is the value times the probability of winning.',
  sheets: [{
    name: 'Pipeline',
    widths: { A: 22, B: 14, C: 14, D: 14, E: 13, F: 16 },
    styles: [
      ['A1', { b: true }],
      ['A4:F4', { b: true, al: 'c' }],
      ['D5:D11', { nf: '#,##0' }],
      ['E5:E10', { nf: '0%', al: 'r' }],
      ['F5:F11', { nf: '#,##0' }],
      ['A11:F11', { b: true }],
    ],
    cells: {
      A1: 'Sales pipeline',
      A2: 'Weighted value is value times probability.',
      A4: 'Opportunity', B4: 'Account', C4: 'Stage', D4: 'Value', E4: 'Probability', F4: 'Weighted value',
      A5: 'Website redesign', B5: 'Northwind', C5: 'Proposal', D5: '18000', E5: '60%', F5: '=D5*E5',
      A6: 'Annual support', B6: 'Contoso', C6: 'Negotiation', D6: '9500', E6: '80%', F6: '=D6*E6',
      A7: 'Data migration', B7: 'Fabrikam', C7: 'Qualified', D7: '24000', E7: '30%', F7: '=D7*E7',
      A8: 'Training day', B8: 'Litware', C8: 'Lead', D8: '2400', E8: '10%', F8: '=D8*E8',
      A9: 'Mobile app', B9: 'Adatum', C9: 'Proposal', D9: '56000', E9: '40%', F9: '=D9*E9',
      A10: 'Consulting retainer', B10: 'Tailspin', C10: 'Closed won', D10: '12000', E10: '100%', F10: '=D10*E10',
      A11: 'Total', D11: '=SUM(D5:D10)', F11: '=SUM(F5:F10)',
    },
  }],
};
