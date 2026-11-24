# Independent review: AR-00 eight HTTP writer source mappings

Subject: author freeze `2b53acfa2bf5c74354f36c91a334a59430a33034`, local partial tree `104f263a0fbedcd5b5f49b5d165dcd842c0af424`.
Application baseline: remote `5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e`, complete tree `3d18d4211946e8dc02d4780a20dfba2efe512343`.

## Disposition

**One mapping-boundary correction requested before signing off the eight-entry effect inventory.** The 61 source checks and their negative controls are reproducible and not false runtime claims. The correction does not require fixing production behavior in this slice, changing policy, or executing HTTP/PostgreSQL.

### R1: existing request-controlled Prisma data is an unbounded nested-effect path

`EXPENSES-UPDATE` is represented by one direct `expense.update` site and the boundary `READ_THEN_SINGLE_EXPENSE_UPDATE`. The README current-effects table only says Expense read/update. This accurately counts the literal root call but does not bound its affected models.

Evidence at the pinned application head:

- `expenses.routes.ts:14`: no route validation middleware.
- `expenses.controller.ts:30-33`: passes `req.body` unchanged to the service.
- `expenses.service.ts:53-69`: the TypeScript shape is erased at runtime; after only an optional period-format check and existence read, the original `data` object is sent to `prisma.expense.update`.
- `schema.prisma:536-545`: Expense has a Tenant relation. Tenant itself has mutable fields and relations (`15-46`).
- `lib/prisma.ts:54-56`: the extension adds tenant to `where` for update; it does not strip or constrain `data`.
- Independent mocked controller/service probes show `tenant: { update: { name: 'SYNTHETIC_REVIEW_ONLY' } }`, an extra `tenantId`, and `amount: { increment: 7 }` all reach the Prisma-call stub unchanged. These prove argument forwarding only, NOT Prisma acceptance, HTTP success, tenant escape, or persisted modification.

The existing `field-and-tenant-allowlist` runtime gap is useful but too generic to make the write-target uncertainty explicit. The README warning about future/new nested operations does not cover the fact that this possibility exists in the pinned source without any source edit. A literal count of 15 direct sites plus one explicit RolePermission nested site is valid; it must not read as exhaustive model/effect enumeration for those eight endpoints.

Requested bounded correction:

1. Add an explicit EXPENSES-UPDATE characterization for raw request-controlled Prisma `data`, unknown/unbounded nested relation targets and additional scalar/operation fields. Keep actual persistence as NOT_RUN. Review EXPENSES-CREATE's raw-body spread separately without presuming Prisma accepts mixed relation/scalar shapes.
2. Say counts describe syntactic reviewed call sites, not complete runtime side effects. Add named negative cases for nested relation payloads, tenant reassignment and operation objects; mark them unexecuted unless separate bounded evidence exists.
3. Add verifier/control coverage that cannot silently delete or promote this uncertainty. Do not make a schema, policy, auth, tenant or runtime fix as part of this documentation slice without its separate scope.

Source links:
- https://github.com/skydreamer0/startup/blob/5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e/systems/enterprise-admin/backend/src/modules/expenses/expenses.controller.ts#L30-L33
- https://github.com/skydreamer0/startup/blob/5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e/systems/enterprise-admin/backend/src/modules/expenses/expenses.service.ts#L53-L69
- https://github.com/skydreamer0/startup/blob/5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e/systems/enterprise-admin/backend/src/lib/prisma.ts#L54-L59
- https://github.com/skydreamer0/startup/blob/5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e/systems/enterprise-admin/backend/prisma/schema.prisma#L536-L549

## Successful review evidence

- Author worktree was clean and stayed at the stated freeze; no author file was edited.
- GitHub independently returned the baseline commit/tree. Recursive tree response was complete (`truncated=false`,1608 entries).
- All 164 baseline/regression files match both their receipts and remote Git blob identities. All 27 scope pins pass the verifier.
- All 21 packet files match the frozen checkout byte-for-byte. All 20 SHA256SUMS entries pass.
- Manual route -> controller -> complete service review matches all eight entries, permission names, mounting prefixes and 15 direct plus one explicit nested write sites.
- Users create correctly separates transaction-owned user/optional roles from post-commit audit. Users update and role replacement correctly do not claim atomicity. User delete is soft, expense delete hard. No provider-transfer or direct stock-write call is claimed.
- 61/61 new checks pass: 8 source contracts,45 verifier checks,8 actual guard-removal controls. Mutants are isolated, rejection witnesses distinguish original FAIL from mutant PASS, and temporary roots are cleaned.
- Original plan tests78/78 and gate controls17/17 pass. Original source verifier and HTTP source verifier pass. The latter explicitly returns `runtimeAcceptance: NOT_RUN`.
- Static citations are explicitly not execution receipts. Every endpoint retains runtime NOT_RUN with no promoted test citations. Canonical evidence, inventory, roadmap/gates and application files are unchanged by this additive diff.

## Reproducibility and limitations

Reviewer copied the exact freeze with `git archive` to a separately owned directory. Standard-library suites used Node24.22.1. A first context check in the bare archive failed because the validator requires tracked Git files. Initializing a separate reviewer Git index and adding the unchanged archive made it pass; this was a review-harness prerequisite, not an author regression. The initial failure is recorded in the review tool output and this report; `context-rerun.log` preserves the successful rerun.

Reviewer-only dataflow probes use pre-existing TypeScript5.9.3 to transpile the pinned controller/service and a VM with an explicit allowlist of in-memory dependency stubs. No real Prisma client, Express server, HTTP request, app startup, database, `.env`, provider or device was used. They are three mocked characterization checks, separate from the author's61 source checks. They do not satisfy runtime acceptance.

NOT RUN: Node22; application build/lint/full suites; hosted CI for this change; real HTTP/auth/RBAC/tenant response behavior; PostgreSQL acceptance/rollback/concurrency; providers, hardware or store acceptance; complete AC01. No publishing, merging, deployment or production-data access occurred.

Artifacts beside this report: `provenance.json`, `http-tests.log`, `http-verifier.log`, `source-verifier.log`, `plan-tests.log`, `gate-tests.log`, `context.log`, `context-rerun.log`, `packet-checksums.log`, `expense-dataflow-probe.cjs`, `expense-dataflow-probe.log`, `reviewer-receipt.json`.
