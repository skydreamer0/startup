import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEvidence } from './inventory-fefo-trace-native.mjs';

function fixture() {
  const tables = Object.fromEntries(Array.from({ length: 28 }, (_, i) => [`table_${i}`, []]));
  const phase = () => ({ before: structuredClone(tables), after: structuredClone(tables) });
  return [
    { success: true, numFailedTests: 0, numPendingTests: 0, testResults: [{ assertionResults: [{ status: 'passed' }] }] },
    { event: 'afterAll-complete', serverClosed: true, prismaDisconnected: true, appPrismaDisconnected: true, cleanupErrorCount: 0, sourceHead: 'head' },
    { businessTableCount: 28, initialDetailReads: phase(), paginationAndAuthorizationReads: phase() },
    { acceptance: 'passed', sourceHead: 'head', tracePagination: { total: 131, returned: 100, order: 'createdAt desc, id desc' } },
    { sourceHead: 'head' },
  ];
}
test('accepts complete joined evidence', () => verifyEvidence(...fixture()));
for (const [name, mutate] of [
  ['skipped native case', f => { f[0].testResults[0].assertionResults[0].status = 'pending'; }],
  ['empty suite', f => { f[0].testResults = []; }],
  ['extra tests', f => { f[0].testResults[0].assertionResults.push({ status: 'passed' }); }],
  ['open application pool', f => { f[1].appPrismaDisconnected = false; }],
  ['wrong source', f => { f[1].sourceHead = 'other'; }],
  ['changed read-only table', f => { f[2].initialDetailReads.after.table_0.push({ id: 1 }); }],
  ['missing tables', f => { delete f[2].paginationAndAuthorizationReads.before.table_0; }],
  ['wrong trace cap', f => { f[3].tracePagination.returned = 99; }],
]) test(`rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => verifyEvidence(...f)); });
