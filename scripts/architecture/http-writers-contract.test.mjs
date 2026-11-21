import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEndpoint, reader, MAP } from './http-writers-verify.mjs';

// These assert a source mapping, never execute the application and never certify
// auth/RBAC/tenant isolation, actual transaction behavior or HTTP responses.
const read = reader();
const map = JSON.parse(read(MAP));
function sourceContract(id, expectedCalls, expectedBoundary, expectedStart, expectedEnd) {
  const row = map.endpoints.find(item => item.id === id);
  const actual = inspectEndpoint(id, read);
  assert.deepEqual(actual.explicitWriteSites.map(w => `${w.receiver}.${w.model}.${w.operation}`), expectedCalls);
  assert.deepEqual(row.explicitWriteSites, actual.explicitWriteSites);
  assert.equal(row.boundary, expectedBoundary);
  assert.deepEqual([actual.service.startLine, actual.service.endLine], [expectedStart, expectedEnd]);
  assert.equal(row.runtimeTests.status, 'NOT_RUN');
  assert.equal(row.runtimeTests.mapping, 'MISSING_ENDPOINT_BEHAVIOR_EVIDENCE');
  assert.deepEqual(row.runtimeTests.citations, []);
  return actual;
}

test('USERS-CREATE: source mapping contract', () => {
  const actual = sourceContract('USERS-CREATE', ['tx.user.create','tx.userRole.createMany','prisma.auditLog.create'], 'CALLBACK_USER_AND_ROLES_THEN_SEPARATE_AUDIT', 108, 150);
  assert.deepEqual(actual.explicitWriteSites.map(w => w.transaction), ['CALLBACK_TRANSACTION','CALLBACK_TRANSACTION','AFTER_CALLBACK_COMMIT']);
  assert.equal(actual.explicitWriteSites[1].condition, 'roleIds has nonzero length');
});
test('USERS-UPDATE: source mapping contract', () => {
  const actual = sourceContract('USERS-UPDATE', ['prisma.user.update','prisma.userRole.deleteMany','prisma.userRole.createMany','prisma.auditLog.create'], 'SEPARATE_USER_ROLE_REPLACEMENT_AND_AUDIT', 155, 193);
  assert.ok(actual.explicitWriteSites.every(w => w.transaction === 'SEPARATE_PRISMA_CALL'));
});
test('USERS-DELETE: source mapping contract', () => {
  sourceContract('USERS-DELETE', ['prisma.user.update','prisma.auditLog.create'], 'SOFT_DELETE_THEN_SEPARATE_AUDIT', 198, 220);
});
test('ROLES-CREATE: source mapping contract', () => {
  const actual = sourceContract('ROLES-CREATE', ['prisma.role.create','role.rolePermissions.rolePermission.create'], 'ONE_ROLE_CREATE_WITH_NESTED_PERMISSIONS', 38, 73);
  assert.equal(actual.explicitWriteSites[1].nested, true);
  assert.equal(actual.explicitWriteSites[1].transaction, 'NESTED_IN_PARENT_CREATE');
});
test('ROLES-REPLACE: source mapping contract', () => {
  const actual = sourceContract('ROLES-REPLACE', ['prisma.rolePermission.deleteMany','prisma.rolePermission.createMany'], 'SEPARATE_PERMISSION_DELETE_AND_CREATE', 78, 89);
  assert.ok(actual.explicitWriteSites.every(w => w.transaction === 'SEPARATE_PRISMA_CALL'));
});
test('EXPENSES-CREATE: source mapping contract', () => {
  sourceContract('EXPENSES-CREATE', ['prisma.expense.create'], 'EXPLICIT_EXPENSE_CREATE_SITE_WITH_DYNAMIC_DATA', 35, 48);
  const gap=map.endpoints.find(r=>r.id==='EXPENSES-CREATE').requestControlledData;
  assert.equal(gap.status, 'OPEN_GAP');
  assert.equal(gap.targetsClosed, false);
  assert.equal(gap.prismaAcceptance, 'NOT_RUN');
});
test('EXPENSES-UPDATE: source mapping contract', () => {
  sourceContract('EXPENSES-UPDATE', ['prisma.expense.update'], 'READ_THEN_EXPLICIT_EXPENSE_UPDATE_SITE_WITH_DYNAMIC_DATA', 53, 70);
  const row=map.endpoints.find(r=>r.id==='EXPENSES-UPDATE');
  assert.equal(row.requestControlledData.targetsClosed, false);
  assert.equal(row.requestControlledData.nestedRelationTargets, 'NOT_ENUMERATED');
  assert.deepEqual(row.requestControlledData.unverifiedPayloadClasses, ['tenant.update','tenantId','amount.increment']);
  assert.equal(row.requestControlledData.httpAndPgPersistence, 'NOT_RUN');
  for (const name of ['request-nested-tenant-update-targets-and-authorization','request-tenantId-reassignment','request-amount-operation-object']) assert.ok(row.runtimeTests.requiredCases.includes(name));
});
test('EXPENSES-DELETE: source mapping contract', () => {
  sourceContract('EXPENSES-DELETE', ['prisma.expense.delete'], 'READ_THEN_SINGLE_HARD_EXPENSE_DELETE', 75, 81);
});
