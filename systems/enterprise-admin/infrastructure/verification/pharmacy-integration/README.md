# Pharmacy integration #71 / #76 / #77

Draft PR #84 on `feat/pharmacy-integrate-71-76-77`. This records integration
boundaries and reproduction; actual final-SHA outcomes belong in the PR and its
Actions artifacts, not an unrun PASS claim. No master merge, deployment,
production data/security/credentials or PC4070 use is authorized here.

## Immutable sources

| Source | Head | Tree |
| --- | --- | --- |
| master | 9ec05fbb62688d02dc96df2099e39745762a02be | 27de122bfdc4be2efa113d485ec0e358e6a71c1b |
| #71 (includes #73/#75/#78) | dea04ead6d750a306175794f5280cc3cab4c6a18 | d554e7ea58363c3a3b4b8ea1d582fb22417db230 |
| #76 (includes #79/#81/#82) | ed13c5939026bde044bdcd68072d793d5d46de8f | 92972743213c005b24784c48e6a5d387f24669f6 |
| #77 (includes #80/#83) | 5decf4db4e13d28a6f99ecde238c157a84934659 | 0bd640cc7ebcc94a97bdba7ddab86d08908f4711 |

Remote refs/API must be read again before any later merge; these are integration
inputs, not claims that author branches stopped moving. All three parents are
retained in integration ancestry. Author branches and original PRs stay intact.

## Conflict decisions

- `ci.yml`: preserve all eight jobs, including master's readiness steps; keep
  whole SKU, batch audit and sequence jobs. Adopt #83's fixed execution SHA,
  ordered base/head parents, official API/tree checks and event-base recording.
  `setup.mjs` safety/source/dirty guards are unchanged. No relaxed resolver.
- `schema.prisma`: both Tenant relations, OrderNumberCounter/Order.businessDate,
  ProductBatchChange and composite relations/indexes coexist. Both original
  migration files remain byte-identical, including their existing whitespace.
- `tenant-scoped-models.ts`: retain both model entries. No scope expansion.
- Backend context and checkout merge automatically: exact SKU paths coexist with
  the transactional counter. #82's receipt permission/reason, immutable audit,
  duplicate-submit protection and error drafts remain intact.
- No new product policy or permission grant is introduced. New policy/safety
  conflicts must be isolated for a separately reviewed decision.

## Joint migration acceptance

The existing sequence harness proves exact source, clean checkout, Node22,
Actions-owned empty isolated loopback PG15 and DB identity before calling
`backend/scripts/integration-migrations.mjs`. No new URL or guard bypass exists.
It creates an absent owned schema, applies all old migrations, inserts synthetic
old tenant/actor/customer/product/batch/IN movement/order, and applies sequence
then audit migrations. Full old row snapshots match after each migration;
historical businessDate stays NULL, printed-day counter starts at 42 and audit
history starts empty. Synthetic audit UPDATE/DELETE/TRUNCATE all fail with the
append-only trigger; that row remains unchanged. Only the owned schema is dropped,
with absence verified, without disabling triggers. Original legacy duplicate,
malformed/overflow, nine sequence, 21 command, 38 stock and five mock cases stay
required. New `integration-migrations.json` and cleanup receipts are mandatory
before accepted.json can be written, and helper source hashes are included.

The separate batch job requires all original 15 native plus six schema cases.
SKU requires five native and 14 current POS browser cases. Ordinary POS includes
two real HTTP restart/recovery cases and 13 historical fixed scanner/supplier
browser cases; the latter are not current integrated application UI evidence.
Run generate, shared types, backend/Admin/POS build, applicable lint/context and
tenant-isolation tests on the same final SHA. Report skips/unrun cases separately.
Do not fake GitHub-hosted variables to run Actions-only guards locally; local
owned synthetic migration smoke is supplementary and labeled separately.

## Production cutover gates (not executed)

Backend Dockerfile CMD invokes `prisma migrate deploy` before server start.
Starting that image with a production URL would execute both migrations; an
image smoke must override CMD or use an explicitly owned synthetic DB.

Before a separately approved cutover, a named operations owner must inventory
all order-number writers: POS versions, command workers/offline retries, general
orders, importers/integrations, scheduled jobs and any direct SQL writer. Record
versions, owners and proof of retirement. Old POS/worker/importer allocation
must not run alongside the counter writer; uniqueness only rejects collisions.
Also inventory legacy batch/stock writers and confirm audit/receipt boundaries.

On an authorized restored copy, run read-only duplicate/nonstandard-number
preflight; any repair needs explicit approval, not automatic renumber/deletion.
A named backup owner must capture and verify a restorable pre-migration backup
and retention point. A named cutover owner must schedule a stop-write window,
stop/drain old writers and queues, verify no concurrent writes, apply the reviewed
migration chain, validate counter maxima/constraints and audit retention, and
start only the approved writer version before opening traffic.

A named rollback owner must approve triggers/thresholds, restore rehearsal,
time budget and handling of writes accepted after cutover. Reverting application
code alone cannot safely resume old counter-unaware writers. Audit records must
remain immutable; no ad-hoc dropping constraints, triggers or renumbering is a
rollback plan. Production responsibility and store roles remain unresolved gates.

## Review and safe PR closure

Historical independent evidence is in SKU `follow-up-review.md`, batch
`batch-audit-follow-up.md` / `product-batch-change-integration.md`, and #83's
review discussion. It does not approve this integrated tree or the new joint
migration helper. Parent independent review must verify final SHA/tree, full file
union, CI artifacts, failure logs, permission/audit/replay boundaries and cleanup.

Keep #84 Draft while business/device/policy/release gates remain open. After
independent integrated review and a separate master-merge approval, merge the
reviewed integration and verify master contains all three source heads. Then
compare any newly advanced author heads and preserve additions before marking
#71/#76/#77 superseded (dependency/shared-model work first, UI/SKU afterward).
Close original PRs only with explicit authorization and a link to retained
integration evidence; do not close #46/#47 or broader inventory gates solely
because CI is green. Do not independently merge originals on top of #84.

The separate receipt UIUX author works from #76's tree on its own branch. Do not
wait, duplicate styling or overwrite it. Later integration should compare its
exact head against ed13c593 and protect #82's reason/permission/pending/error
behavior, followed by a new independent review and UI acceptance.
