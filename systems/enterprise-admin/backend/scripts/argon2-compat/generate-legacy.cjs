// Generates synthetic test material only; never reads accounts, env secrets or a DB.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const moduleRoot = path.resolve(process.argv[2]);
  const version = require(path.join(moduleRoot, 'package.json')).version;
  assert.equal(version, '0.44.0');
  const argon2 = require(moduleRoot);
  const password = 'SYNTHETIC-ONLY-藥局-compat-62!';
  const cases = [];
  for (const [name, options] of [['default', {}], ['argon2i', { type: argon2.argon2i }], ['argon2d', { type: argon2.argon2d }]]) {
    const hash = await argon2.hash(password, options);
    assert.equal(await argon2.verify(hash, password), true);
    cases.push({ name, hash });
  }
  const fixture = { synthetic: true, generator: { package: 'argon2', version, node: process.version, platform: process.platform, arch: process.arch }, password, cases };
  fs.writeFileSync(process.argv[3], JSON.stringify(fixture, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ generated: cases.length, version, synthetic: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
