import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { root, planDir, loadPlan, verifyManifest, validateEvidence } from '../../../../../../scripts/architecture/verify-plan.mjs';
import { schedule } from '../../../../../../scripts/architecture/plan.mjs';

// Recovered gate source was pinned to #205. This integration updates only the
// verifier blob pin to the reviewed CLI-inventory implementation; original source
// SHA256 is recorded in README.md. All assertions still execute.
// Every completion/approval below is synthetic validator input. No record is
// written to the real manifest/evidence ledger or used as pharmacy acceptance.
const baseline = () => loadPlan();
const sha = '1'.repeat(40);
const tree = '2'.repeat(40);
const scope = 'TEST_ONLY validator fixture; no business acceptance';
const expected = {
  'scripts/architecture/verify-plan.mjs': 'c0710b7ca8c310dca6326275022d274b1a00566f',
  'scripts/architecture/plan.mjs': '406f08fd2f1994cf4f069e9717f0fea9284825e8',
  [`${planDir}/manifest.json`]: '953d682851d8f6f6c414c5147ea9117894b2262d',
  [`${planDir}/evidence.json`]: 'd1bd1ed5947b6349095cd3a0fe60776254047dba',
};
const blobHash = bytes => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function proof(task) {
  return {
    id: `synthetic-${task.id}`, taskId: task.id,
    checkIds: task.requiredChecks.map(c => c.id),
    subject: { sha, tree, dirty: false },
    command: 'synthetic validator input, not an executed pharmacy command',
    executor: 'synthetic-author', recordedAt: '2026-11-08T00:00:00Z',
    environment: 'TEST_ONLY', scope, result: 'PASS', exitCode: 0,
    artifacts: [{ uri: 'fixture://synthetic-only', sha256: '3'.repeat(64) }],
    limitations: ['Fabricated positive fixture for the validator only.'],
    review: { reviewer: 'synthetic-reviewer', sha, result: 'PASS' },
  };
}
function finish(task) {
  const e = proof(task);
  Object.assign(task, {
    status: 'complete', verification: 'PASS', owner: 'synthetic-author',
    reviewer: 'synthetic-reviewer', completionEvidence: [e.id],
    verificationSubject: { sha, tree },
  });
  return e;
}
function isolated(index = 0) {
  const { manifest: m } = baseline();
  const t = m.tasks[index];
  m.tasks = [t];
  Object.assign(t, { dependsOn: [], integrationDependsOn: [], status: 'planned' });
  return { m, t };
}
const errors = (m, evidence = []) => verifyManifest(m, evidence).join('\n');

function assertTaskIndependentReview(verify) {
  const { m, t } = isolated(), e = finish(t);
  assert.deepEqual(verify(m, [e]), [], 'positive task fixture is accepted');
  const selfReviewed = { ...structuredClone(e), executor: e.review.reviewer };
  assert.deepEqual(validateEvidence(selfReviewed), []);
  assert.deepEqual({ ...selfReviewed, executor: e.executor }, e,
    'executor is the only changed field');
  assert.equal(selfReviewed.review.reviewer, t.reviewer,
    'evidence reviewer still matches the declared task reviewer');
  assert.notEqual(t.owner, t.reviewer, 'owner and reviewer remain independent');
  assert.match(verify(m, [selfReviewed]).join('\n'), /missing exact reviewed PASS/,
    'task completion must reject a matching reviewer who also executed the check');
}

function assertGateIndependentReview(verify) {
  const { manifest: m } = baseline(), g = m.activationGates[0], e = proof(m.tasks[23]);
  e.checkIds = g.requiredChecks.map(c => c.id);
  e.gateIds = [g.id];
  Object.assign(g, { status: 'PASS', scope, reviewer: e.review.reviewer,
    verificationSubject: { sha, tree }, completionEvidence: [e.id] });
  assert.deepEqual(verify(m, [e]), [], 'positive gate fixture is accepted');
  const selfReviewed = { ...structuredClone(e), executor: e.review.reviewer };
  assert.deepEqual(validateEvidence(selfReviewed), []);
  assert.deepEqual({ ...selfReviewed, executor: e.executor }, e,
    'executor is the only changed field');
  assert.equal(selfReviewed.review.reviewer, g.reviewer,
    'evidence reviewer still matches the declared gate reviewer');
  assert.match(verify(m, [selfReviewed]).join('\n'), /missing exact scoped reviewed PASS/,
    'gate completion must reject a matching reviewer who also executed the check');
}

