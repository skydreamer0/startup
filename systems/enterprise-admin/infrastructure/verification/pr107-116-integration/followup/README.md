# PC4070 follow-up: Windows crash assertion and PR109 dependencies

2026-10-11. A29 owns this diagnosis; the parent owns the final merge decision.
No source patch has been applied, no native checkout test rerun, no PR merged,
no branch deleted, no Issue written, and no PR109 browser/job rerun.

## Windows failure: reporting defect confirmed, recovery still unverified

The existing full backend run at `9ce542d03737bbca835c41606079b29138cf1759`
remains **371 PASS / 1 FAIL / 81 skipped**. Its one failure is the assertion at
`backend/src/__tests__/checkout-command.integration.test.ts:221` expecting
`signal === 'SIGKILL'`. The assertion executes before `noSale`, UNKNOWN lookup,
and new-process replay, so those assertions did not run in that case.

The old worker terminates itself with `process.kill(process.pid, 'SIGKILL')`
after the transaction's command-completion update. The helper does not retain
a checkpoint or stderr from that failed crash-mode outcome. Consequently, the
old report alone cannot exclude an earlier ordinary error or prove the intended
crash point was reached. Database/process cleanup is verified separately and
does not turn the case into a recovery pass.

A new **DB-free** Node22.22.3 / libuv1.51.0 Windows probe, using only its own
fresh subprocesses and scrubbed environment, distinguishes the reporting paths:

| Trigger | code | signal | Other proof |
| --- | --- | --- | --- |
| Worker self-SIGKILL | 1 | null | reached AT_KILL; no exit handler or code after kill |
| Ordinary `process.exit(1)` | 1 | null | exit handler ran |
| Parent child-handle SIGKILL after IPC barrier | null | SIGKILL | parent received barrier; kill returned true |

All three owned children closed without timeout or forced recovery. No API,
database, browser, permissions, credentials, or production data were involved.
The probe establishes a Windows signal-reporting defect in the test design;
it does not establish checkout transaction rollback or successful replay.

