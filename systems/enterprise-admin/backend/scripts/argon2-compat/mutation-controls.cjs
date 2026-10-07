// Negative controls mutate only temporary copies of compiled synthetic-test inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const fixture = path.resolve(process.argv[2]);
const source = fs.readFileSync(path.join(root, 'dist/modules/auth/auth.service.js'), 'utf8');
const refresh = source.match(/\(0, ([\w$]+)\.signRefreshToken\)/);
assert.ok(refresh, 'Compiled refresh-token call must be recognizable');
assert.ok(source.includes('failedLoginAttempts: 0,'));
assert.ok(source.includes('if (!validPassword) {'));
const mutations = [
  ['password hash overwrite', source.replace('failedLoginAttempts: 0,', "passwordHash: 'CORRUPTED-SYNTHETIC-HASH', failedLoginAttempts: 0,")],
  ['refresh token before rejection', source.replace('if (!validPassword) {', `if (!validPassword) { (0, ${refresh[1]}.signRefreshToken)({userId:user.id,type:'refresh'});`)],
];
for (const [name, modified] of mutations) {
  assert.notEqual(modified, source);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'startup62-mutation-'));
  try {
    fs.mkdirSync(path.join(temp, 'dist/modules/auth'), { recursive: true });
    fs.mkdirSync(path.join(temp, 'dist/lib'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'package.json'), '{"private":true}');
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
    fs.copyFileSync(path.join(root, 'dist/lib/password.js'), path.join(temp, 'dist/lib/password.js'));
    fs.writeFileSync(path.join(temp, 'dist/modules/auth/auth.service.js'), modified);
    const run = spawnSync(process.execPath, [path.join(__dirname, 'verify-final.cjs'), fixture, ...process.argv.slice(3)], { cwd: temp, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.error, undefined, name); assert.equal(run.signal, null, name);
    assert.equal(run.status, 1, `${name} must make the verifier fail`);
    assert.match(run.stderr, /Expected values|Expected values to be/);
    assert.doesNotMatch(run.stdout, /"status":"PASS"/);
    console.log(JSON.stringify({ mutation: name, rejected: true }));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