function assertIntegrationCompletion(verify) {
  const { manifest: m } = baseline();
  m.tasks = m.tasks.slice(0, 2);
  const [t, prerequisite] = m.tasks;
  prerequisite.dependsOn = [];
  prerequisite.integrationDependsOn = [];
  const e = finish(t);
  assert.deepEqual(verify(m, [e]), [], 'positive completion fixture is accepted');
  assert.equal(prerequisite.status, 'planned');
  const negative = structuredClone(m);
  negative.tasks[0].integrationDependsOn = [prerequisite.id];
  assert.deepEqual({ ...negative.tasks[0], integrationDependsOn: [] }, t,
    'the unfinished integration dependency is the only changed task field');
  assert.deepEqual(verify(negative, [e]),
    [`${t.id} completion has unfinished dependency ${prerequisite.id}`],
    'completion must reject an unfinished integration dependency');
}

function assertReadyRequiresGatePass(verify) {
  for (let index = 0; index < 8; index++) {
    const { m, t } = isolated(), e = finish(t), g = m.activationGates[index];
    t.activationGates = [g.id];
    Object.assign(t, { activation: 'READY', activationSubject: { sha, tree }, activationScope: scope });
    const gateEvidence = proof(t);
    gateEvidence.id = `synthetic-gate-${g.id}`;
    gateEvidence.checkIds = g.requiredChecks.map(c => c.id);
    gateEvidence.gateIds = [g.id];
    Object.assign(g, { status: 'PASS', scope, reviewer: gateEvidence.review.reviewer,
      verificationSubject: { sha, tree }, completionEvidence: [gateEvidence.id] });
    const ledger = [e, gateEvidence];
    assert.deepEqual(verify(m, ledger), [], `${g.id}: positive READY fixture is accepted`);
    for (const status of ['NOT_RUN', 'FAIL', 'SKIP', 'BLOCKED']) {
      const negative = structuredClone(m);
      negative.activationGates[index].status = status;
      assert.deepEqual({ ...negative.activationGates[index], status: 'PASS' }, g,
        'gate status is the only changed field; source, scope and reviewed evidence still match');
      assert.deepEqual(verify(negative, ledger),
        [`${t.id} activation cannot bypass incomplete evidence or decisions`],
        'READY must reject a non-PASS gate even when all other activation conditions match');
    }
  }
}

test('all four executable/baseline inputs match the frozen integration Git blobs', () => {
  for (const [file, hash] of Object.entries(expected)) {
    assert.equal(blobHash(fs.readFileSync(path.join(root, file))), hash, file);
  }
});

test('live baseline does not confuse focused evidence with AR-00 completion', () => {
  const { manifest: m, evidence } = baseline();
  assert.deepEqual(verifyManifest(m, evidence), []);
  const result = schedule(m, evidence);
  assert.deepEqual(result.active, ['AR-00']);
  assert.deepEqual(result.ready, []);
  assert.equal(result.blocked.length, 23);
  assert.equal(m.tasks[0].completionEvidence.length, 0);
  assert.equal(m.tasks[0].verification, 'NOT_RUN');
  assert.equal(m.tasks[0].requiredChecks.filter(c => c.kind === 'planned-acceptance').length, 5);
  assert(result.activation.every(t => t.status === 'BLOCKED'));
});

test('every one of 24 tasks rejects each non-PASS outcome as completion', () => {
  for (let i = 0; i < 24; i++) {
    for (const result of ['FAIL', 'SKIP', 'NOT_RUN', 'BLOCKED']) {
      const { m, t } = isolated(i), e = finish(t);
      e.result = result;
      e.reason = 'Synthetic negative control';
      e.exitCode = result === 'FAIL' ? 1 : null;
      assert.deepEqual(validateEvidence(e), [], `${t.id}/${result}: valid non-PASS fixture`);
      assert.match(errors(m, [e]), /missing exact reviewed PASS/, `${t.id}/${result}`);
    }
  }
});

