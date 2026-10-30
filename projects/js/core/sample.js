// Slop Projects sample: a small website launch for "Try a sample", dated around today, in the backup format (io.js
// reads it like any backup, so the sample goes the same way a file does). Four columns, three people, nine tasks with
// dates, dependencies, tags and a checklist, and one task with no dates yet. Exposes window.SlopProjects.sample(today).
(function (g) {
  'use strict';
  const T = g.SlopTime;
  const NS = (g.SlopProjects = g.SlopProjects || {});

  /** The sample backup for a project that started a week before `today` (YYYY-MM-DD). */
  function sample(today) {
    const d = (n) => T.addDays(T.weekStart(today), n - 7);
    const task = (id, title, column, order, o = {}) => ({ id, title, column, order, priority: 'none', tags: [], checklist: [], deps: [], ...o });
    return {
      format: 'slop-projects', version: 1, exportedAt: new Date(0).toISOString(),
      project: {
        id: 'sample', name: 'Website launch', color: 'teal', start: d(0), end: d(32),   // i18n-ignore: the sample project's own content
        notes: 'A sample project. Change anything; delete it from Project when you are done.',
        people: ['Ada', 'Ben', 'Chen'],   // i18n-ignore: the sample project's own content
        columns: [{ id: 'todo', name: 'To do' }, { id: 'doing', name: 'Doing', wip: 3 }, { id: 'review', name: 'Review', wip: 2 }, { id: 'done', name: 'Done', done: true }],   // i18n-ignore: the sample project's own content
      },
      tasks: [
        task('brief', 'Write the brief', 'done', 0, { assignee: 'Ada', priority: 'high', start: d(0), end: d(2), tags: ['planning'],   // i18n-ignore: the sample project's own content
          checklist: [{ text: 'Goals', done: true }, { text: 'Audience', done: true }, { text: 'Budget', done: true }] }),   // i18n-ignore: the sample project's own content
        task('sitemap', 'Sitemap and page list', 'done', 1, { assignee: 'Ben', start: d(3), end: d(5), deps: ['brief'], tags: ['planning'] }),   // i18n-ignore: the sample project's own content
        task('design', 'Design the home page', 'review', 0, { assignee: 'Chen', priority: 'high', start: d(6), end: d(11), deps: ['sitemap'], tags: ['design'],   // i18n-ignore: the sample project's own content
          checklist: [{ text: 'Wireframe', done: true }, { text: 'Colours and type', done: true }, { text: 'Mobile layout', done: false }] }),   // i18n-ignore: the sample project's own content
        task('copy', 'Write the page copy', 'doing', 0, { assignee: 'Ada', priority: 'medium', start: d(6), end: d(13), deps: ['sitemap'], tags: ['content'],   // i18n-ignore: the sample project's own content
          description: 'Home, About, Services and Contact. Short sentences, one idea each.' }),   // i18n-ignore: the sample project's own content
        task('photos', 'Choose photos', 'doing', 1, { assignee: 'Chen', start: d(9), end: d(12), tags: ['design', 'content'] }),   // i18n-ignore: the sample project's own content
        task('build', 'Build the pages', 'todo', 0, { assignee: 'Ben', priority: 'high', start: d(14), end: d(22), deps: ['design', 'copy'], tags: ['build'] }),   // i18n-ignore: the sample project's own content
        task('seo', 'Titles, descriptions and redirects', 'todo', 1, { assignee: 'Ada', start: d(19), end: d(23), deps: ['copy'], tags: ['build', 'content'] }),   // i18n-ignore: the sample project's own content
        task('test', 'Test on phones and browsers', 'todo', 2, { assignee: 'Ben', priority: 'medium', start: d(23), end: d(26), deps: ['build'], tags: ['build'],   // i18n-ignore: the sample project's own content
          checklist: [{ text: 'iPhone Safari', done: false }, { text: 'Android Chrome', done: false }, { text: 'Desktop Firefox', done: false }] }),   // i18n-ignore: the sample project's own content
        task('launch', 'Launch', 'todo', 3, { assignee: 'Ada', priority: 'high', start: d(29), end: d(29), due: d(29), deps: ['test', 'seo'], tags: ['launch'] }),   // i18n-ignore: the sample project's own content
        task('newsletter', 'Tell the newsletter', 'todo', 4, { assignee: 'Chen', tags: ['launch'], description: 'No date yet: schedule it from the timeline.' }),   // i18n-ignore: the sample project's own content
      ],
    };
  }

  NS.sample = sample;
})(typeof window !== 'undefined' ? window : globalThis);
