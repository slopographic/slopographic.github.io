/* Template data: Grade book. Scores per test, the average, a letter grade formula and the class average. */
export default {
  id: 'grade-book',
  name: 'Grade book',
  description: 'Test scores for each student, with the average, a letter grade and the class average.',
  sheets: [{
    name: 'Grades',
    widths: { A: 22, B: 11, C: 11, D: 11, E: 11, F: 12, G: 10 },
    styles: [
      ['A1', { b: true }],
      ['A4:G4', { b: true, al: 'c' }],
      ['B5:F11', { nf: '0.0' }],
      ['G5:G10', { al: 'c' }],
      ['A11:G11', { b: true }],
    ],
    cells: {
      A1: 'Grade book',
      A2: 'Scores out of 100. The average and the letter grade calculate.',
      A4: 'Student', B4: 'Test 1', C4: 'Test 2', D4: 'Test 3', E4: 'Test 4', F4: 'Average', G4: 'Grade',
      A5: 'Amara Osei', B5: '88', C5: '92', D5: '79', E5: '85', F5: '=AVERAGE(B5:E5)', G5: '=IF(F5>=90,"A",IF(F5>=80,"B",IF(F5>=70,"C",IF(F5>=60,"D","F"))))',
      A6: 'Ben Carter', B6: '72', C6: '68', D6: '75', E6: '70', F6: '=AVERAGE(B6:E6)', G6: '=IF(F6>=90,"A",IF(F6>=80,"B",IF(F6>=70,"C",IF(F6>=60,"D","F"))))',
      A7: 'Chloe Dupont', B7: '95', C7: '98', D7: '91', E7: '94', F7: '=AVERAGE(B7:E7)', G7: '=IF(F7>=90,"A",IF(F7>=80,"B",IF(F7>=70,"C",IF(F7>=60,"D","F"))))',
      A8: 'Diego Ramos', B8: '55', C8: '61', D8: '58', E8: '64', F8: '=AVERAGE(B8:E8)', G8: '=IF(F8>=90,"A",IF(F8>=80,"B",IF(F8>=70,"C",IF(F8>=60,"D","F"))))',
      A9: 'Esi Mensah', B9: '80', C9: '84', D9: '87', E9: '83', F9: '=AVERAGE(B9:E9)', G9: '=IF(F9>=90,"A",IF(F9>=80,"B",IF(F9>=70,"C",IF(F9>=60,"D","F"))))',
      A10: 'Farid Haidari', B10: '67', C10: '73', D10: '70', E10: '78', F10: '=AVERAGE(B10:E10)', G10: '=IF(F10>=90,"A",IF(F10>=80,"B",IF(F10>=70,"C",IF(F10>=60,"D","F"))))',
      A11: 'Class average', B11: '=AVERAGE(B5:B10)', C11: '=AVERAGE(C5:C10)', D11: '=AVERAGE(D5:D10)', E11: '=AVERAGE(E5:E10)', F11: '=AVERAGE(F5:F10)',
    },
  }],
};
