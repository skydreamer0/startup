import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const root = 'systems/enterprise-admin';
const expected = [`${root}/pnpm-lock.yaml`, `${root}/backend/package-lock.json`].sort();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', root], { cwd: repo, encoding: 'utf8' });
const actual = [...new Set(files.trim().split('\n'))]
  .filter((file) => /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(file))
  .filter((file) => existsSync(resolve(repo, file))).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Expected only canonical dependency locks: ${expected.join(', ')}; found ${actual.join(', ')}`);
}
const read = (path) => readFileSync(resolve(repo, root, path), 'utf8');
if (/^  backend:/m.test(read('pnpm-lock.yaml')) || /^\s*-\s*['"]?backend['"]?\s*$/m.test(read('pnpm-workspace.yaml'))) {
  throw new Error('Backend must stay in its standalone npm installation boundary');
}
for (const [file, manager] of [['package.json', 'pnpm'], ['backend/package.json', 'npm']]) {
  const pkg = JSON.parse(read(file));
  if (!new RegExp(`^${manager}@\\d+\\.\\d+\\.\\d+$`).test(pkg.packageManager ?? '')) {
    throw new Error(`${file} must pin an exact ${manager} packageManager version`);
  }
}
console.log('Dependency lock boundaries passed: standalone backend npm + frontend/shared pnpm workspace');