test('every declared required check is individually necessary for completion', () => {
  let exercised = 0;
  for (let i = 0; i < 24; i++) {
    const { m, t } = isolated(i), e = finish(t);
    assert.deepEqual(verifyManifest(m, [e]), []);
    for (const check of t.requiredChecks) {
      const candidate = structuredClone(e);
      candidate.checkIds = candidate.checkIds.filter(id => id !== check.id);
      assert.match(errors(m, [candidate]), new RegExp(`missing exact reviewed PASS for ${check.id}`));
      exercised++;
    }
  }
  assert(exercised >= 100, `unexpectedly small acceptance set: ${exercised}`);
});

test('every task rejects wrong task, source SHA, tree, review SHA and self-review', () => {
  const mutations = [
    e => { e.taskId = 'AR-99'; },
    e => { e.subject.sha = '4'.repeat(40); e.review.sha = e.subject.sha; },
    e => { e.subject.tree = '5'.repeat(40); },
    e => { e.review.sha = '6'.repeat(40); },
    e => { e.executor = e.review.reviewer; },
  ];
  for (let i = 0; i < 24; i++) {
    for (const mutate of mutations) {
      const { m, t } = isolated(i), e = finish(t);
      mutate(e);
      assert.match(errors(m, [e]), /missing exact reviewed PASS/, t.id);
    }
  }
});

test('all 512 policy combinations leave isolated engineering ready and activation blocked', () => {
  for (let mask = 0; mask < 512; mask++) {
    const { m, t } = isolated(0);
    t.decisionGates = m.decisions.map(d => d.id);
    for (let i = 0; i < 9; i++) {
      if (mask & (1 << i)) Object.assign(m.decisions[i], {
        status: 'APPROVED', approvalSource: 'https://example.invalid/synthetic-policy-fixture',
      });
    }
    const p = schedule(m);
    assert.deepEqual(p.ready, [t.id]);
    assert.equal(p.activation[0].status, 'BLOCKED');
    assert.deepEqual(p.activation[0].decisionBlocked,
      m.decisions.filter(d => d.status === 'UNAPPROVED').map(d => d.id));
    assert(m.decisions.every(d => d.testProfile === 'TEST_ONLY' && d.scope === 'activation-only'));
  }
});

test('each unapproved decision rejects READY even after synthetic software completion', () => {
  for (let i = 0; i < 9; i++) {
    const { m, t } = isolated(0), e = finish(t);
    t.decisionGates = [m.decisions[i].id];
    Object.assign(t, { activation: 'READY', activationSubject: { sha, tree }, activationScope: scope });
    assert.match(errors(m, [e]), /activation cannot bypass incomplete evidence or decisions/);
  }
});

test('all eight activation gates require scoped independent source-bound evidence', () => {
  const mutations = [
    e => { e.scope = `${scope} wrong`; },
    e => { e.subject.sha = '4'.repeat(40); e.review.sha = e.subject.sha; },
    e => { e.subject.tree = '5'.repeat(40); },
    e => { e.gateIds = []; },
    e => { e.executor = e.review.reviewer; },
    e => { e.result = 'SKIP'; e.reason = 'Synthetic skip'; },
  ];
  for (let i = 0; i < 8; i++) {
    const { manifest: m } = baseline(), g = m.activationGates[i];
    const e = proof(m.tasks[23]);
    e.checkIds = g.requiredChecks.map(c => c.id);
    e.gateIds = [g.id];
    Object.assign(g, { status: 'PASS', scope, reviewer: e.review.reviewer,
      verificationSubject: { sha, tree }, completionEvidence: [e.id] });
    assert.deepEqual(verifyManifest(m, [e]), []);
    for (const mutate of mutations) {
      const bad = structuredClone(e); mutate(bad);
      assert.match(errors(m, [bad]), /missing exact scoped reviewed PASS/, g.id);
    }
  }
});

test('task and gate self-review controls change only executor, preserving reviewer identity', () => {
  assertTaskIndependentReview(verifyManifest);
  assertGateIndependentReview(verifyManifest);
});

