import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Read-only source coverage, not a TypeScript/SQL interpreter or runtime test.
// Never imports application code, loads .env, runs a command, or opens a network/DB.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const planDir = 'systems/enterprise-admin/infrastructure/plans/architecture-v2';
export const backend = 'systems/enterprise-admin/backend';
export const seedPath = `${backend}/prisma/seed.ts`;
export const migrationsDir = `${backend}/prisma/migrations`;
export const inventoryPath = `${planDir}/seed-migration-inventory.json`;
export const effectsPath = `${planDir}/seed-migration-effects.json`;
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : v);
const same = (a, b) => canonical(a) === canonical(b);
const list = value => Array.isArray(value) ? value : [];
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const sourcePath = value => typeof value === 'string' ? value : value?.path;
const safePath = p => nonempty(p) && !path.isAbsolute(p) && !p.includes('\\')
  && !p.split('/').some(s => !s || s === '.' || s === '..') && !/[?*\x00]/.test(p);
function checkedPath(base, relative) {
  if (!safePath(relative)) throw Error(`unsafe path: ${relative}`);
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw Error(`symbolic link not allowed: ${relative}`);
  }
  return current;
}
const read = (base, relative) => fs.readFileSync(checkedPath(base, relative), 'utf8');
const readJson = (base, relative) => JSON.parse(read(base, relative));

// Deliberately limited literal lexer. All nonliteral uses of the sole `prisma`
// binding fail closed: aliases/destructuring, computed or optional members,
// tagged templates, extra clients and transaction/raw/extension APIs need review.
// Template interpolation supports property chains only. Regex/division tokens and
// escaped/non-ASCII identifiers are unsupported. This is NOT a general AST.
function tokens(source) {
  const result = [];
  for (let i = 0; i < source.length;) {
    const start = i, c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith('//', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue; }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw Error('unterminated seed comment');
      i = end + 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') { i += 2; continue; }
        if (c === '`' && source.startsWith('${', i)) {
          const end = source.indexOf('}', i + 2), expression = source.slice(i + 2, end).trim();
          if (end < 0 || !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expression)
            || /\b(?:prisma|PrismaClient)\b/.test(expression)) throw Error('unsupported seed template interpolation');
          i = end + 1; continue;
        }
        if (c !== '`' && /[\r\n]/.test(source[i])) throw Error('unsupported multiline seed string');
        i++;
      }
      if (i >= source.length) throw Error('unterminated seed string');
      i++; result.push({ kind: 'literal', text: source.slice(start, i), start, end: i }); continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      i++; while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i++;
      result.push({ kind: 'identifier', text: source.slice(start, i), start, end: i }); continue;
    }
    if (c === '/' || c === '\\' || c.charCodeAt(0) > 127) throw Error('unsupported seed token (regex, escaped or non-ASCII identifier)');
    i++; result.push({ kind: 'punctuation', text: c, start, end: i });
  }
  return result;
}

export function scanSeed(source) {
  const ts = tokens(source), values = ts.map(t => t.text), calls = [];
  const clientRefs = ts.map((t, i) => t.kind === 'identifier' && t.text === 'PrismaClient' ? i : -1).filter(i => i >= 0);
  if (clientRefs.length !== 2 || !same(values.slice(0, 7), ['import', '{', 'PrismaClient', '}', 'from', "'@prisma/client'", ';']))
    throw Error('unsupported seed PrismaClient import or extra client');
  let declarations = 0;
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].kind !== 'identifier' || ts[i].text !== 'prisma') continue;
    if (values[i - 1] === 'const' && same(values.slice(i, i + 7), ['prisma', '=', 'new', 'PrismaClient', '(', ')', ';'])) {
      declarations++; continue;
    }
    let delegate, operation, open;
    if (same(values.slice(i + 1, i + 4), ['.', '$disconnect', '('])) {
      delegate = '$client'; operation = '$disconnect'; open = i + 3;
    } else if (values[i + 1] === '.' && ts[i + 2]?.kind === 'identifier'
      && values[i + 3] === '.' && ts[i + 4]?.kind === 'identifier' && values[i + 5] === '(') {
      delegate = values[i + 2]; operation = values[i + 4]; open = i + 5;
      if (!['upsert', 'create', 'createMany', 'findMany'].includes(operation)) throw Error(`unsupported seed operation: ${operation}`);
    } else throw Error('unsupported seed prisma binding use');
    const stack = [], closing = { ')': '(', ']': '[', '}': '{' };
    let close = open;
    for (; close < ts.length; close++) {
      if (ts[close].kind !== 'punctuation') continue;
      const token = values[close];
      if (['(', '[', '{'].includes(token)) stack.push(token);
      if (closing[token] && stack.pop() !== closing[token]) throw Error('unbalanced seed call');
      if (!stack.length) break;
    }
    if (close === ts.length) throw Error('unterminated seed call');
    if (operation === '$disconnect' && close !== open + 1) throw Error('unsupported disconnect arguments');
    calls.push({ id: `seed-${String(calls.length + 1).padStart(3, '0')}`,
      line: source.slice(0, ts[i].start).split('\n').length, delegate, operation,
      sourceSha256: digest(source.slice(ts[i].start, ts[close].end)) });
  }
  if (declarations !== 1) throw Error('seed requires exactly one literal prisma client declaration');
  return { calls, tokenSha256: digest(canonical(ts.map(t => [t.kind, t.text]))) };
}

