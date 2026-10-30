/* Template data: Project plan. Tasks with owner, start and end dates, a duration formula and status. */
export default {
  id: 'project-plan',
  name: 'Project plan',
  description: 'Tasks with an owner, start and end dates, duration in days (both ends counted) and status.',
  sheets: [{
    name: 'Plan',
    widths: { A: 26, B: 14, C: 13, D: 13, E: 16, F: 16 },
    styles: [
      ['A1', { b: true }],
      ['A4:F4', { b: true, al: 'c' }],
      ['C5:D10', { nf: 'yyyy-mm-dd', al: 'c' }],
      ['E5:E10', { nf: '0', al: 'r' }],
      ['A12:E13', { b: true }],
    ],
    cells: {
      A1: 'Project plan',
      A2: 'Start and end are dates. Duration counts both days.',
      A4: 'Task', B4: 'Owner', C4: 'Start', D4: 'End', E4: 'Duration (days)', F4: 'Status',
      A5: 'Kickoff and scope', B5: 'Priya', C5: '2026-10-12', D5: '2026-10-13', E5: '=D5-C5+1', F5: 'Done',
      A6: 'Requirements', B6: 'Sam', C6: '2026-10-14', D6: '2026-10-20', E6: '=D6-C6+1', F6: 'In progress',
      A7: 'Design', B7: 'Lee', C7: '2026-10-21', D7: '2026-10-30', E7: '=D7-C7+1', F7: 'Not started',
      A8: 'Build', B8: 'Priya', C8: '2026-11-02', D8: '2026-11-20', E8: '=D8-C8+1', F8: 'Not started',
      A9: 'Testing', B9: 'Sam', C9: '2026-11-23', D9: '2026-11-27', E9: '=D9-C9+1', F9: 'Not started',
      A10: 'Launch', B10: 'Lee', C10: '2026-11-30', D10: '2026-11-30', E10: '=D10-C10+1', F10: 'Not started',
      A12: 'Project span (days)', E12: '=MAX(D5:D10)-MIN(C5:C10)+1',
      A13: 'Tasks done', E13: '=COUNTIF(F5:F10,"Done")',
    },
  }],
};