test('self-review controls kill gate-only, task-only and combined verifier mutants', async () => {
  const sourcePath = path.join(root, 'scripts/architecture/verify-plan.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const gateCondition = 'e.review.reviewer===g.reviewer && e.review.reviewer!==e.executor';
  const taskCondition = 'e.review.reviewer===t.reviewer && e.review.reviewer!==e.executor';
  assert.equal(source.split(gateCondition).length - 1, 1);
  assert.equal(source.split(taskCondition).length - 1, 1);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ar00-self-review-mutation-'));
  try {
    for (const mutation of [
      { name: 'gate-only', gate: true, task: false },
      { name: 'task-only', gate: false, task: true },
      { name: 'combined', gate: true, task: true },
    ]) {
      let candidate = source;
      if (mutation.gate) candidate = candidate.replace(gateCondition, 'e.review.reviewer===g.reviewer');
      if (mutation.task) candidate = candidate.replace(taskCondition, 'e.review.reviewer===t.reviewer');
      const file = path.join(temporary, `${mutation.name}.mjs`);
      fs.writeFileSync(file, candidate, 'utf8');
      const { verifyManifest: mutatedVerify } = await import(pathToFileURL(file).href);
      if (mutation.gate) assert.throws(() => assertGateIndependentReview(mutatedVerify),
        { code: 'ERR_ASSERTION', message: /gate completion must reject a matching reviewer who also executed the check/ },
        `${mutation.name}: gate mutation must be detected by the self-review assertion`);
      else assertGateIndependentReview(mutatedVerify);
      if (mutation.task) assert.throws(() => assertTaskIndependentReview(mutatedVerify),
        { code: 'ERR_ASSERTION', message: /task completion must reject a matching reviewer who also executed the check/ },
        `${mutation.name}: task mutation must be detected by the self-review assertion`);
      else assertTaskIndependentReview(mutatedVerify);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true });
  }
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source,
    'mutation probes never change the published verifier');
});

test('completion and READY controls isolate unfinished integration and non-PASS G gates', () => {
  assertIntegrationCompletion(verifyManifest);
  assertReadyRequiresGatePass(verifyManifest);
});

test('completion and READY controls kill integration-only, G-PASS-only and combined mutants', async () => {
  const sourcePath = path.join(root, 'scripts/architecture/verify-plan.mjs');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const integrationCondition = "for (const d of [...list(t.dependsOn),...list(t.integrationDependsOn)]) if (tasks.find(v=>v.id===d)?.status!=='complete')";
  const integrationMutation = "for (const d of [...list(t.dependsOn)]) if (tasks.find(v=>v.id===d)?.status!=='complete')";
  const gateCondition = " || t.activationGates.some(g=>gates.get(g)?.status!=='PASS')";
  assert.equal(source.split(integrationCondition).length - 1, 1);
  assert.equal(source.split(gateCondition).length - 1, 1);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ar00-completion-mutation-'));
  try {
    for (const mutation of [
      { name: 'integration-only', integration: true, gate: false },
      { name: 'G-PASS-only', integration: false, gate: true },
      { name: 'combined', integration: true, gate: true },
    ]) {
      let candidate = source;
      if (mutation.integration) candidate = candidate.replace(integrationCondition, integrationMutation);
      if (mutation.gate) candidate = candidate.replace(gateCondition, '');
      const file = path.join(temporary, `${mutation.name}.mjs`);
      fs.writeFileSync(file, candidate, 'utf8');
      const { verifyManifest: mutatedVerify } = await import(pathToFileURL(file).href);
      if (mutation.integration) assert.throws(() => assertIntegrationCompletion(mutatedVerify),
        { code: 'ERR_ASSERTION', message: /completion must reject an unfinished integration dependency/ },
        `${mutation.name}: integration mutation must fail the dedicated assertion`);
      else assertIntegrationCompletion(mutatedVerify);
      if (mutation.gate) assert.throws(() => assertReadyRequiresGatePass(mutatedVerify),
        { code: 'ERR_ASSERTION', message: /READY must reject a non-PASS gate even when all other activation conditions match/ },
        `${mutation.name}: G-PASS mutation must fail the dedicated assertion`);
      else assertReadyRequiresGatePass(mutatedVerify);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true });
  }
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), source,
    'mutation probes never change the published verifier');
});

