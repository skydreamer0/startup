import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, planDir, backend, seedPath, migrationsDir, inventoryPath, effectsPath,
  digest, canonical, scanSeed, verifySeedMigrations } from './verify-seed-migrations.mjs';

// Only synthetic copies of reviewed source text are changed. No application
// imports, child processes, package tools, network, Prisma or database runtime.
const read = (base, file) => fs.readFileSync(path.join(base, file), 'utf8');
const load = (base, file) => JSON.parse(read(base, file));
const put = (base, file, value) => {
  fs.mkdirSync(path.dirname(path.join(base, file)), { recursive: true });
  fs.writeFileSync(path.join(base, file), value, 'utf8');
};
const save = (base, file, value) => put(base, file, JSON.stringify(value, null, 2) + '\n');
function fixture(run) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-migration-coverage-'));
  try {
    const inventory = load(root, inventoryPath), effects = load(root, effectsPath);
    const files = new Set([inventoryPath, effectsPath, `${planDir}/manifest.json`, `${planDir}/source-inventory.json`,
      ...inventory.sourceFiles.map(f => f.path), ...effects.referenceSources.map(f => f.path), ...effects.testEvidence.map(t => t.path)]);
    for (const file of files) put(temporary, file, read(root, file));
    return run(temporary);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
function edit(base, file, mutate) { const value = load(base, file); mutate(value); save(base, file, value); }
function change(base, file, from, to) {
  const before = read(base, file);
  assert.ok(before.includes(from), 'control source anchor exists');
  put(base, file, before.replace(from, to));
}
function refreshOuter(base, file) {
  edit(base, inventoryPath, value => { value.sourceFiles.find(f => f.path === file).sha256 = digest(read(base, file)); });
}
function repinEffects(base) {
  edit(base, inventoryPath, value => { value.reviewedEffectsSha256 = digest(canonical(load(base, effectsPath))); });
}
function reject(name, mutate, expected) {
  test(name, () => fixture(base => {
    mutate(base);
    const result = verifySeedMigrations(base);
    assert.equal(result.result, 'FAIL', JSON.stringify(result));
    assert.match(result.errors.join('\n'), expected);
    assert.equal(result.acceptance, 'NOT_RUN');
    assert.equal(result.runtime, 'NOT_RUN');
  }));
}

test('untouched reviewed source passes only static coverage, not acceptance', () => fixture(base => {
  const result = verifySeedMigrations(base);
  assert.deepEqual(result.errors, []);
  assert.equal(result.result, 'PASS');
  assert.deepEqual(result.counts, { seedCalls: 25, nestedWrites: 1, migrations: 16, entryChains: 3 });
  assert.equal(result.acceptance, 'NOT_RUN');
  assert.equal(result.runtime, 'NOT_RUN');
}));
test('JSON indentation and object-key ordering do not change the semantic review pin', () => fixture(base => {
  const effects = load(base, effectsPath);
  put(base, effectsPath, JSON.stringify(Object.fromEntries(Object.entries(effects).reverse())));
  assert.equal(verifySeedMigrations(base).result, 'PASS');
}));
test('literal scanner ignores call-looking comments and quoted text', () => {
  const source = read(root, seedPath), actual = scanSeed(source);
  assert.deepEqual(scanSeed(source + '\n// prisma.product.create({})\n').calls, actual.calls);
  assert.deepEqual(scanSeed(source + '\nconst inert = "prisma.product.create({})";\n').calls, actual.calls);
});

reject('missing mechanical seed call is rejected', base => edit(base, inventoryPath, i => i.seed.calls.splice(5, 1)), /seed call coverage mismatch/);
reject('duplicate mechanical seed call is rejected', base => edit(base, inventoryPath, i => i.seed.calls.push(i.seed.calls[0])), /seed call coverage mismatch/);
reject('extra mechanical seed call is rejected', base => edit(base, inventoryPath, i => i.seed.calls.push({ ...i.seed.calls[0], id: 'seed-999' })), /seed call coverage mismatch/);
reject('missing semantic seed call is rejected', base => edit(base, effectsPath, e => e.seed.calls.pop()), /semantic seed call coverage mismatch/);
reject('duplicate semantic seed call is rejected', base => edit(base, effectsPath, e => e.seed.calls.push(e.seed.calls[0])), /semantic seed call coverage mismatch/);
reject('removed source read remains rejected after outer fingerprint refresh', base => {
  change(base, seedPath, 'await prisma.customer.findMany()', '[]'); refreshOuter(base, seedPath);
}, /seed call coverage mismatch/);
reject('new source call remains rejected after outer fingerprint refresh', base => {
  put(base, seedPath, read(base, seedPath) + '\nprisma.product.findMany();\n'); refreshOuter(base, seedPath);
}, /seed call coverage mismatch/);
reject('changed direct target remains rejected after outer fingerprint refresh', base => {
  change(base, seedPath, 'prisma.tenant.upsert', 'prisma.user.upsert'); refreshOuter(base, seedPath);
}, /seed call source slice changed: seed-001/);
reject('changed call body remains rejected after outer fingerprint refresh', base => {
  change(base, seedPath, "plan: 'pro'", "plan: 'free'"); refreshOuter(base, seedPath);
}, /seed call source slice changed: seed-001/);
reject('changed values outside call slices remain rejected after outer fingerprint refresh', base => {
  change(base, seedPath, 'stockQuantity: 8', 'stockQuantity: 9'); refreshOuter(base, seedPath);
}, /seed reviewed token body changed/);
reject('nested OrderItem body drift remains rejected after outer fingerprint refresh', base => {
  change(base, seedPath, 'quantity: 2, unitPrice: 890', 'quantity: 3, unitPrice: 890'); refreshOuter(base, seedPath);
}, /seed call source slice changed: seed-023/);
reject('missing nested write record is rejected', base => edit(base, effectsPath, e => e.seed.nestedWrites = []), /nested write coverage mismatch/);
reject('semantic seed target change is rejected even when effects pin is refreshed', base => {
  edit(base, effectsPath, e => e.seed.calls[0].targetModels = ['User']); repinEffects(base);
}, /seed target mismatch/);
for (const [name, replacement] of [
  ['computed delegate', "prisma['tenant'].upsert"],
  ['optional delegate', 'prisma?.tenant.upsert'],
  ['client alias', 'other.tenant.upsert'],
]) reject(`unsupported ${name} fails closed`, base => {
  change(base, seedPath, 'prisma.tenant.upsert', replacement);
  if (name === 'client alias') put(base, seedPath, read(base, seedPath) + '\nconst other = prisma;\n');
  refreshOuter(base, seedPath);
}, /unsupported seed prisma binding use/);
reject('unsupported transaction API fails closed', base => {
  put(base, seedPath, read(base, seedPath) + '\nprisma.$transaction([]);\n'); refreshOuter(base, seedPath);
}, /unsupported seed prisma binding use/);
reject('extra client fails closed', base => {
  put(base, seedPath, read(base, seedPath) + '\nconst other = new PrismaClient();\n'); refreshOuter(base, seedPath);
}, /extra client/);
reject('hidden template call fails closed', base => {
  put(base, seedPath, read(base, seedPath) + '\nconst x = `${prisma.user.findMany()}`;\n'); refreshOuter(base, seedPath);
}, /unsupported seed template interpolation/);

reject('removed migration inventory entry is rejected', base => edit(base, inventoryPath, i => i.migrations.pop()), /migration coverage mismatch/);
reject('duplicate migration inventory entry is rejected', base => edit(base, inventoryPath, i => i.migrations.push(i.migrations[0])), /migration coverage mismatch/);
reject('removed migration file is rejected', base => {
  const file = load(base, inventoryPath).migrations[0].source;
  fs.rmSync(path.dirname(path.join(base, file)), { recursive: true });
}, /source fingerprint coverage mismatch|ENOENT/);
reject('new migration file is rejected even if an outer fingerprint is supplied', base => {
  const file = `${migrationsDir}/20990101000000_unreviewed/migration.sql`;
  put(base, file, 'SELECT 1;\n');
  edit(base, inventoryPath, i => i.sourceFiles.push({ path: file, sha256: digest(read(base, file)) }));
}, /migration coverage mismatch/);
reject('extra unexpected migration directory file fails closed', base => {
  const file = load(base, inventoryPath).migrations[0].source;
  put(base, file.replace('migration.sql', 'extra.sql'), 'SELECT 1;\n');
}, /unsupported migration directory contents/);
reject('changed SQL bytes remain rejected after outer fingerprint refresh', base => {
  const file = load(base, inventoryPath).migrations[0].source;
  put(base, file, read(base, file) + '\n-- review must be repeated even for a comment\n'); refreshOuter(base, file);
}, /reviewed SQL bytes changed/);
reject('missing curated migration is rejected', base => edit(base, effectsPath, e => e.migrations.pop()), /semantic migration coverage mismatch/);
reject('changed curated SQL targets require semantic re-review', base => edit(base, effectsPath, e => e.migrations[0].targets = ['User']), /curated semantic review pin changed/);
reject('invalid SQL targets are rejected even after semantic pin refresh', base => {
  edit(base, effectsPath, e => e.migrations[0].targets = ['ImaginaryModel']); repinEffects(base);
}, /invalid migration targets/);
reject('changed schema fingerprint is rejected', base => put(base, `${backend}/prisma/schema.prisma`, read(base, `${backend}/prisma/schema.prisma`) + '\n'), /source fingerprint changed/);
reject('changed migration lock fingerprint is rejected', base => put(base, `${migrationsDir}/migration_lock.toml`, 'provider = "sqlite"\n'), /source fingerprint changed/);
reject('missing source fingerprint is rejected', base => edit(base, inventoryPath, i => i.sourceFiles.pop()), /source fingerprint coverage mismatch/);
reject('duplicate source fingerprint is rejected', base => edit(base, inventoryPath, i => i.sourceFiles.push(i.sourceFiles[0])), /source fingerprint coverage mismatch/);

for (const entry of ['scripts', 'prisma']) reject(`changed ${entry} seed entry rejected after outer refresh`, base => {
  edit(base, `${backend}/package.json`, pkg => { if (entry === 'scripts') pkg.scripts['db:seed'] = 'node different.js'; else pkg.prisma.seed = 'node different.js'; });
  refreshOuter(base, `${backend}/package.json`);
}, /seed entry command changed/);
reject('startup migration removal rejected after outer refresh', base => {
  change(base, `${backend}/Dockerfile`, './node_modules/.bin/prisma migrate deploy && node dist/server.js', 'node dist/server.js');
  refreshOuter(base, `${backend}/Dockerfile`);
}, /startup chain must remain migrate deploy then node/);
reject('startup command reordering rejected after outer refresh', base => {
  change(base, `${backend}/Dockerfile`, './node_modules/.bin/prisma migrate deploy && node dist/server.js', 'node dist/server.js && ./node_modules/.bin/prisma migrate deploy');
  refreshOuter(base, `${backend}/Dockerfile`);
}, /startup chain must remain migrate deploy then node/);
reject('missing entry chain inventory is rejected', base => edit(base, inventoryPath, i => i.entryChains.pop()), /entry chain coverage/);

for (const [name, mutate, expected] of [
  ['owner', e => e.seed.calls[0].ownership = ['imaginary-owner'], /invalid owner metadata/],
  ['valid but wrong model owner', e => e.seed.calls[0].modelOwnership[0].owner = 'CRM', /invalid model owner\/destination/],
  ['destination', e => e.seed.calls[0].destination = ['AR-99'], /invalid destination metadata/],
  ['check ID', e => e.seed.calls[0].checkIds = ['AR-99-FAKE'], /invalid check metadata/],
  ['unrelated check', e => e.seed.calls[0].checkIds = ['AR-23-AC01'], /invalid check metadata/],
  ['test reference', e => e.seed.calls[0].existingTestRefs = ['missing-test'], /invalid test reference metadata/],
  ['coverage gap', e => e.seed.calls[0].missingCoverage = [], /missing NOT_RUN coverage gaps/],
  ['test path escape', e => e.testEvidence[0].path = '../outside.test.ts', /invalid test evidence metadata/],
  ['non-test path', e => e.testEvidence[0].path = seedPath, /invalid test evidence metadata/],
  ['test PASS claim', e => e.testEvidence[0].result = 'PASS', /invalid test evidence metadata/],
  ['runtime PASS claim', e => e.runtimeChecks[0].status = 'PASS', /invalid runtime NOT_RUN metadata/],
  ['missing runtime declaration', e => e.runtimeChecks.pop(), /runtime NOT_RUN declaration coverage mismatch/],
  ['record runtime PASS claim', e => e.seed.calls[0].runtimeStatus = 'PASS', /invalid source-only NOT_RUN metadata/],
  ['nested empty effect', e => e.seed.nestedWrites[0].effects = [], /nested effects missing/],
  ['scope runtime PASS claim', e => e.scope.runtime = 'PASS', /invalid aggregate source-only NOT_RUN metadata/],
  ['migration lock PASS claim', e => e.migrationLock.runtimeStatus = 'PASS', /invalid aggregate source-only NOT_RUN metadata/],
  ['seed summary count', e => e.seed.callSiteCounts.writes = 0, /semantic seed call counts mismatch/],
  ['migration summary count', e => e.boundedInspectionSummary.migrationSqlCount = 0, /semantic summary counts mismatch/],
]) reject(`invalid ${name} metadata rejected despite refreshed semantic pin`, base => {
  edit(base, effectsPath, mutate); repinEffects(base);
}, expected);
reject('missing referenced test source is rejected', base => {
  const evidence = load(base, effectsPath).testEvidence[0]; fs.unlinkSync(path.join(base, evidence.path));
}, /ENOENT/);
reject('edited referenced test bytes are rejected', base => {
  const evidence = load(base, effectsPath).testEvidence[0]; put(base, evidence.path, read(base, evidence.path) + '\n');
}, /curated source citation changed/);
reject('reference source drift rejected despite refreshed effects pin', base => {
  const file = `${backend}/src/lib/readiness.ts`; put(base, file, read(base, file) + '\n'); repinEffects(base);
}, /curated source citation changed/);
reject('missing server reference source is rejected', base => {
  fs.unlinkSync(path.join(base, `${backend}/src/server.ts`));
}, /ENOENT/);
reject('missing reference citation rejected despite refreshed effects pin', base => {
  edit(base, effectsPath, e => e.referenceSources.pop()); repinEffects(base);
}, /reference source citation coverage mismatch/);
reject('duplicate reference citation rejected despite refreshed effects pin', base => {
  edit(base, effectsPath, e => e.referenceSources.push(e.referenceSources[0])); repinEffects(base);
}, /reference source citation coverage mismatch/);
reject('migration lock citation hash rejected despite refreshed effects pin', base => {
  edit(base, effectsPath, e => e.migrationLock.source.sha256 = '0'.repeat(64)); repinEffects(base);
}, /curated source citation changed/);
reject('AC01 promotion cannot be claimed by this tool', base => edit(base, inventoryPath, i => i.acceptance = 'PASS'), /cannot certify application or AC01 acceptance/);
reject('runtime promotion cannot be claimed by this tool', base => edit(base, inventoryPath, i => i.runtime = 'PASS'), /cannot certify application or AC01 acceptance/);