export function migrationFiles(base) {
  const directory = checkedPath(base, migrationsDir), files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'migration_lock.toml') continue;
    if (!entry.isDirectory() || !/^\d{14}_[a-z0-9_]+$/.test(entry.name)) throw Error(`unsupported migration entry: ${entry.name}`);
    const children = fs.readdirSync(path.join(directory, entry.name), { withFileTypes: true });
    if (children.length !== 1 || children[0].name !== 'migration.sql' || !children[0].isFile())
      throw Error(`unsupported migration directory contents: ${entry.name}`);
    files.push(`${migrationsDir}/${entry.name}/migration.sql`);
  }
  return files.sort();
}

export function entryChains(packageSource, dockerSource) {
  const pkg = JSON.parse(packageSource), stages = [], aliases = new Set();
  for (const raw of dockerSource.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^#\s*escape\s*=/i.test(line)) throw Error('unsupported Docker escape directive');
    if (!line || line.startsWith('#')) continue;
    if (/\\$/.test(line) || line.includes('<<')) throw Error('unsupported Docker continuation/heredoc');
    const match = line.match(/^([a-z]+)\s+(.+)$/i);
    if (!match) throw Error('unsupported Docker instruction');
    const name = match[1].toUpperCase(), value = match[2];
    if (name === 'FROM') {
      const from = value.match(/^(\S+)(?:\s+AS\s+([a-z0-9_-]+))?$/i);
      if (!from) throw Error('unsupported Docker FROM');
      stages.push({ inherited: aliases.has(from[1].toLowerCase()) || /^\d+$/.test(from[1]) || from[1].includes('$'), commands: [] });
      if (from[2]) aliases.add(from[2].toLowerCase());
    } else if (name === 'CMD' || name === 'ENTRYPOINT') {
      if (!stages.length) throw Error('Docker startup before FROM');
      stages.at(-1).commands.push({ name, argv: JSON.parse(value) });
    }
  }
  const last = stages.at(-1);
  if (!last || last.inherited || last.commands.length !== 1 || last.commands[0].name !== 'CMD'
    || !same(last.commands[0].argv, ['sh', '-c', './node_modules/.bin/prisma migrate deploy && node dist/server.js']))
    throw Error('startup chain must remain migrate deploy then node; unsupported Docker startup');
  if (pkg.scripts?.['db:seed'] !== 'tsx prisma/seed.ts' || pkg.prisma?.seed !== 'tsx prisma/seed.ts')
    throw Error('seed entry command changed');
  return [
    { id: 'package-seed', source: `${backend}/package.json`, entry: 'scripts.db:seed', command: pkg.scripts['db:seed'], targets: [seedPath] },
    { id: 'prisma-seed', source: `${backend}/package.json`, entry: 'prisma.seed', command: pkg.prisma.seed, targets: [seedPath] },
    { id: 'docker-startup', source: `${backend}/Dockerfile`, entry: 'CMD', command: JSON.stringify(last.commands[0].argv),
      targets: [migrationsDir, `${backend}/dist/server.js`], order: ['prisma migrate deploy', 'node dist/server.js'] },
  ];
}

function exactSet(actual, expected, label, errors) {
  if (!Array.isArray(actual) || actual.some(x => typeof x !== 'string') || new Set(actual).size !== actual.length
    || !same([...actual].sort(), [...expected].sort())) errors.push(`${label} coverage mismatch (missing, extra or duplicate)`);
}

