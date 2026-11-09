# Independent R1 re-review

## Decision

**PASS for the bounded explicit source-site mapping slice. R1's mapping-boundary correction is resolved. No additional blocker was found in this fixed artifact.** This is not closure of the underlying request-controlled-data risk, complete effect enumeration, full AC01, or any runtime/production gate.

Reviewed source commit: `fde524b442986a574f5d9f9e6f0fb3035dfb8d91`.
Reviewed freeze: `7fc1ae6a50108988676fa03a38d54207f12eea7c`.
Partial freeze tree: `e868c0977354f986481f7cd9664c96b169d57c45`.
Packet SHA256: `464317449dd9bd1d28bdf3e313702aba820b4fc16385023b0e4649122c5c060e`.
Application baseline remains `5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e`, complete remote tree `3d18d4211946e8dc02d4780a20dfba2efe512343`.

## Why R1 is resolved

- `writes` is now `explicitWriteSites`; scope counts are explicitly syntactic15 direct sites and1 explicit nested site, not exhaustive runtime effects. Global runtime targets remain `NOT_CLOSED`.
- Expense update records the actual raw request-body -> Prisma data forwarding path, an `OPEN_GAP`, unknown nested relation targets, extra scalar/operation fields, and unchanged Prisma/HTTP/PG `NOT_RUN` status.
- Update's named unexecuted cases now include tenant.update targets/authorization, tenantId reassignment and amount-operation objects.
- Create is independently characterized as a raw-body spread with top-level tenantId overwritten from context. It does not presume Prisma accepts mixed nested-relation/scalar shapes or claim the update probes ran against create.
- Both map and README no longer characterize a single explicit Expense call as a bounded model/effect inventory. Business-effect labels explicitly disclaim closure.
- Fourteen added negative controls reject deleted/promoted gap and completeness claims. The new independent dataflow-guard-removal witness passes against the original rejection and detects the guard-removed mutant accepting false closure.
- Original reviewer mock evidence is referenced accurately. Its probe and receipt hashes match the originals. It is not relabeled as author execution, actual Prisma acceptance, successful HTTP, cross-tenant escape or persisted modification.

## Independent rerun

Executed from a reviewer-owned `git archive` copy of the freeze, with a separately initialized index for the repository context validator. No author files were modified.

- New checks:76/76, zero failures/skips (8 source contracts,59 verifier checks,9 mutation controls).
- Existing plan tests:78/78, zero failures/skips.
- Existing gate tests:17/17, zero failures/skips.
- HTTP source verifier:PASS with `EIGHT_ENDPOINT_EXPLICIT_SOURCE_SITES_ONLY`, runtimeAcceptance NOT_RUN.
- Original source verifier, context validator, syntax and whitespace checks:PASS.
- All33 seal entries:PASS.
- All34 archive packet files equal the fixed freeze byte-for-byte.
- All164 baseline/regression files equal the remote blob identities independently verified in the first review. Application source remains unchanged.
- All13 original `author/` evidence files are unchanged. Both old reviewer-reference hashes match.
- Author worktree remained clean at the stated freeze before and after review.

Runtime for this rerun:Node24.22.1, standard-library-only source suites. The earlier3 mocked update forwarding probes were not rerun or counted in76; their original evidence remains separate.

## Limits and integration condition

NOT RUN:Node22, application build/lint/full suites, application startup, real HTTP/auth/RBAC/tenant response behavior, Prisma payload acceptance, PostgreSQL persistence/rollback/concurrency, exhaustive nested targets, provider/device/store acceptance, hosted CI for an integrated head, and fullAC01. Existing policy/gate/activation restrictions remain unchanged.

This decision applies only to this freeze. It is not a review of remote print head `95f3b34e5d32bc9dbe18699f5b32b44ade247b62` or a future combined commit. The integrator must preserve the disjoint print work, recheck latest remote head and rerun affected/final checks before any separately authorized publication. No merge or deployment is authorized by this report.

Artifacts beside this report: `reviewer-receipt.json`, `provenance.json`, `http-tests.log`, `http-verifier.log`, `source-verifier.log`, `plan-tests.log`, `gate-tests.log`, `context.log`, `seal.log`, `syntax.log`, `whitespace.log`.
