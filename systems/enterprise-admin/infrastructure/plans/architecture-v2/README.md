# Architecture v2 execution baseline (AR-00)

Refs [#180](https://github.com/skydreamer0/startup/issues/180), under the sole
[#37 roadmap](https://github.com/skydreamer0/startup/issues/37#issuecomment-6700557196).
Snapshot `2026-11-07.1`. This is a versioned source/requirements baseline and
read-only scheduling tool, not a second roadmap or operational activation.

## Frozen inputs and ownership

- Master: `d703e416952b0e02a8241a86057d248a5c7b4662`, tree `15cf360798d2523ae155dad9c52504b783092c29`.
- Selected integration: [Draft #204](https://github.com/skydreamer0/startup/pull/204), `67e4c43b52eab02f29c3050c2225ae1b91f558e6`, tree `cc5230b00434655a286e2e5b87e0db3187383580`.
- Security stack remains #169 → #173 → #174 → #175. #175 is `aa6aae0154834d106f25c636af4c78b222e7a7dc`, tree `5641f780a238f0eba8a2b2e19464446e8641880e`.
- #178 `182ef155fc8baa350816e1f56a1be5a8fb82e57e` and #179 `43b81a4d5e805ba0c2edaa5411a681b8132252a1` are already represented by #204. Do not replay either implementation.
- Reviewed local integration `daa36a01726bf07756d8fe26dcc0dbcc7f2fab9b` has the same tree as remote #204; a matching tree does not transfer CI identity.
- No existing source PR, author, branch target or issue checkbox is changed. The complete 11-open-PR snapshot and source hashes are in [manifest.json](manifest.json) and [source-snapshot.json](source-snapshot.json). Live readback is required before any later dispatch.

## Use from the repository root

    node scripts/architecture/verify-plan.mjs --check-source
    node --test scripts/architecture/plan.test.mjs
    node scripts/architecture/plan.mjs
    ./scripts/validate-agent-context.sh
    git diff --check

No install, DB URL, `.env`, network, model, cloud task or application start is
needed. The tools only read files and print JSON. `plan.mjs` supports `--manifest`
and `--evidence` for reviewed fixture/state files; it cannot launch a task.
An alternate `--manifest` cannot be combined with `--check-source`: source checks
are only reported when the repository baseline was actually loaded and checked.
The default evidence ledger is empty, so AR-00 stays active and AR-01 is blocked
until its acceptance and independent review are recorded. This PR does not
manufacture completion evidence to make later tasks look ready.

## Records and meaning

- [manifest.json](manifest.json): 24 tasks, engineering dependencies, separate integration dependencies, four substeps, source/new/edit scopes, exclusive locks, acceptance checks, decisions and activation gates.
- [decisions.md](decisions.md): confirmed invariants, actual behavior, defects and undecided policies kept separate.
- [requirements-map.md](requirements-map.md) and [requirements.json](requirements.json): 235 source checklist occurrences, immutable text hashes, accountable AR owners and required acceptance check IDs. Checked source boxes remain historical metadata, never fresh PASS.
- [requirements-sources.json](requirements-sources.json) preserves the original 13 issue bodies as untrusted evidence data. Their body hashes must match the pinned source-snapshot digest; the verifier reconstructs every checklist occurrence and compares exact text, checkbox, line, section, ID and hash.
- [source-inventory.md](source-inventory.md) and [source-inventory.json](source-inventory.json): 122 mounted HTTP endpoints, 33 schema models, reviewed effects/owners, 137 source fingerprints, 96 lexical write/raw candidates and non-HTTP entries. The lexical index is bounded source evidence, not a security/data-flow proof.
- [evidence-schema.json](evidence-schema.json), [evidence.json](evidence.json): versioned result format and new AR acceptance ledger. Existing business evidence remains at its original commit/PR/harness, not copied into a fresh green result.

Implementation, exact-source verification and activation are separate. All new
AR work starts NOT_RUN. A policy blocks only its dependent activation, not a
ready isolated contract/test. TEST_ONLY policy profiles cannot silently become
operating defaults. G0–G7, hardware and real-store acceptance remain open.

## Dispatch and refresh contract

At most three workers. `schema-migrations`, `package-locks` and `composition`
have one integration owner. Broad future issue edit scopes are deliberately
conservative; refine the actual vertical slice and locks before dispatch rather
than removing a conflicting lock. Reading another module is not a write lock.
The scheduler reserves locks for both active and suggested tasks and cannot
suggest more than the free slots. It orders integration ancestors first and will
not acquire a lock that an unfinished transitive integration prerequisite needs.
For example AR-09 cannot hold schema locks while waiting on AR-14→AR-13. A
non-overlapping contract slice can still start early after its scope is narrowed.
It does not assign people or authorize edits.

A task can be marked complete only with independent reviewed PASS records for
all required checks, full SHA/tree, command/exit, environment, artifact hashes
and limitations, all on one frozen task `verificationSubject` SHA/tree. Evidence
from different heads cannot be assembled into one completion. Format validation cannot prove an artifact is truthful or that
a reviewer actually reviewed it: the human/parent must inspect it. SKIP, FAIL,
BLOCKED and NOT_RUN are not PASS. Completion also checks integration dependencies.
Activation needs the task complete, applicable decision approvals and G gates.
Each PASS gate needs independently reviewed evidence for its exact required checks,
one source SHA/tree and a declared activation scope. A READY task must match that
activation subject/scope; a bare G status toggle is rejected. This still cannot
authenticate the supplied evidence or grant authority. For all activation states,
this is a planning state only, never permission to operate or publish.

For a new source baseline, read live master/PRs and preserve the previous source
IDs/evidence, bump snapshotVersion, reconcile requirements, regenerate the exact
route/model/hash index and review the diff. `--check-source` intentionally fails
if the frozen runtime changes or an endpoint/model/source fingerprint is omitted.
Do not edit hashes merely to conceal an unexplained difference. Changes to files
outside the indexed runtime need their own slice-specific verification.

The current code keeps backend npm and frontend/shared pnpm installation
boundaries. No package, lock, Prisma schema/migration, CI workflow, core assembly,
production data, external service, print transport or deployment is changed here.