export function verifySeedMigrations(base = root) {
  const errors = [], counts = { seedCalls: 0, nestedWrites: 0, migrations: 0, entryChains: 0 };
  try {
    const inventory = readJson(base, inventoryPath), effects = readJson(base, effectsPath);
    const manifest = readJson(base, `${planDir}/manifest.json`), oldInventory = readJson(base, `${planDir}/source-inventory.json`);
    const taskIds = new Set(manifest.tasks.map(t => t.id));
    const checkTasks = new Map(manifest.tasks.flatMap(t => t.requiredChecks.map(c => [c.id, t.id])));
    const owners = new Set([...Object.values(oldInventory.models).map(m => m.owner), ...oldInventory.cli.map(c => c.owner)]);
    if (inventory.schemaVersion !== 1 || effects.schemaVersion !== 1) errors.push('unsupported inventory schema');
    if (!same(inventory.verificationSubject, effects.verificationSubject)
      || !/^[0-9a-f]{40}$/.test(inventory.verificationSubject?.head ?? '')
      || !/^[0-9a-f]{40}$/.test(inventory.verificationSubject?.tree ?? '')) errors.push('verification subject mismatch');
    if (inventory.acceptance !== 'NOT_RUN' || inventory.runtime !== 'NOT_RUN') errors.push('inventory cannot certify application or AC01 acceptance');
    if (effects.scope?.runtime !== 'NOT_RUN' || effects.scope?.evidence !== 'SOURCE_INSPECTION_ONLY'
      || effects.migrationLock?.runtimeStatus !== 'NOT_RUN') errors.push('invalid aggregate source-only NOT_RUN metadata');
    const runtimeActions = ['seed execution', 'migration clean install', 'populated schema upgrade/backfill',
      'rollback and interruption recovery', 'application startup', 'native PostgreSQL assertions', 'browser/HTTP/device/store acceptance'];
    exactSet(list(effects.runtimeChecks).map(c => c?.action), runtimeActions, 'runtime NOT_RUN declaration', errors);
    for (const check of list(effects.runtimeChecks)) {
      if (check.status !== 'NOT_RUN' || !nonempty(check.reason)) errors.push(`invalid runtime NOT_RUN metadata: ${check.action}`);
    }
    const actualMigrations = migrationFiles(base);
    const actualSources = [seedPath, `${backend}/package.json`, `${backend}/Dockerfile`, `${backend}/prisma/schema.prisma`, `${migrationsDir}/migration_lock.toml`, ...actualMigrations];
    const references = [`${planDir}/source-inventory.json`, `${planDir}/manifest.json`, `${backend}/prisma/schema.prisma`,
      `${backend}/src/lib/readiness.ts`, `${backend}/src/server.ts`];
    exactSet(list(effects.referenceSources).map(s => s?.path), references, 'reference source citation', errors);
    if (effects.migrationLock?.source?.path !== `${migrationsDir}/migration_lock.toml`
      || effects.migrationLock?.provider !== 'postgresql') errors.push('migration lock citation/provider mismatch');
    exactSet(list(inventory.sourceFiles).map(f => f?.path), actualSources, 'source fingerprint', errors);
    for (const f of list(inventory.sourceFiles)) {
      if (!actualSources.includes(f?.path) || !sha256(f?.sha256) || digest(read(base, f.path)) !== f.sha256) errors.push(`source fingerprint changed: ${f?.path}`);
    }
    const seed = read(base, seedPath), scanned = scanSeed(seed);
    counts.seedCalls = scanned.calls.length; counts.migrations = actualMigrations.length;
    if (inventory.seed?.source !== seedPath || inventory.seed?.tokenSha256 !== scanned.tokenSha256) errors.push('seed reviewed token body changed');
    exactSet(list(inventory.seed?.calls).map(c => c?.id), scanned.calls.map(c => c.id), 'seed call', errors);
    for (const actual of scanned.calls) {
      if (!same(list(inventory.seed?.calls).find(c => c.id === actual.id), actual)) errors.push(`seed call source slice changed: ${actual.id}`);
    }
    const chains = entryChains(read(base, `${backend}/package.json`), read(base, `${backend}/Dockerfile`));
    counts.entryChains = chains.length;
    if (!same(inventory.entryChains, chains)) errors.push('entry chain coverage/definition changed');
    exactSet(list(inventory.migrations).map(m => m?.source), actualMigrations, 'migration', errors);
    for (const migration of list(inventory.migrations)) {
      if (!actualMigrations.includes(migration.source) || !sha256(migration.reviewedSqlSha256) || digest(read(base, migration.source)) !== migration.reviewedSqlSha256)
        errors.push(`reviewed SQL bytes changed: ${migration.source}`);
    }
    const models = new Set([...read(base, `${backend}/prisma/schema.prisma`).matchAll(/^model (\w+) \{/gm)].map(m => m[1]));
    const testEvidence = list(effects.testEvidence), tests = new Map(testEvidence.map(t => [t.id, t]));
    if (!Array.isArray(effects.testEvidence) || !testEvidence.length || tests.size !== testEvidence.length) errors.push('test evidence catalogue missing or duplicate');
    for (const evidence of testEvidence) {
      const isTestOrHarness = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(evidence.path)
        || /^(?:systems\/enterprise-admin\/backend\/)?scripts\/.+\.[cm]js$/.test(evidence.path);
      if (!nonempty(evidence.id) || !safePath(evidence.path) || !isTestOrHarness
        || evidence.source?.path !== evidence.path || !nonempty(evidence.scope) || evidence.result !== 'NOT_RUN') errors.push(`invalid test evidence metadata: ${evidence.id}`);
      else if (!fs.statSync(checkedPath(base, evidence.path)).isFile()) errors.push(`test reference is not a file: ${evidence.id}`);
    }
    function metadata(record, label) {
      if (record?.runtimeStatus !== 'NOT_RUN' || record?.evidenceStatus !== 'SOURCE_INSPECTION_ONLY') errors.push(`invalid source-only NOT_RUN metadata: ${label}`);
      if (!record || !Array.isArray(record.ownership) || !record.ownership.length || record.ownership.some(o => !owners.has(o))
        || new Set(record.ownership).size !== record.ownership.length) errors.push(`invalid owner metadata: ${label}`);
      if (!Array.isArray(record?.destination) || !record.destination.length || record.destination.some(d => !taskIds.has(d))
        || new Set(record.destination).size !== record.destination.length) errors.push(`invalid destination metadata: ${label}`);
      if (!Array.isArray(record?.checkIds) || !record.checkIds.length || record.checkIds.some(c => !checkTasks.has(c)
        || (checkTasks.get(c) !== 'AR-00' && !list(record.destination).includes(checkTasks.get(c))))
        || new Set(record.checkIds).size !== record.checkIds.length) errors.push(`invalid check metadata: ${label}`);
      if (!Array.isArray(record?.existingTestRefs) || record.existingTestRefs.some(t => !tests.has(t))
        || new Set(record.existingTestRefs).size !== record.existingTestRefs.length) errors.push(`invalid test reference metadata: ${label}`);
      if (!Array.isArray(record?.missingCoverage) || !record.missingCoverage.length || record.missingCoverage.some(t => !nonempty(t)))
        errors.push(`missing NOT_RUN coverage gaps: ${label}`);
    }
    function modelOwnership(record, targets, label) {
      exactSet(list(record.modelOwnership).map(m => m?.model), targets, `model ownership ${label}`, errors);
      for (const info of list(record.modelOwnership)) {
        const expected = oldInventory.models[info.model];
        if (!expected || info.owner !== expected.owner || !same(info.destination, expected.destination)
          || !list(record.ownership).includes(info.owner) || list(info.destination).some(d => !list(record.destination).includes(d)))
          errors.push(`invalid model owner/destination: ${label}/${info.model}`);
      }
    }
    exactSet(list(effects.seed?.calls).map(c => c?.id), scanned.calls.map(c => c.id), 'semantic seed call', errors);
    if (sourcePath(effects.seed?.source) !== seedPath) errors.push('semantic seed source mismatch');
    for (const call of list(effects.seed?.calls)) {
      metadata(call, call.id);
      const actual = scanned.calls.find(c => c.id === call.id);
      if (!actual || call.line !== actual.line || call.delegate !== actual.delegate || call.operation !== actual.operation) errors.push(`semantic seed call identity mismatch: ${call.id}`);
      const model = actual?.delegate === '$client' ? [] : [actual?.delegate?.replace(/^./, c => c.toUpperCase())];
      if (!same(call.targetModels, model) || model.some(m => !models.has(m))) errors.push(`seed target mismatch: ${call.id}`);
      modelOwnership(call, model, call.id);
      if (!Array.isArray(call.effects) || !call.effects.length || call.effects.some(e => !nonempty(e))) errors.push(`seed effects missing: ${call.id}`);
    }
    // One reviewed nested create is explicit; its entire parent call is slice-pinned.
    const expectedNested = [{ id: 'seed-023-items', parentCall: 'seed-023', relation: 'items', operation: 'create', targetModels: ['OrderItem'] }];
    const nested = list(effects.seed?.nestedWrites); counts.nestedWrites = nested.length;
    const expectedCallCounts = { total: scanned.calls.length, writes: scanned.calls.filter(c => ['upsert', 'create', 'createMany'].includes(c.operation)).length,
      reads: scanned.calls.filter(c => c.operation === 'findMany').length, lifecycle: scanned.calls.filter(c => c.operation === '$disconnect').length,
      nestedRelationWriteSites: nested.length, nestedOrderItemRows: 2 };
    if (!same(effects.seed?.callSiteCounts, expectedCallCounts)) errors.push('semantic seed call counts mismatch');
    if (effects.boundedInspectionSummary?.migrationSqlCount !== actualMigrations.length || effects.boundedInspectionSummary?.seedCallCount !== scanned.calls.length
      || effects.boundedInspectionSummary?.testSourceCount !== testEvidence.length) errors.push('semantic summary counts mismatch');
    exactSet(nested.map(n => n.id), expectedNested.map(n => n.id), 'nested write', errors);
    for (const record of nested) {
      metadata(record, record.id);
      if (!Array.isArray(record.effects) || !record.effects.length || record.effects.some(e => !nonempty(e))) errors.push(`nested effects missing: ${record.id}`);
      const expected = expectedNested.find(n => n.id === record.id);
      if (!expected || Object.keys(expected).some(key => !same(record[key], expected[key]))) errors.push(`nested write identity mismatch: ${record.id}`);
      modelOwnership(record, ['OrderItem'], record.id);
    }
    if (!/items\s*:\s*\{\s*create\s*:/.test(seed) || !/items\s+OrderItem\[\]/.test(read(base, `${backend}/prisma/schema.prisma`))) errors.push('reviewed nested OrderItem relation changed');
    exactSet(list(effects.entryChains).map(c => c?.id), chains.map(c => c.id), 'semantic entry chain', errors);
    for (const chain of list(effects.entryChains)) {
      metadata(chain, chain.id);
      const actual = chains.find(c => c.id === chain.id);
      const command = Array.isArray(chain.command) ? JSON.stringify(chain.command) : chain.command;
      if (!actual || sourcePath(chain.source) !== actual.source || command !== actual.command) errors.push(`semantic entry chain changed: ${chain.id}`);
      if (!Array.isArray(chain.effects) || !chain.effects.length || chain.effects.some(e => !nonempty(e))) errors.push(`entry chain effects missing: ${chain.id}`);
    }
    exactSet(list(effects.migrations).map(m => sourcePath(m?.source)), actualMigrations, 'semantic migration', errors);
    for (const migration of list(effects.migrations)) {
      const file = sourcePath(migration.source);
      metadata(migration, file);
      if (!Array.isArray(migration.targets) || !migration.targets.length || migration.targets.some(m => !models.has(m))
        || new Set(migration.targets).size !== migration.targets.length) errors.push(`invalid migration targets: ${file}`);
      modelOwnership(migration, list(migration.targets), file);
      for (const field of ['ddlEffects', 'dmlBackfillEffects', 'triggersAndCascades']) {
        if (!Array.isArray(migration[field]) || !migration[field].length || migration[field].some(e => !nonempty(e))) errors.push(`missing curated SQL effects ${field}: ${file}`);
      }
    }
    // Curated source citations must also bind to the bytes actually reviewed.
    for (const citation of [effects.seed?.source, effects.migrationLock?.source, ...list(effects.referenceSources),
      ...list(effects.entryChains).map(c => c.source), ...list(effects.migrations).map(m => m.source), ...testEvidence.map(t => t.source)]) {
      const allowed = actualSources.includes(citation?.path) || references.includes(citation?.path) || testEvidence.some(t => t.path === citation?.path
        && (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(t.path) || /^(?:systems\/enterprise-admin\/backend\/)?scripts\/.+\.[cm]js$/.test(t.path)));
      if (!allowed || !citation || typeof citation !== 'object' || !sha256(citation.sha256)) { errors.push('invalid curated source citation'); continue; }
      const bytes = fs.readFileSync(checkedPath(base, citation.path));
      const gitBlobSha = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (digest(bytes) !== citation.sha256 || gitBlobSha !== citation.gitBlobSha) errors.push(`curated source citation changed: ${citation.path}`);
    }
    // Review pin prevents silent semantic edits; it is not automated SQL analysis.
    if (!sha256(inventory.reviewedEffectsSha256) || digest(canonical(effects)) !== inventory.reviewedEffectsSha256) errors.push('curated semantic review pin changed');
  } catch (error) { errors.push(`read/parse/unsupported source: ${error.message}`); }
  return { result: errors.length ? 'FAIL' : 'PASS', scope: 'read-only seed/startup-migration source coverage', counts,
    acceptance: 'NOT_RUN', runtime: 'NOT_RUN', errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) { console.error('No arguments supported; read-only repository verification only.'); process.exitCode = 1; }
  else { const result = verifySeedMigrations(); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.result === 'PASS' ? 0 : 1; }
}