The platform explanation is also supported by
[Node22 child-process documentation](https://raw.githubusercontent.com/nodejs/node/v22.22.3/doc/api/child_process.md)
and [libuv1.51.0 Windows implementation](https://raw.githubusercontent.com/libuv/libuv/v1.51.0/src/win/process.c).
The Windows process exit callback reports the handle's recorded exit signal;
`uv_process_kill` records that signal on the parent's child handle, whereas
PID-based `uv_kill` cannot update the parent's handle. Windows forced termination
uses exit code1. Therefore accepting code1/null alone would also accept ordinary
errors and is not a suitable fix.

Frozen Git blob comparison proves both original checkout test/worker files are
unchanged from master `83a1b15cf156c7b0b409ee96b2fabab67b9c74e4` at every head
of PR107-116. This defect was not introduced by any of those ten PRs.

## Minimal proposed fix and independent review

The **unapplied** `checkout-sigkill-ipc.patch.json` changes two test files only:

1. The worker requires one command-completion update, emits a commandId-bound
   IPC precommit checkpoint, and keeps the same interactive transaction open.
2. The parent validates that checkpoint on its exact owned child channel,
   terminates its child handle with SIGKILL, and waits for `close`.
3. Existing rollback, UNKNOWN, and fresh-process replay assertions remain.
   SIGKILL is still required on every platform; null exit code, no result,
   and a valid checkpoint are additionally required. No skip or success branch
   for Windows is added.
4. Timeout/protocol/termination errors remain failures. Missing close is a
   failed cleanup condition; active child handles block fixture deletion.

Independent reviewer `/root/signal_review` initially requested a P2 revision:
the first draft rejected before child close and could race fixture cleanup.
That issue is fixed by deferred failure settlement and an active-worker guard.
An in-memory TypeScript check then caught five proposal errors (Error options
unsupported by this ES2020 config and nullable IPC-spawn stream types).
Those were corrected without changing runtime/business assertions.

**Final independent static review: APPROVE**, bound to patch SHA256:
`2cc8134d55f72973cb7f1a1181af925c80a9433c0e783f7e723d388a43c1e475`.
TypeScript5.9.3 compiled the full backend plus the two virtual proposed test
files with **0 baseline / 0 proposal diagnostics**, no emit/source edits.
The earlier failed compile (0 baseline /5 proposal errors) remains recorded.
Canonical-index `git apply --check --cached` also passed; no patch was applied.

This is static approval of a reviewable proposal, **not native acceptance**.
Fresh owned PostgreSQL crash/rollback/UNKNOWN/replay evidence on Windows and
canonical Linux is still required before a new test-fix PR is accepted.
The parent should choose that separate test-only follow-up; it need not rewrite
the existing PR authors' branches or enter the aggregate acceptance checkpoint.

## PR109's minimum dependency scope

Frozen PR109 head: `a8a248dc5b46dd24487a9b742a6c50606c3c3063`.
Git ancestry and complete changed-file identities show:

- **Zero other PRs contain PR109 as an ancestor.**
- **Zero other PRs change any PR109 file.** PR109 modifies category acceptance
  harnesses and documentation; it does not change product handlers/API/schema.
- PR109 leaves `.github/workflows/ci.yml` unchanged. The CI jobs have no
  cross-job `needs` edges, so category failure does not prevent independent
  context/backend/admin/POS, sequence, pagination, audit, or dialog jobs running.
- Within the shared Exact SKU job, category browser acceptance precedes native
  confirmed-stock acceptance. Category failure skips that later stock step.
  The whole job remains FAIL and stock-native acceptance remains **NOT RUN**.
- `stock-native/run.mjs` imports category `createRunScope`, `cleanupRunProcesses`,
  `runOwnedPhase`, and `publishEvidence`. The latter two exports are byte-identical
  before/after PR109. The process-scope extension adds optional caseNonce;
  stock retains the existing one-argument path. This is a shared harness review
  surface, not a new Git prerequisite, and does not prove native stock behavior.
- PR116's midnight/resume behavior needs its own browser/device acceptance.
  PR109 category visibility evidence, even if later obtained, would not substitute
  for that separate subject. PR116 does not depend on PR109's harness in product code.

Thus **hold PR109 itself and its unpassed category/stock claims**, rather than
making PR109 a source prerequisite for the remaining groups. Every PR still has
the failed shared job in its actual CI record. This diagnosis grants no CI waiver,
branch-protection bypass, production gate approval, or permission to merge.

## Independent groups and proposed order for the parent's decision

| Group | Source dependency | Bounded acceptance already recorded |
| --- | --- | --- |
| 107 ->108 ->110 | stacked chain |10730/30;108 Windows-applicable controls only;1108/8 native HTTP/PG |
| 112 | independent |82/82 focused; built Admin browser at three widths with synthetic HTTP |
| 111 ->113 | stacked chain |11120 focused/11 native;11333 focused/12 native, including separate stored0.1/0.2 orders |
| 114 ->115 and116 |115/116 are siblings |1149/9;11511/11 native;latest11649/49 and strict types;midnight native resume/device NOT RUN |
| 109 | independent, held | real visibility/lifecycle gate unpassed; no further retry proposed |

Recommended conditional order: **107 ->108 ->110 ->112 ->111 ->113 ->114 ->115 ->116**,
with **109 held separately**. This supersedes only the prior report's suggestion
to resolve PR109 before starting every other group. Parent review of exact checks,
unread reviews, evidence limits and remaining gates is required before any merge.
Current latest PR116 head remains `947e5a5d5b07562c2dd6baa72519d443e2ba740c`.

After a parent squash merge, retarget/reinspect its children against actual master
and revalidate the resulting integration subject. Keep107 until108 is safe,
108 until110,111 until113, and114 until BOTH115 and116. Branch cleanup and deployment
remain in the original released scope; no such action has occurred here.

## Deliverables

Alongside this report: signal-diagnostic.json, dependency-diagnostic.json,
checkout-sigkill-ipc.patch.json, signal-proposal-types.json,
signal-proposal-types-1-failed.json, and independent-signal-review.md.
The previous acceptance report and exact-head evidence retain their original
SHA/counts/failures/skips. The patch is separately hash-bound and unapplied.

The remote patch uses a lossless UTF-8 JSON envelope: decode its patch field and
verify the supplied SHA256 before applying. The initial raw-patch packaging failed
documentation whitespace checks on unified-diff blank context lines; this packaging
change preserves the independently reviewed patch bytes exactly.
