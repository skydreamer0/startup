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
    node scripts/architecture/verify-seed-migrations.mjs
    node --test scripts/architecture/seed-migrations.test.mjs
    node --test scripts/architecture/plan.test.mjs
    node --test systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-closeout-20261108/gate-acceptance.test.mjs
    node scripts/architecture/plan.mjs
    ./scripts/validate-agent-context.sh
    git diff --check

No install, DB URL, `.env`, network, model, cloud task or application start is
needed. The tools only read files and print JSON. `plan.mjs` supports `--manifest`
and `--evidence` for reviewed fixture/state files; it cannot launch a task.
An alternate `--manifest` cannot be combined with `--check-source`: source checks
are only reported when the repository baseline was actually loaded and checked.
The default evidence ledger records only the executed tooling/context checks;
AR-00 stays active and AR-01 is blocked
until its full acceptance and independent review are recorded. This PR does not
manufacture completion evidence to make later tasks look ready.

## 非 HTTP 入口清冊的有界檢查

`source-inventory.json` 以 `kind` 區分套件 script、獨立 Prisma seed hook、
Docker 啟動指令及人工整理的 Python 入口。`--check-source` 重新讀取 backend
`package.json` 與 `Dockerfile`，精確比對 13 個 scripts、1 個 `prisma.seed`
hook，以及目前最終 stage 的 1 個 CMD（保留完整 JSON argv，不以描述替代）。
新增、刪除或改寫來源宣告都必須對應到清冊；每筆入口必須有 owner、effect、
有效 AR destination 及唯一來源指紋，另保留既有 `prisma/seed.ts` 實作指紋。

Docker 解析僅支援已審閱的單行 exec-form 宣告；續行、heredoc、escape directive、
重複啟動指令、stage 繼承或動態 base 等未支援格式會拒絕通過，要求另行審閱。
這不是 Docker builder 或 shell parser，不解析外部 base image 的繼承行為。
Python `curated` 入口仍需人工核對是否完整；此檢查不遍歷命令引用的所有程式，
也不證明完整 writer/data-flow、部署啟用狀態或真實 DB、HTTP、設備行為。
所有命令都是待比對文字，未執行 seed、reset、migration、容器或設備操作。

[本次收尾收據](../../verification/architecture-v2/ar00-closeout-20261108/README.md)
分開記錄候選來源恢復、重新執行測試與獨立審查，不沿用遺失的歷史 log。本切片不把 AR-00 AC01 或任何其他
完整驗收改成 PASS；AR-00、D01–D09、G0–G7 與營運啟用狀態維持原值。

## Seed and startup migration supplement (2026-11-09)

The [mechanical inventory](seed-migration-inventory.json) and
[curated effects map](seed-migration-effects.json) extend the frozen inventory
without rewriting it. They bind the two seed declarations and Docker startup
chain to 25 literal Prisma call sites (22 writes, two reads and disconnect),
the nested OrderItem create, all 16 packaged SQL migrations, schema and migration
lock. The map records model/domain owners, AR check destinations, SQL backfill,
trigger and foreign-key/cascade effects, and 14 inspected test/harness sources.
Domain ownership is not a new worker assignment or a completed AR check.

`verify-seed-migrations.mjs` reads repository files using Node built-ins only.
It enumerates the migration directory and checks source fingerprints, seed call
slices/token body, literal entry chains, source citations and mapping metadata.
It never imports the seed/application, evaluates commands, loads `.env`, installs
packages or contacts a database. Tests mutate isolated temporary source copies.
Run the two commands above separately; this supplement is not automatically
included in `verify-plan.mjs` or newly wired into hosted CI.

The seed lexer supports this reviewed literal syntax, not general TypeScript.
Unsupported client aliases, computed/optional access, additional clients, raw or
transaction calls and complex template expressions require review. SQL effects
are curated, not parsed into a semantic proof. Updating SQL, seed token/call or
semantic-map pins requires review of the changed behavior; coordinated pin edits
cannot prove equivalence. Exact bytes and supported syntax are intentionally
conservative, so harmless formatting can require a reviewed refresh.

Current seed behavior directly resets product/batch quantities and releases
batches, then creates orders/items and OUT movements outside the common posting
transaction. Some reads/selectors are not tenant-scoped. These are recorded
source behavior and acceptance gaps, not endorsed rules or executed incidents.
Docker still runs `prisma migrate deploy` before the server; the health-image
harness overrides its entrypoint and does not prove migration-free restart or
migration/runtime role separation. Existing test assertions are inspected
associations, never new native PASS evidence.

[The bounded receipt](../../verification/architecture-v2/ar00-seed-migrations-20261109/README.md)
separates tooling checks from seed, migration, application, PostgreSQL, HTTP,
hardware and store checks, which remain NOT_RUN. Full AR-00 AC01 is still not
established. Canonical manifest/evidence, original issue checkboxes, decisions,
activation gates and AR-01's dependency are unchanged.

## Records and meaning

- [manifest.json](manifest.json): 24 tasks, engineering dependencies, separate integration dependencies, four substeps, source/new/edit scopes, exclusive locks, acceptance checks, decisions and activation gates.
- [decisions.md](decisions.md): confirmed invariants, actual behavior, defects and undecided policies kept separate.
- [requirements-map.md](requirements-map.md) and [requirements.json](requirements.json): 235 source checklist occurrences, immutable text hashes, accountable AR owners and required acceptance check IDs. Checked source boxes remain historical metadata, never fresh PASS.
- [requirements-sources.json](requirements-sources.json) preserves the original 13 issue bodies as untrusted evidence data. Their body hashes must match the pinned source-snapshot digest; the verifier reconstructs every checklist occurrence and compares exact text, checkbox, line, section, ID and hash.
- [source-inventory.md](source-inventory.md) and [source-inventory.json](source-inventory.json): 122 mounted HTTP endpoints, 33 schema models, reviewed effects/owners, 137 source fingerprints, 96 lexical write/raw candidates and non-HTTP entries. The lexical index is bounded source evidence, not a security/data-flow proof.
- [evidence-schema.json](evidence-schema.json), [evidence.json](evidence.json): versioned result format and new AR acceptance ledger. Existing business evidence remains at its original commit/PR/harness, not copied into a fresh green result. The [bounded AR-00 receipt](../../verification/architecture-v2/ar00-baseline-20261107/README.md) preserves executed logs, hashes and initial failed review controls.

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
