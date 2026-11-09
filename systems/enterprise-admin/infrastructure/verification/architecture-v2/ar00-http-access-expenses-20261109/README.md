# AR-00 AC01: eight HTTP writer source mappings

Refs [#180](https://github.com/skydreamer0/startup/issues/180) and Draft [#205](https://github.com/skydreamer0/startup/pull/205). This is an additive, finite source-mapping slice for users, roles and expenses. It does not complete AC01 or implement/fix their runtime behavior.

## Subject and scope

- Reviewed application source: `5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e`, complete remote tree `3d18d4211946e8dc02d4780a20dfba2efe512343`.
- Local work uses a **partial materialization**, not a full repository checkout or that complete Git tree. Local commits identify this partial checkout plus new work only. Baseline remote blob receipts are retained for review; they are not intended as repository additions.
- Eight mounted non-GET endpoints, **15 explicit direct Prisma call sites and one explicit nested RolePermission create site**, 27 byte-pinned application/reference files, eight shared middleware/persistence considerations. This is a syntactic call-site count, **not an exhaustive model/effect inventory**. Request-controlled nested write targets remain unclosed in the pinned code.
- Only source text and JSON are read. No application imports, package installation, server, database, `.env`, provider call, printing, device access, CI changes, merge or deployment.
- Canonical manifest/evidence, original inventory, #180 checkboxes, policy decisions, gates, activation and AR-01 dependency remain unchanged.

## Added files

- `scripts/architecture/http-writers-spec.mjs`: reviewed finite source pins, endpoint/function bounds, permissions, transaction characterizations and missing runtime cases. Updating it requires independent semantic review.
- `scripts/architecture/http-writers-verify.mjs`: read-only verifier and source inspection functions.
- `scripts/architecture/http-writers-contract.test.mjs`: eight source-mapping assertions. These tests never execute a service, middleware or HTTP handler.
- `scripts/architecture/http-writers-verify.test.mjs`: malformed-map, omission, drift and evidence-boundary controls.
- `scripts/architecture/http-writers-mutation.test.mjs`: independently executes rejection witnesses against eight guard-removal variants, including the request-data gap guard, plus an actual-byte-check removal witness. Mutated copies exist only in owned temporary directories and are removed afterward.
- `systems/enterprise-admin/infrastructure/plans/architecture-v2/http-writers-access-expenses.json`: endpoint map with explicit missing runtime evidence, source citations and separate static-test citations.
- This directory: README and bounded author/reviewer evidence. None of these files replaces the canonical evidence ledger.

## What the map says

All paths below have `/api/v1/admin` prefix; slash spelling follows the pinned route inventory.

| Entry | Explicit source call sites (not exhaustive effects) | Boundary retained |
|---|---|---|
| POST /users/ | User, optional UserRole, AuditLog | User and roles callback transaction finishes before separate audit write. |
| PUT /users/:id | User, optional UserRole deletion/recreation, AuditLog | Multiple awaited calls, no encompassing transaction in this function. |
| DELETE /users/:id | User update, AuditLog | Soft deletion then separate audit. |
| POST /roles/ | Role with optional nested RolePermission | Nested permissions belong to the parent create call. |
| PUT /roles/:id/permissions | RolePermission deletion and recreation | Separate calls, not an atomic replacement guarantee. |
| POST /expenses/ | Expense create site with request-controlled data spread | Top-level tenantId overwritten from context; nested targets and accepted relation/scalar combinations remain unenumerated. |
| PUT /expenses/:id | Expense read then update site with raw request-controlled data | Separate read and write; additional fields, operation objects and nested relation targets are not bounded by a runtime schema. |
| DELETE /expenses/:id | Expense read then hard delete | No soft-deletion claim. |

The full service-function range is hash-cited alongside individual call-site lines. Optional role writes, the explicit nested RolePermission site, source order, post-transaction audit and separate-call boundaries are explicit. `explicitWriteSites` deliberately does not imply complete runtime write targets. App mount, controller, routes, schema, Prisma/tenant helpers and relevant middleware bytes are pinned. Shared notes include request counters, tenant-context reads, auth/RBAC, request validation and persistence scoping; child-relation safety is not inferred from the extension.

### R1 correction: request-controlled effects are an existing open gap

Independent review found an omission in the first freeze `2b53acfa2bf5c74354f36c91a334a59430a33034`. The raw `req.body` reaches `ExpensesService.updateExpense`, then Prisma `data`; the TypeScript parameter type is erased and does not filter runtime keys. The update extension adds tenant to `where`, not a data allowlist. Expense has a Tenant relation, whose reachable write targets have **not been enumerated or tested**.

Three reviewer-only mocked controller/service probes showed `tenant.update`, extra `tenantId`, and `amount.increment` reaching the Prisma stub unchanged. They prove argument forwarding only, **not Prisma acceptance, successful HTTP, cross-tenant escape or persisted modification**. The review's original probe/receipt remain separate from author executions; no 3/3 result is promoted to real HTTP/PG evidence.

The corrected map retains an `OPEN_GAP` for update, explicit payload classes and source citations, `nestedRelationTargets: NOT_ENUMERATED`, `targetsClosed: false`, and Prisma/HTTP/PG `NOT_RUN`. It adds corresponding unexecuted runtime test requirements and negative controls preventing this uncertainty from being erased or marked complete. A dedicated guard-removal witness proves the gap protection is exercised.

Create was examined separately in source: `req.body` is spread through `tenantPersistence().data`, which overwrites top-level tenantId while retaining other request keys. This does not establish that Prisma accepts a mixed relation/scalar shape, nor does it sanitize nested relations. The map records a separate create `OPEN_GAP`; the reviewer's update probe is not represented as a create execution. No application, schema, auth, tenant or policy behavior was fixed by this source-map correction.

## Verifier guarantees and limits

The verifier rejects missing/duplicate endpoints, incorrect source lineage/citations, omitted explicit direct or nested call sites, false READ classification, changed owners/AR destinations/permissions, false atomicity, missing shared effects, nonexistent/mismatched test citations, erased runtime/dataflow gaps and unsupported PASS or effect-closure claims. It checks actual input bytes as well as declared fingerprints. An unexpected source change fails closed until the finite contract is reviewed and updated.

This is **not a general TypeScript/Prisma parser or transitive effect proof**. Even at the exact pinned source, request-controlled Prisma data can contain fields or nested operations absent from the explicit call-site list. The finite extractor counts reviewed source syntax only. Aliases, computed access, raw SQL, additional nested operations, indirect callbacks or dependency changes must not be accepted by merely refreshing hashes. Review the code/dataflow and update the finite contract and controls together, or use a suitable parser in a future slice.

Mapping ownership/AR derives from the unchanged pinned module inventory; the original requirement reference is #180 AC01 inventory work. This does not invent a claim that unrelated original business acceptance criteria were satisfied. All business-requirement coverage remains incomplete.

The static test citation proves only that a particular source file/declaration and hash are present. It is **not a test execution receipt**, and cannot establish assertion quality, runtime behavior, real transaction atomicity or tenant safety. The author receipt records actual static-suite executions separately. Coordinated edits to verifier/spec/map/tests still require independent review; self-consistency is not semantic proof.

## Run

From the repository root, with Node 22+ standard library only:

```
node scripts/architecture/http-writers-verify.mjs
node --test scripts/architecture/http-writers-*.test.mjs
node scripts/architecture/verify-plan.mjs --check-source
node --test scripts/architecture/plan.test.mjs
node --test systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-closeout-20261108/gate-acceptance.test.mjs
bash scripts/validate-agent-context.sh
```

Author execution environment: Node 24.22.1. Node22 is a supported intended command surface but **not executed in this slice**. These manual checks are not newly wired into hosted CI. Current R1-corrected results and exact local source identity are in `author-r1/receipt.json` and its logs; `author/receipt.json` preserves the superseded first-freeze run without relabeling it. Independent re-review is pending until a reviewer supplies a separate receipt for the corrected source.

## Remaining work

- Every endpoint has `runtimeTests.status: NOT_RUN`, no runtime test citations and explicit required cases. Empty original module test mappings are not proof that no relevant test exists elsewhere; discovery and named behavior-test mapping remain required.
- Actual auth/RBAC/schema, tenant/role ownership, error/rollback/partial-state, amount/period, concurrency and real HTTP/PG behavior are unverified. Use owned synthetic fixtures and separate mock, HTTP and PostgreSQL evidence. Do not use ambient DB URLs or real provider calls.
- The other mounted HTTP routes and transitive/operational effects, print transport/worker and other AC01 requirements remain separate work. This eight-endpoint slice is not all-writer completion.
- Preserve Draft and all existing release restrictions. Freeze, obtain non-author review, coordinate the additive file list with the print integrator, then recheck the latest remote head before any separately authorized publication. No file from another worker should be overwritten.
