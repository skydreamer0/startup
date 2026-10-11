# PC4070 checkout IPC acceptance: applied test-only fix

2026-10-11. A29 implemented and validated this checkpoint. Original PR authors
retain ownership; the parent task owns integration and merge decisions.
No PR was merged, no branch deleted, no Issue edited and no deployment initiated.
No PR109 job or local visibility diagnostic was retried.

## Applied subjects

Early [Draft PR117](https://github.com/skydreamer0/startup/pull/117) contains only
the two reviewed checkout test/helper files (52 insertions, 11 deletions):

- Head: `8123bd7f5ef3b2bf0d42fa94a611ed613b0b3f5e`.
- Tree: `9cbd9e837ca9fa6a2955b8667a9268d30c24c5ff`.
- Parent/master: `83a1b15cf156c7b0b409ee96b2fabab67b9c74e4`.
- Reviewed patch SHA256: `2cc8134d55f72973cb7f1a1181af925c80a9433c0e783f7e723d388a43c1e475`.

Draft117 deliberately starts from master and excludes PR109's proposed harness.
The same patch is cherry-picked into the isolated PR107-116 integration feature:
tested head `f6ae1dd94cb2ac1c824f2e4befe824e787df0e55`,
tree `aa5b4ecc2399aa84ed4069b384057a5e0eba48d7`.
All applied file bytes match the independently reviewed proposal and Draft
remote blobs. The final documentation checkpoint leaves that tested code intact.

After the existing command-completion update, the worker emits a commandId-bound
precommit IPC checkpoint and keeps the interactive transaction open. The parent
validates that checkpoint, kills its owned child handle with SIGKILL and waits
for close. SIGKILL remains mandatory. Null exit code, no result and a valid
checkpoint are additionally required. Protocol/timeout/termination failures
remain failures; missing close blocks fixture deletion. Original rollback,
no-sale, UNKNOWN and new-process replay assertions remain. No product code,
schema, permission, business assertion or skip policy changes.

## Native results

| Subject and environment | PASS | FAIL | Skipped | Cleanup |
| --- | ---: | ---: | ---: | --- |
| Draft8123bd7, fresh Windows PG16.3 / Node22.22.3 |21|0|0|28 business tables zero before/after; DB, postmaster, directory, TCP and adapter absent |
| Integration f6ae1dd, fresh Windows PG16.3 / Node22.22.3, canonical CI migrations/seeds |372|0|81|owned DB, postmaster, directory, TCP and adapter absent |
| Draft8123bd7, existing Linux exact-head sequence CI / Node22.23.3 |9 sequence +21 command +38 stock +5 mock|0|0|28 business tables zero before/after; owned DB and migration schema absent |
| Integration f6ae1dd on Linux |NOT RUN|NOT RUN|NOT RUN|WSL returned E_ACCESSDENIED; stopped without retry or access changes |

Both Draft platforms and the Windows integration pass the actual precommit
process-crash case, including rollback/no sale, UNKNOWN lookup and recovery in
a new process. The full Windows suite's seeded/audit rows remain until owned
DROP; it does **not** claim all tables zero. The 81 skipped tests remain skipped.
Windows cleanup used a held process handle and TCP-close proof. All databases
were fresh, isolated, synthetic and exclusively owned. No Production, Preview
or ambient database URL was read or used.

Linux artifacts from [run38119293085](https://github.com/skydreamer0/startup/actions/runs/38119293085)
identify the exact Draft head/tree, disposable loopback-bound service and empty
initial schema. All 19 supplied source hashes match frozen Git blobs. The
artifact hashes the checkout test but not the worker helper separately; its
exact checked-out commit/tree binds the helper. This coverage limit is retained.
The native sequence job is exact-head evidence; general Backend CI is a
separate PR workflow result, not a Linux run of the combined integration.

Changed-file ESLint and full backend TypeScript --noEmit also passed. The
independent reviewer approved the applied fix and bounded native evidence;
see the adjacent review report for its exact scope and evidence limits.

## Preserved failures and open gates

The original `9ce542d03737bbca835c41606079b29138cf1759` full run remains
**371 PASS /1 FAIL /81 skipped**. That case stopped at the old SIGKILL signal
assertion before its rollback/UNKNOWN/replay assertions. This new passing run
does not retroactively relabel the old run. Earlier 273/66/114 unconfigured-DB
failure and failed proposal type checks also remain in historical evidence.

Draft117's main workflow is **FAIL**: 8/9 jobs pass, including Backend CI and
exact-head sequence acceptance; the shared Exact SKU job fails at real POS
category acceptance and skips its later confirmed-stock browser step.
Separate abort/retry, dependency/security and CodeQL checks pass;
branch-scoped final-alpine is SKIPPED, not PASS. This test fix does not resolve
the category/stock gate or authorize bypassing required checks.

PR109's visibility/lifecycle gate remains unpassed and held separately. PR116's
native midnight/resume/device acceptance remains NOT RUN. Unread Devin reviews
are not treated as clean. Wider financial/operational gates from the earlier
report remain outside this bounded test fix. No release is granted here.

Conditional parent order: consider independent test-only PR117 first, then
107 ->108 ->110 ->112 ->111 ->113 ->114 ->115 ->116, with109 held separately.
After squash merges, retarget children, read new exact heads and full deltas,
and validate the resulting integration. Keep107 until108 is safe,108 until110,
111 until113, and114 until both115 and116. Before any released deletion, verify
no child dependency or unsaved work and retain PR head/merge SHA and bundle proof.

## Evidence and preservation

The adjacent acceptance.json contains sanitized native cases/counts, source
identities, CI job results and cleanup receipts. draft-checkpoint.json binds
the latest Draft checks and full two-file remote readback. evidence-integrity.json
contains SHA256 identities of retained raw local evidence; raw logs and command
environment records are not published.

A preliminary tool-log extraction included the repository's fixed synthetic
CI test-secret lines. The extractor was corrected before evidence publication;
published receipts exclude them. No Production/Preview or ambient credentials
were read. Raw CI logs stay local and are represented only by hashes.

Historical reports at ../README.md and ../followup/README.md retain their original
subjects and pending statuses. This applied acceptance report supersedes their
unapplied-patch/native-pending status for PR117 only. Original PC4070 checkout
`a8de423346cbff2b015832dccbf47ac6808335de` and HPK are preserved. Master remains
`83a1b15cf156c7b0b409ee96b2fabab67b9c74e4` at final readback. Await the parent gate decision.
