# Two opt-in pharmacy API/PostgreSQL journeys

This preserves two bounded cloud acceptance cases for #31/#37. It adds no
business feature, CI job or store-readiness claim. Ordinary `npm test` skips
both cases without reading an owner file, importing the app, or opening a DB;
an ambient `DATABASE_URL` is never an opt-in. Partial opt-in fails closed.

## Scope

1. Real login → receiving-draft CAS race (200/409) → retain the losing payload
   → explicitly save revision 3 → read immutable revisions 1/2/3. All other
   business tables remain unchanged. This does **not** exercise browser choices.
2. Initial batch receipts (5 units) → quarantine rejection with full rollback
   → audited release → FEFO POS sale (3) → idempotent replay → money-only refund
   without stock return → general-order debit (1) → batch trace and balance (1).
   A pending general order already debits stock; that is not physical dispatch.

The test uses the production Express app, real Argon2/JWT login and PostgreSQL,
not mocks. Customer/shift/role setup is explicitly synthetic. Full raw rows are
compared in memory; only redacted snapshots are written. Append-only records
remain until the entire owned disposable DB is dropped.

## Reproduce on an authorized isolated Docker host

Prerequisites: an authorized isolated Linux host with UID/GID **1000** (the
runner refuses other users), Python 3.10+, Docker, Git, official Node **22.23.4**, npm
**11.21.0**, and the backend lockfile dependencies. Do not use `python -O` or
`PYTHONOPTIMIZE`; the runner rejects optimized Python before resource creation.
Do not run this on a production Docker host. The runner never accepts a DB URL,
pulls an image, installs dependencies, reads `.env`, or changes daemon settings.

Prepare a new task directory outside the checkout. From the clean committed
repository, archive the exact source, excluding every ambient/untracked file:

```bash
source_head=$(git rev-parse HEAD)
task_dir=$(mktemp -d /tmp/pharmacy-gap-XXXXXXXX)
git archive "$source_head" systems/enterprise-admin/backend | tar -x -C "$task_dir"
backend_copy="$task_dir/systems/enterprise-admin/backend"
```

Prepare npm11.21.0 under a separate task prefix, using the official registry.
Use the approved environment's existing proxy/CA settings unchanged; never
print their values or disable TLS. In the archived backend, with Node22 on PATH,
no ambient `DATABASE_URL` and no `.env`, run:

```text
node <task-npm-prefix>/node_modules/npm/bin/npm-cli.js ci --ignore-scripts --no-audit --no-fund
node <task-npm-prefix>/node_modules/npm/bin/npm-cli.js run db:generate
```

`--ignore-scripts` avoids implicit lifecycle activity; explicitly generating
Prisma needs no DB connection. Never run seed/reset. The runner verifies every
committed backend file and the lockfile, rejects extra source files, checks npm
version, and compares generated/source schemas through Prisma's formatter.

Preload these official images if authorized (the runner uses `--pull=never`):

```text
node:22.23.4-bookworm@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384
postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81
```

Run the committed script from the same exact checkout. Both paths below refer
to task-local prepared tools/source, not the repository's ambient backend:

Set `npm_prefix` to the prepared task-local npm installation. Replace the
quoted example paths with the actual paths; they are not shell redirections.

```bash
npm_prefix="/absolute/path/to/task-npm-prefix"
evidence_dir="$task_dir/evidence"
python systems/enterprise-admin/backend/scripts/pharmacy-gap-native.py probe \
  --expected-head "$source_head" --prepared-backend "$backend_copy" \
  --npm-prefix "$npm_prefix" --output-root "$evidence_dir"
probe_receipt="/absolute/path/to/successful-probe/result.json"
python systems/enterprise-admin/backend/scripts/pharmacy-gap-native.py test \
  --expected-head "$source_head" --prepared-backend "$backend_copy" \
  --npm-prefix "$npm_prefix" --output-root "$evidence_dir" \
  --probe-receipt "$probe_receipt"
```

The standalone probe must pass **and clean up** before test mode. Each mode
creates a fresh private internal bridge, a new PG container/anonymous volume,
and a non-root official Node client. No ports are published; no host network,
privileged mode or existing data mounts are used. Source/tools and client rootfs
are read-only. Only fresh evidence and temporary paths are writable. Fresh
synthetic credentials exist only for the invocation, never in checked-in data.
Before migration, verify empty public schema, DB system identifier, exact owned
container/network membership and source. The test rechecks DB identity and empty
business tables before fixture writes. Cleanup verifies ownership again and
removes only those resources. A cleanup failure makes the overall run fail.

The runner selects only `src/__tests__/pharmacy-gap.native.test.ts`, using the
repository's Vitest config with `--no-cache --configLoader=runner` so Vite does
not need a writable source tree. It requires both exact case names passed,
total=2, pending=0, failed=0, HTTP/Prisma teardown and resource-removal receipts.
New fresh-DB probes/migrations are prerequisites, not reruns of existing suites.

## Evidence and remaining gates

`evidence/historical-20261027.json` records the original exact master subject,
two-case result, quantities, cleanup, failure summaries and original log hashes.
It is historical evidence, not a result for a changed test or future head.
Native outputs include source/ownership, schema proof, empty-DB probe, migration
log, Vitest JSON, request ledger, redacted snapshots, retained row counts and
cleanup receipts. Review before publishing: do not commit dependencies, `.env`,
proxy values, credentials, full DB snapshots or unrelated historical artifacts.

`evidence/execution-1b3ab16.json` records the committed runner/test revalidation:
two real API/PG cases passed with zero pending/failed, five cleanup checks passed,
and default/partial opt-in, optimized Python and remote-Docker rejection controls
behaved as expected. It includes the independent read-only review's exact hashes.
The subject is commit `1b3ab16e527f777d17070a63dbb9e928b9c8d4a1`; subsequent
evidence-only commits do not change its backend tree. PR CI is a separate gate.

The five receiving browser gaps remain **NOT_RUN**: save next revision after
CAS choice; another actor's draft/history; cross-tenant browser; pending/unknown
navigation guards; read-only actor PUT rejection. Backend CAS is not browser CAS.
Physical return/bin receipt and unfinished formal multi-line receiving are
feature gaps. Dispatch acknowledgement, daily settlement, scanners, printers,
touch workflows and physical batch/expiry/bin checks remain separate gates.
This slice closes no parent issue or G0–G7 gate. Chromium sandbox and Library401
were not retried; no merge, deployment or manual remote CI dispatch occurred.
