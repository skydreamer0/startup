// Run with backend as cwd. Never starts server.js or a database connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
(async () => {
  if (process.argv[3] === '--require-alpine') {
    assert.match(process.version, /^v22\./);
    assert.equal(fs.existsSync('/etc/alpine-release'), true);
  }
  const root = process.cwd(), requireBackend = createRequire(path.join(root, 'package.json'));
  const version = requireBackend('argon2/package.json').version;
  assert.equal(version, '0.45.1');
  const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(fixture.synthetic, true); assert.equal(fixture.generator.version, '0.44.0');
  assert.equal(fixture.password, 'SYNTHETIC-ONLY-藥局-compat-62!');
  assert.equal(fixture.cases.length, 3);
  const password = requireBackend('./dist/lib/password.js');
  let checks = 0;
  for (const row of fixture.cases) {
    assert.equal(await password.verifyPassword(row.hash, fixture.password), true); checks++;
    assert.equal(await password.verifyPassword(row.hash, fixture.password + '-wrong'), false); checks++;
  }
  const updates = [], issued = [];
  const user = { id: 'synthetic-user', tenantId: 'synthetic-tenant', email: 'compat@example.invalid', fullName: 'Synthetic Only', status: 'active', passwordHash: fixture.cases[0].hash };
  const prisma = { user: { async findUnique(input) { return input.include ? { ...user, userRoles: [] } : { ...user }; }, async update(input) { updates.push(input); return user; } }, tenant: { async findUnique() { return { plan: 'free' }; } } };
  const jwt = { signAccessToken(value) { issued.push(value); return 'synthetic-access'; }, signRefreshToken() { return 'synthetic-refresh'; }, verifyRefreshToken() { throw Error('unused'); } };
  // Execute the actual compiled AuthService. Only persistence and token issuance are synthetic.
  const module = { exports: {} };
  const requireIsolated = id => {
    if (id === '../../lib/prisma') return { prisma };
    if (id === '../../lib/password') return password;
    if (id === '../../lib/jwt') return jwt;
    throw Error('Unexpected auth dependency: ' + id);
  };
  const source = fs.readFileSync(path.join(root, 'dist/modules/auth/auth.service.js'), 'utf8');
  const execute = vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: 'synthetic-auth-service-harness.cjs' });
  execute(requireIsolated, module, module.exports);
  const service = new module.exports.AuthService();
  const result = await service.login(user.email, fixture.password);
  assert.equal(result.user.id, user.id); assert.equal(result.accessToken, 'synthetic-access');
  assert.equal(issued.length, 1); assert.equal(updates[0].data.failedLoginAttempts, 0); checks++;
  await assert.rejects(service.login(user.email, fixture.password + '-wrong'), error => error.statusCode === 401);
  assert.equal(issued.length, 1); assert.deepEqual(updates[1].data.failedLoginAttempts, { increment: 1 }); checks++;
  assert.equal(user.passwordHash, fixture.cases[0].hash);
  const fresh = await password.hashPassword(fixture.password);
  assert.equal(await password.verifyPassword(fresh, fixture.password), true); checks++;
  console.log(JSON.stringify({ status: 'PASS', checks, argon2: version, node: process.version, platform: process.platform, arch: process.arch, alpine: fs.existsSync('/etc/alpine-release'), scope: 'real compiled password and AuthService; synthetic persistence/JWT, not HTTP/DB login' }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