test('all direct dependency edges prevent an early active successor', () => {
  const { manifest: original } = baseline();
  for (const task of original.tasks) for (const unfinished of task.dependsOn) {
    const m = structuredClone(original), ledger = [];
    m.tasks = m.tasks.filter(t => t.id === task.id || task.dependsOn.includes(t.id));
    for (const t of m.tasks) {
      t.integrationDependsOn = [];
      if (t.id === task.id) t.status = 'active';
      else {
        t.dependsOn = [];
        if (t.id === unfinished) t.status = 'planned';
        else ledger.push(finish(t));
      }
    }
    assert.match(errors(m, ledger), new RegExp(`${task.id} active before dependency completion`),
      `${task.id} must wait for ${unfinished}`);
  }
});

test('zero to three active workers reserve slots and a fourth active worker is rejected', () => {
  for (let active = 0; active <= 4; active++) {
    const { manifest: m } = baseline();
    m.tasks = m.tasks.slice(0, 7);
    m.tasks.forEach((t, i) => Object.assign(t, {
      status: i < active ? 'active' : 'planned', dependsOn: [], integrationDependsOn: [],
      writePaths: [`synthetic/non-overlapping/${i}`], exclusiveLocks: [],
    }));
    if (active === 4) assert.match(errors(m), /more than three active workers/);
    else {
      const p = schedule(m);
      assert.equal(p.ready.length, 3 - active);
      assert.equal(p.active.length, active);
      assert(p.blocked.every(t => t.reasons.includes('WORKER_LIMIT')));
    }
  }
});

test('all 276 task pairs obey the declared exclusive-lock boundary', () => {
  const { manifest: original } = baseline();
  for (let i = 0; i < 24; i++) for (let j = i + 1; j < 24; j++) {
    const m = structuredClone(original);
    m.tasks.forEach(t => Object.assign(t, { status: 'planned', dependsOn: [], integrationDependsOn: [] }));
    const a = m.tasks[i], b = m.tasks[j];
    a.status = b.status = 'active';
    const shared = a.exclusiveLocks.some(l => b.exclusiveLocks.includes(l));
    const result = errors(m);
    assert.equal(result.includes(`active lock conflict ${a.id}/${b.id}`), shared, `${a.id}/${b.id}`);
    if (!shared) assert.equal(result, '', `${a.id}/${b.id}`);
  }
});

test('the complete actual 24-task DAG can advance without deadlock using synthetic proofs only', () => {
  const { manifest: m } = baseline(), ledger = [finish(m.tasks[0])], batches = [];
  while (m.tasks.some(t => t.status !== 'complete')) {
    const p = schedule(m, ledger);
    assert(p.ready.length > 0, `deadlock after ${batches.length} batches`);
    assert(p.ready.length <= 3);
    const selected = p.ready.map(id => m.tasks.find(t => t.id === id));
    for (let i = 0; i < selected.length; i++) for (let j = i + 1; j < selected.length; j++) {
      assert(!selected[i].exclusiveLocks.some(l => selected[j].exclusiveLocks.includes(l)));
    }
    for (const t of selected) {
      assert(t.dependsOn.every(id => m.tasks.find(t => t.id === id).status === 'complete'));
      t.status = 'active';
    }
    assert.deepEqual(verifyManifest(m, ledger), []);
    batches.push(p.ready);
    selected.forEach(t => ledger.push(finish(t)));
    assert(batches.length < 24);
  }
  assert.equal(ledger.length, 24);
  assert.deepEqual(verifyManifest(m, ledger), []);
  assert(schedule(m, ledger).activation.every(t => t.status === 'BLOCKED'));
});

test('CLI plan is deterministic and leaves all four exact source inputs unchanged', () => {
  const before = Object.fromEntries(Object.keys(expected).map(file =>
    [file, blobHash(fs.readFileSync(path.join(root, file)))]));
  const runs = [0, 1].map(() => spawnSync(process.execPath, ['scripts/architecture/plan.mjs'],
    { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH } }));
  for (const run of runs) { assert.equal(run.status, 0, run.stderr); JSON.parse(run.stdout); }
  assert.equal(runs[0].stdout, runs[1].stdout);
  for (const [file, hash] of Object.entries(before)) {
    assert.equal(blobHash(fs.readFileSync(path.join(root, file))), hash, file);
  }
});
