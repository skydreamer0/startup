# ProductBatchChange integration handoff

## Source and dependency

Integration branch: `feat/product-batch-change-integration`, stacked on PR #79
`412474fd56ea497b76429d92f45ed3699f9dcf40` / tree
`a79d23ff07f7b630f6fdcb5374bf19f47e13c1cd`. PR #79 is stacked on PR #76
`dbb8d9199b723d83831b3b1ba90f4c32042f2e09`. PR #77
`a1b7794778b3b66e8608786b2598b69b35353197` is numbering-only. At initial remote
inspection, master was `9ec05fbb62688d02dc96df2099e39745762a02be`; all fetched
remote branch schemas lacked ProductBatchChange. This is the unique shared-model
delivery. Other SKU stacks and the original PR #79 author's branch are untouched.

## Deliverables and contract

Read ADR-021, `backend/prisma/schema.prisma`, additive migration
`20261009120000_product_batch_changes/migration.sql`, tenant registry and
`infrastructure/api/batch_field_audit.md`. Existing PR #79 service code and all
15 original native cases are preserved. Added schema-contract cases use real
PostgreSQL and include DB-trigger-rejected INSERT rollback for both corrections
and receipt/aggregate/lot/IN/audit, without mocking persistence.

CI change is one additional dedicated PG15 acceptance job; the existing four jobs
and pagination job remain unchanged. The runner checks exact source head/tree,
loopback-only binding, isolated container/network, original URL guard, empty public
schema, migrations and zero business rows before fixtures. It accepts exactly 15
native plus six schema cases with no skips, records all case results and retained
row counts, then verifies its owned DB is absent after DROP. No ambient DB URL,
production data, shared database or broad seed is used by this job.

## Verification status

Initial workspace validation: regenerated Prisma client, backend build and lint
passed; 26 existing batch service mock cases and five runner negative controls
passed. These preliminary workspace results are not native acceptance; the
preinstalled workspace Vitest was 3.2.4 and Node24. A strict backend npm ci using
Node22.22.0/npm11.21.0 then passed build, lint and 30 cases (26 batch mocks plus
four tenant context/registry cases) with locked Vitest4.1.11. The final GitHub
Actions source-head evidence is tracked in the Draft PR.
First source `b069c96ac079861222939944d34ff394eb63bcf9` / tree
`0e0f1b883a583dc275580c0ffd4e0830480d7886`, CI run 37884431350, passed
15/15 original native cases and 5/6 schema cases. The tenant registry test helper
returned a lazy PrismaPromise after AsyncLocalStorage exited; the expected tenant
read consequently failed closed. The helper now consumes the query inside context.
No production code or database protection was relaxed. The runner rejected aggregate
acceptance and still executed owned DB DROP before rejecting its failed test status.
Final acceptance must be read from the corrected source's CI, not this failed run.

On that same first source, a separate owned synthetic PG15 Docker service in the
selected cloud workspace applied all existing migrations, inserted a synthetic
tenant/user/product/lot/linked IN movement, then applied the additive migration.
Full before/after row JSON for all five tables matched; no audit rows were fabricated;
the exact DB was dropped and absence verified. Raw smoke evidence is
`product-batch-change/populated-upgrade.json`. This supports additive preservation,
not the native 15-case acceptance or production migration readiness.

## Remaining gates

Independent review is delegated to the parent after delivery. Initial-release admin
receipt reason entry and actual browser keyboard/touch/zoom acceptance remain
pending; existing PR #79 history UI is preserved. Store role approval, full
inventory/ERP/accounting acceptance and production migration/deployment are outside
this slice. No merge, deployment, role grant, credential upload or production DB
operation was performed. Do not close #46 or treat this Draft as release-ready.
