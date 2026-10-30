// A mirror's own CI workflow, made from this repository's .github/workflows/rules.yml: the same jobs (file rules, Node
// tests, the plan, the whole browser suite in its parallel slices, the touch jobs), without what only makes sense here:
// the white-label jobs (a mirror cannot build mirrors), the changed-script rule (it needs this repository's history), the
// commit identity of this repository and the cdn check (it reads this repository's cdn). The tests that are about this
// repository only are not in a build at all (tests/repo-only.json), so the mirror runs every test it has. The build then
// renames the workflow like every other file. Node only. Tests: tests/node/whitelabel-build.test.mjs.

/** Steps left out of a mirror, by the start of their name. */
export const DROP_STEPS = ['Every changed script has a test', 'Every cdn file answers'];

/** Jobs left out of a mirror: the white-label build of the samples and the jobs that test those builds. */
export const DROP_JOBS = ['whitelabel', 'whitelabel-browser', 'whitelabel-touch'];

/** The workflow without a job and the comment lines just above it. */
function dropJob(yml, name) {
  const lines = yml.split('\n');
  const at = lines.findIndex((l) => l === `  ${name}:`);
  if (at < 0) return yml;
  let start = at;
  while (start > 0 && /^\s*#/.test(lines[start - 1])) start--;
  let end = at + 1;
  while (end < lines.length && !/^  [\w-]+:$/.test(lines[end]) && !/^  # /.test(lines[end])) end++;
  while (end > at + 1 && lines[end - 1].trim() === '') end--;
  return lines.slice(0, start).concat(lines.slice(end)).join('\n').replace(/\n{3,}/g, '\n\n');
}

/** The workflow text without the dropped jobs and steps and without the git identity lines. */
export function mirrorWorkflow(yml) {
  const lines = DROP_JOBS.reduce(dropJob, yml).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- name: (.*)$/);
    if (m && DROP_STEPS.some((d) => m[2].startsWith(d))) {
      const ind = m[1].length;
      while (i + 1 < lines.length && !(lines[i + 1].trim() && lines[i + 1].search(/\S/) <= ind)) i++;
      continue;
    }
    if (/^\s*git config user\.(name|email) /.test(lines[i])) continue;
    out.push(lines[i]);
  }
  return out.join('\n').replace(/\s*$/, '\n')
    .replace(/^# The file rules[\s\S]*?\n(?=on:)/m, '# Generated with the site: the file rules, the Node tests and the browser tests, on every push.\n')
    .replace(/name: Set up the repo as a clone is[^\n]*/, 'name: Install the test dependencies');
}
