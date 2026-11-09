import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { SPEC } from './http-writers-spec.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MAP = 'systems/enterprise-admin/infrastructure/plans/architecture-v2/http-writers-access-expenses.json';
export const CONTRACT_TEST = 'scripts/architecture/http-writers-contract.test.mjs';
const BACKEND = 'systems/enterprise-admin/backend/src/';
const INVENTORY = 'systems/enterprise-admin/infrastructure/plans/architecture-v2/source-inventory.json';
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sorted = values => [...values].sort();

// No execution of application sources, dependency loading, DB, provider or network operations.
export function reader(root = ROOT) {
  const base = fs.realpathSync(root);
  return relative => {
    if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('unsafe input path');
    const resolved = fs.realpathSync(path.join(base, relative));
    if (!resolved.startsWith(base + path.sep) || !fs.statSync(resolved).isFile()) throw new Error('input escapes root');
    return fs.readFileSync(resolved, 'utf8');
  };
}

export function citation(read, file, range) {
  const lines = read(file).split('\n');
  const [startLine, endLine] = range;
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > lines.length) throw new Error('invalid citation range');
  return { path: file, startLine, endLine, sha256: sha256(lines.slice(startLine - 1, endLine).join('\n')) };
}

export function inspectEndpoint(id, read = reader()) {
  const spec = SPEC.endpoints.find(row => row.id === id);
  if (!spec) throw new Error('unsupported endpoint');
  const prefix = `${BACKEND}modules/${spec.group}/${spec.group}.`;
  const route = citation(read, prefix + 'routes.ts', spec.routeLines);
  const controller = citation(read, prefix + 'controller.ts', spec.controllerLines);
  const service = citation(read, prefix + 'service.ts', spec.serviceLines);
  const lines = read(service.path).split('\n');
  const writes = [];
  // Deliberately finite extractor over byte-pinned, independently inspected source.
  // It is not an AST parser or proof for arbitrary TypeScript/nested/raw/aliased calls.
  for (let line = service.startLine; line <= service.endLine; line++) {
    const text = lines[line - 1];
    for (const match of text.matchAll(/\b(prisma|tx)\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g)) {
      let transaction = match[1] === 'tx' ? 'CALLBACK_TRANSACTION' : 'SEPARATE_PRISMA_CALL';
      if (spec.id === 'USERS-CREATE' && match[2] === 'auditLog') transaction = 'AFTER_CALLBACK_COMMIT';
      const condition = match[2] === 'userRole' ? (spec.id === 'USERS-CREATE' ? 'roleIds has nonzero length' : 'roleIds provided, including empty array') : 'reached after preceding guards and awaited operations';
      writes.push({ model: match[2], operation: match[3], receiver: match[1], nested: false, transaction, condition, citation: citation(read, service.path, [line, line]) });
    }
  }
  if (spec.id === 'ROLES-CREATE') {
    const body = lines.slice(service.startLine - 1, service.endLine).join('\n');
    if (!/rolePermissions:\s*{\s*create: data\.permissionIds\.map/.test(body)) throw new Error('nested RolePermission source changed');
    writes.push({ model: 'rolePermission', operation: 'create', receiver: 'role.rolePermissions', nested: true, transaction: 'NESTED_IN_PARENT_CREATE', condition: 'permissionIds provided, including empty array', citation: citation(read, service.path, [54, 56]) });
  }
  return { route, controller, service, explicitWriteSites: writes };
}

function routeFacts(spec, read) {
  const inv = JSON.parse(read(INVENTORY));
  const row = inv.routes.find(r => r.method === spec.method && r.path === spec.path);
  const mod = inv.modules.find(m => m.module === spec.group);
  if (!row || !mod) throw new Error('inventory endpoint missing');
  return {
    id: spec.id, method: spec.method, path: spec.path, group: spec.group,
    handler: spec.handler, classification: 'DB_WRITER', owner: mod.owner, destination: mod.destination,
    origin: { issue: 'https://github.com/skydreamer0/startup/issues/180', acceptance: 'AR-00-AC01', meaning: 'Inventory of existing behavior only; no original business requirement acceptance claimed' },
    authorization: { permission: spec.permission, auth: 'authMiddleware', tenant: 'setTenantContext', validation: spec.group === 'expenses' ? 'NO_ROUTE_VALIDATE_MIDDLEWARE' : 'ZOD_ROUTE_VALIDATE', runtimeVerified: false },
    boundary: spec.boundary,
    businessEffects: { stock: 'NO_EXPLICIT_STOCK_CALL_SITE_NOT_EFFECT_CLOSURE', payment: spec.group === 'expenses' ? 'EXPLICIT_EXPENSE_SITE_NOT_PROVIDER_TRANSFER_OR_EFFECT_CLOSURE' : 'NO_EXPLICIT_PAYMENT_CALL_SITE_NOT_EFFECT_CLOSURE', external: 'NO_EXPLICIT_PROVIDER_CALL_SITE_NOT_TRANSITIVE_CLOSURE' },
  };
}

function requestControlledData(spec, read) {
  if (!['EXPENSES-CREATE', 'EXPENSES-UPDATE'].includes(spec.id)) return null;
  const update = spec.id === 'EXPENSES-UPDATE';
  const prefix = BACKEND + 'modules/expenses/expenses.';
  const schema = 'systems/enterprise-admin/backend/prisma/schema.prisma';
  return {
    status: 'OPEN_GAP',
    kind: 'REQUEST_CONTROLLED_PRISMA_DATA',
    targetsClosed: false,
    nestedRelationTargets: 'NOT_ENUMERATED',
    additionalScalarAndOperationFields: 'NOT_BOUNDED_BY_RUNTIME_SCHEMA',
    forwarding: update ? 'req.body -> updateExpense(data) -> prisma.expense.update({ where, data })' : 'req.body -> createExpense(data) -> tenantPersistence().data(data) -> prisma.expense.create',
    dataBoundary: update ? 'Update extension scopes where; it does not strip or constrain data.' : 'Spread retains request keys while overwriting top-level tenantId; this does not establish accepted relation/scalar combinations or bound nested effects.',
    unverifiedPayloadClasses: update ? ['tenant.update', 'tenantId', 'amount.increment'] : ['tenant relation input', 'extra scalar/operation fields', 'mixed relation and tenantId input'],
    prismaAcceptance: 'NOT_RUN',
    httpAndPgPersistence: 'NOT_RUN',
    evidence: 'SOURCE_CHARACTERIZATION_ONLY; mocked argument forwarding is separate evidence, not persisted behavior',
    citations: [
      citation(read, prefix + 'routes.ts', update ? [14,14] : [13,13]),
      citation(read, prefix + 'controller.ts', update ? [30,33] : [21,24]),
      citation(read, prefix + 'service.ts', update ? [53,69] : [35,47]),
      citation(read, BACKEND + 'lib/prisma.ts', update ? [54,59] : [47,53]),
      citation(read, schema, [536,550]),
      citation(read, schema, [15,46]),
      ...(update ? [] : [citation(read, BACKEND + 'lib/tenant-persistence.ts', [20,22])]),
    ],
  };
}

function testCitation(spec, read) {
  const content = read(CONTRACT_TEST);
  const name = `${spec.id}: source mapping contract`;
  const literal = `test('${name}',`;
  const matches = content.split('\n').map((text, i) => text.includes(literal) ? i + 1 : 0).filter(Boolean);
  if (matches.length !== 1) throw new Error(`missing or duplicate static test declaration: ${name}`);
  return { path: CONTRACT_TEST, name, declarationLine: matches[0], sourceSha256: sha256(content), kind: 'SOURCE_MAPPING_ASSERTIONS_ONLY', executionResult: 'SEE_SEPARATE_RECEIPT_NOT_INFERRED_FROM_CITATION' };
}

export function expectedMap(read = reader()) {
  return {
    schemaVersion: 1,
    subject: { sourceHead: SPEC.sourceHead, sourceTree: SPEC.sourceTree },
    scope: { modules: ['users', 'roles', 'expenses'], endpoints: 8, explicitDirectWriteSites: 15, explicitNestedWriteSites: 1, writeCountMeaning: 'SYNTACTIC_CALL_SITES_NOT_EXHAUSTIVE_RUNTIME_EFFECTS', runtimeWriteTargets: 'NOT_CLOSED', fullHttpAc01: 'NOT_RUN', evidenceLevel: 'PINNED_EXPLICIT_SOURCE_SITES_ONLY', liveActivation: 'NOT_VERIFIED', appExecution: 'NOT_RUN', database: 'NOT_RUN', allBusinessRequirementsMapped: false },
    sources: Object.entries(SPEC.pins).map(([file, hash]) => ({ path: file, sha256: hash })),
    shared: SPEC.shared,
    endpoints: SPEC.endpoints.map(spec => ({
      ...routeFacts(spec, read),
      ...inspectEndpoint(spec.id, read),
      requestControlledData: requestControlledData(spec, read),
      staticTest: testCitation(spec, read),
      runtimeTests: { status: 'NOT_RUN', mapping: 'MISSING_ENDPOINT_BEHAVIOR_EVIDENCE', citations: [], requiredCases: spec.runtimeGaps },
    })),
  };
}

export function verifyHttpWriters(map, { read = reader() } = {}) {
  const errors = [];
  const check = (condition, error) => { if (!condition) errors.push(error); };
  try {
    const expected = expectedMap(read);
    // Named gates also have isolated guard-removal witnesses in the mutation suite.
    /* guard:identity */ check(isDeepStrictEqual(Object.keys(map).sort(), Object.keys(expected).sort()) && map.schemaVersion === expected.schemaVersion && isDeepStrictEqual(map.subject, expected.subject) && isDeepStrictEqual(map.scope, expected.scope), 'identity/scope mismatch');
    /* guard:pins */ check(isDeepStrictEqual(map.sources, expected.sources) && Object.entries(SPEC.pins).every(([file, hash]) => sha256(read(file)) === hash), 'source pin mismatch');
    /* guard:shared */ check(isDeepStrictEqual(map.shared, expected.shared), 'shared effect mapping mismatch');
    if (!Array.isArray(map.endpoints)) throw new Error('endpoints must be array');
    /* guard:membership */ check(isDeepStrictEqual(sorted(map.endpoints.map(r => r.id)), sorted(expected.endpoints.map(r => r.id))), 'endpoint membership mismatch');
    for (const actual of map.endpoints) {
      const target = expected.endpoints.find(row => row.id === actual.id);
      if (!target) { errors.push('unknown endpoint'); continue; }
      const factKeys = ['id','method','path','group','handler','classification','owner','destination','origin','authorization','boundary','businessEffects'];
      /* guard:facts */ check(factKeys.every(key => isDeepStrictEqual(actual[key], target[key])) && isDeepStrictEqual(Object.keys(actual).sort(), Object.keys(target).sort()), `${actual.id}: route/effect facts mismatch`);
      /* guard:chain */ check(['route','controller','service','explicitWriteSites'].every(key => isDeepStrictEqual(actual[key], target[key])), `${actual.id}: source chain/write coverage mismatch`);
      /* guard:dataflow */ check(isDeepStrictEqual(actual.requestControlledData, target.requestControlledData), `${actual.id}: request-controlled data gap mismatch`);
      /* guard:tests */ check(isDeepStrictEqual(actual.staticTest, target.staticTest) && isDeepStrictEqual(actual.runtimeTests, target.runtimeTests), `${actual.id}: test evidence boundary mismatch`);
    }
  } catch (error) { errors.push(`input error: ${error.message}`); }
  return { result: errors.length ? 'FAIL' : 'PASS', errors, scope: 'EIGHT_ENDPOINT_EXPLICIT_SOURCE_SITES_ONLY', runtimeAcceptance: 'NOT_RUN' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--root')) throw new Error('usage: node http-writers-verify.mjs [--root checkout]');
    const read = reader(args.length ? args[1] : ROOT);
    const result = verifyHttpWriters(JSON.parse(read(MAP)), { read });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
