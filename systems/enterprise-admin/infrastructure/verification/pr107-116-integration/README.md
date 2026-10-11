# PC4070 acceptance checkpoint: PRs 107–116

2026-10-11. Executor and integration verifier: A29 local Codex task on PC4070.
The original authors remain responsible for their PRs; the parent task owns the
final integration decision. No PR was merged, marked ready, or deleted. No
deployment was started. Await the parent task's release instruction.

## Frozen subjects and preservation

- Remote master: `83a1b15cf156c7b0b409ee96b2fabab67b9c74e4`, unchanged.
- Original PC4070 checkout: `a8de423346cbff2b015832dccbf47ac6808335de`, clean before
  and after. No checkout, reset, stash, or source edit there. HPK was not touched.
- Independent worktree: `C:\Users\User\Documents\Codex\2026-10-11\task-4\startup-acceptance`.
- Saved remote feature: `feat/pr107-115-acceptance-20261011` (also includes #116).
- Tested final code head: `af485491b592740e0ea77836961127a51063b09b`.
- Tested final code tree: `2428b472ed11cc5a2e928fc6a1dfc05218eba65a`.
- All ten PRs combine without conflicts: 57 changed files, 2871 insertions,
  109 deletions relative to master. This is an acceptance checkpoint, not a
  replacement aggregate PR for bypassing the individual merge gates.
- GitHub commit API tree identities and fetched PR heads match. All changed
  files were read completely, their canonical Git blob IDs and SHA256 verified,
  and their full bytes saved under `evidence/remote-readback/`.
- `evidence/pr-heads.bundle` was verified. It retains all ten PR heads and the
  integration feature; its prerequisite is the master commit above. Retain it
  and the full head manifest before any eventual branch deletion.

## Latest individual heads and local acceptance

| PR | Latest head | Exact-head local result | Integrated result / limits |
| --- | --- | --- | --- |
| 107 | `1b93f45ef5ee5f15974862a4fe61261d50dad6e1` | batch trace 30/30 PASS | nullable and numbered orders render in actual built Admin Chrome at 1366/1024/390; synthetic HTTP, not DB-backed browser |
| 108 | `7500af3ac984f3886db54bdb175f9eeab2ec67ae` | Windows-applicable trace/PNG/collection controls PASS; Linux controls not rerun | combined null trace browser PASS; original full 24-case Linux matrix NOT RUN locally |
| 109 | `a8a248dc5b46dd24487a9b742a6c50606c3c3063` | native seven-case acceptance NOT PASSED | local Linux-control invocation 40 PASS /14 FAIL on Windows; separate native visibility diagnostic FAILED after three attempts; stopped |
| 110 | `c977501714b73802c8b85e0cf51011378fe0d3d4` | real HTTP + new owned PG16 8/8 PASS | same 8/8 PASS: receipt, general null-number order, POS order, 132 total/100 returned, tenant/RBAC and complete read-only snapshots |
| 111 | `cb39ce50d56ede45a42e8369dff5f0c2f257fe64` | pure/mocked 20/20; native HTTP/PG16 11/11 PASS | combined with #113: 33 focused and 12 native PASS; refund-policy limitation remains |
| 112 | `d856456b901f9adea602b5ba3a6a109aa3e42279` | navigation/pagination/layout/suppliers 82/82 PASS | Admin affected 112/112; full 177/177; three-width built browser navigation/focus/Forward/reload/403/retry PASS with synthetic HTTP |
| 113 | `dfdf2654705e69e9c6d46dd691381c53f6dcf27b` | focused 33/33; native HTTP/PG16 12/12 PASS | persisted separate 0.1/0.2 orders return numeric daily totalSales, shift grossSales and CASH 0.3; complete reader snapshots unchanged |
| 114 | `2881f6399101a583c1eb41300064f5631eba2a93` | today-orders 9/9 PASS | combined #115's 11 native cases PASS; #116 supplies day-key UI behavior |
| 115 | `013d3713e1611db9e533fddff3ca32f60e138da1` | unchanged native order-sequence suite 11/11 PASS | same 11/11 PASS, including stored Taipei boundary rows and tenant/optional-shift isolation; final 28 business tables zero |
| 116 | `947e5a5d5b07562c2dd6baa72519d443e2ba740c` | midnight/inventory 49/49; strict TypeScript PASS | 49/49 and actual tsc+Vite build PASS on final combined head; browser/device/native resume acceptance NOT RUN |

#116 was fetched from its author and never reimplemented. Its first head
`be06d13a67012e7a0a9c6989587a2ca53db953ec` passed 49 focused tests in each of UTC,
Asia/Taipei and America/Los_Angeles, and 392 full POS tests, but FAILED TS2741
because a frozen test payload lacked required shiftId. The author alone added
`shiftId: 'shift-a'` in `947e5a5`. That exact head and final combined head each
passed the new 49-case focused run and strict types. The old three-TZ/full results
are preserved under their old subjects, not relabeled as new-head full runs.

## Integrated package and native evidence

- Node 22.22.3; PostgreSQL 16.3; Prisma 6.19.3; frozen frontend pnpm 10.34.6.
  Backend npm ci used local npm 10.9.8, not the policy's 11.21.0. Exact-head GitHub
  CI uses its canonical toolchain; these local results do not claim a canonical
  npm-version reproduction or PostgreSQL15/Alpine compatibility.
- Backend affected pure/mocked: 42/42; general/split ownership guards 28/28;
  backend build and full ESLint PASS. Admin affected 112/112, full 177/177,
  build and full ESLint PASS. POS full 392/392 on the pre-fixture-fix combined
  head; final focused 49/49 and tsc+Vite build PASS.
- Full backend initial unconfigured-DB attempt: 273 PASS /66 FAIL /114 skipped.
  Retained as FAIL. A second, fresh owned cluster followed CI migrate/seed:
  **371 PASS /1 FAIL /81 skipped**. The failure is the existing real-crash case at
  checkout-command.integration.test.ts:221: it expects exit signal SIGKILL;
  Windows reports null. This is a Windows assertion incompatibility, not a
  claimed native recovery pass. Exact-head Linux Backend CI PASS is separate.
- Fresh exact and combined native clusters all prove nonce, loopback binding,
  actual data directory, system identifier, previously absent DB and initially
  empty schema. No Production/Preview/ambient DB URL is read or used.
- Windows adapter is task-local. It adds .exe paths, scrubbed mandatory Windows
  environment, canonical equivalence for PG's slash spelling, a held process
  handle and TCP-close proof. The copied TS harness changes only path spelling
  normalization before its unchanged exact identity comparison. No tracked
  source, product handler, schema, permissions, or safety assertion was changed.
- For every native run, owned DB absent, exact postmaster stopped, TCP closed,
  owned directory absent, temporary adapter removed are all TRUE. Append-only
  records stay intact until DROP. Seeded full-suite rows also remain until DROP.
- First split preparation failed because Windows pg_ctl inherited captured
  pipe handles; no application DB had been created. It was recovered only after
  nonce/data-directory verification. The known postmaster and TCP port were
  confirmed absent before deleting its in-workspace owned directory. Failure
  and recovery receipt remain. The corrected second preparation passed.
- Final Admin browser: sandbox intact, Chrome155.0.8059.40, three widths, zero
  writes/unexpected requests/page errors, context/browser/server closed and
  managed profile removed. Actual PNGs were inspected for readable Chinese and
  bounded navigation/trace layout. Narrow batch columns use documented table
  horizontal scrolling. Headless/synthetic HTTP results do not prove native
  visibility, native zoom/touch, full responsive layout, real login, Safari,
  iPad, hardware, or browser-to-PostgreSQL acceptance.
- Git Bash ran the original context validator successfully; git diff --check
  PASS. The earlier two WSL invocations FAILED because Windows linked gitdir
  pointers were unreadable there; these failures remain in the record.

## Existing CI, reviews, and blocking gates

All ten latest PR heads have the four core checks PASS, including corrected
#116. Applicable Dependency Review/GitGuardian checks read as PASS. Overall
pipeline is **FAIL** for every PR because Exact SKU/PostgreSQL/current POS browser
job is not passing. In #109's latest existing job 114391132803, raw log shows
5 SKU +9 category +20 provenance tests passed, then the runner received a
shutdown signal. Interrupted lifecycle/empty cases are not passes. Other heads
retain the older category hidden-state timeouts; their stock-browser follow-up
was skipped. No failed check or skipped native boundary is upgraded to PASS.

#116 run [38117083681](https://github.com/skydreamer0/startup/actions/runs/38117083681)
is terminal 8/9 jobs PASS, with that category browser job FAIL. The four core
checks are PASS. Separate abort run38117083683 and security checks PASS. These
are #116 branch results, not CI for the aggregate feature or proof that the local
backend full run passed.

#109's existing cloud job was never rerun. The authorized Windows blank-page
diagnostic used three fresh profiles, no sandbox changes, and no API/DB:
first/third initial visibility stayed hidden; the second failed during CDP
window setup. It never reached a passing 61-second hidden/visible interval.
All owned Chrome processes/profile directories were cleaned without force.
Stop this diagnostic at its three-attempt budget. Installed WSL lacks the
required Linux runtimes; Docker Engine is unavailable. The original runner
also requires Linux, fixed Chrome154, process ownership and Actions service
proof. Do not spoof these conditions or change security settings to claim PASS.

GitHub review submissions were empty when read. Previously recorded author/
independent reviews remain bounded to their stated SHA/tree. Devin pages were
not freshly read: browser UI runtime failed to initialize. Personal Context was
also unavailable; applicable local memory was read. No unread review is called
clean. The parent retains final independent integration analysis.

Financial refund/net/cash policy, Number-boundary range/overflow and broader
#30/#31/G0–G7 operational acceptance remain outside these bounded fixes. Native
cross-order acceptance for #113 is now supplied; it does not certify whole
financial reporting. No business issue is marked complete.

## Conditional merge and cleanup order

Recommend first resolve/accept #109's real category-native gate with the parent;
current evidence does not justify its merge. No further retry of its exhausted
job or local diagnostic is proposed. Once the parent releases verified subjects:

1. #109 (only after its blocker is resolved).
2. #107 → #108 → #110.
3. #112 (independent; can move within the released order).
4. #111 → #113.
5. #114 → #115 → #116. #115 and #116 are siblings, both based on #114.

Follow repository squash policy. After each parent merge, retarget its children
to the actual updated master, inspect the resulting complete changed-file set,
recheck head/source identity and integrated behavior, and require applicable
checks for that new merge subject. Do not assume an unchanged feature SHA means
an unchanged integration. Do not force-push another author's branch.

Keep #107 branch until #108 has safely moved/merged, #108 until #110, #111 until
#113, and #114 until BOTH #115 and #116. Immediately before deletion, re-read
all open child PR bases, active worktrees and refs; verify no uncommitted or
unpushed work, preserve head/merge SHA and bundle proof, and delete only the
explicit released branches. The user's existing production deployment triggered
by an accepted merge is authorized; no manual deployment or production DB work
is included. Parent release is still pending.

Local evidence root: `C:\Users\User\Documents\Codex\2026-10-11\task-4\evidence`.
Key manifests: remote-readback/manifest.json, exact-snapshots/results.json,
package-checks/results.json, each native source-hashes/cases/cleanup file,
admin-browser-3/receipt.json and PNGs, and pr-heads.bundle.

Remote report directory also includes PR head/file manifests, exact-head exits,
native cases and cleanup receipts, browser receipt, the backend failure summary,
and SHA256 hashes for all retained local evidence files. Raw synthetic snapshots
and logs remain on PC4070; they are not uploaded with this report.

Follow-up diagnosis: [Windows signal reporting and PR109 minimum dependencies](followup/README.md).
Its separately reviewed two-file source patch is unapplied. Its recommended order
keeps PR109 held separately; failed CI and all remaining gates remain unchanged.
