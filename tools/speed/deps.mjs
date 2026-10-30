// The page speed tools' own packages, pinned exactly in one place. They are not in package.json, so the 17 test jobs
// (rules.yml) never download them (~48 MB); the speed workflow installs them on top of npm ci:
//   npm install --no-save --no-audit --no-fund $(node tools/speed/deps.mjs)
export const DEPS = { lighthouse: '13.5.0', 'chrome-launcher': '1.2.2' };

/** The install arguments: name@version for each package. */
export const installArgs = () => Object.entries(DEPS).map(([n, v]) => `${n}@${v}`);

if (import.meta.url === `file://${process.argv[1]}`) console.log(installArgs().join(' '));
