# Batch audit follow-up review (2026-10-09)

## Provenance and independent findings

Received PR #76 backup/batch-audit-20261009-edb1bc3 at
`dbb8d9199b723d83831b3b1ba90f4c32042f2e09`. Retain local
review commit `a439fb281fe98ede817d45e60db6972c645a35f0`.
Independent review found initial receipt RELEASED bypassed the dedicated release
permission, trusted actor, reason and audit transaction. The existing correction
service already re-read the batch and checked today's cutoff after the product lock,
including the expired RELEASED extension restriction; additional tests strengthen
that evidence rather than rewriting the correction service.

## Changes and checks

Initial release alone adds independent permission, active tenant actor and reason,
with INITIAL_RELEASE in the receipt transaction. Ordinary receipt policy is retained.
Mock tests cover authorization/tenant actor, reasons, single transaction ordering,
error propagation and post-lock midnight recheck. Native cases cover authenticated
HTTP/body-actor spoofing, cross-tenant denial, initial audit/movement failure rollback,
actual PostgreSQL lock waits and expiry-extension rejection across midnight. The
existing arrival-expiry case moves from general receipt tests into the dedicated
append-only suite, so its retained audit records are removed only with the owned DB.

Native runner inventory now requires all 15 exact cases, no omissions/skips. It is
not wired into ordinary CI and must remain blocked until the model is integrated.
Local mocked batch tests: 26/26 PASS. Runner pure negative controls: 4/4 PASS.
Backend lint: PASS. Backend build: FAIL (missing ProductBatchChange delegate).
Admin history tests: 7/7 PASS; admin TypeScript/build: PASS.
Admin history displays initial release without inventing a prior lot state.

## Not run / handoff

No ProductBatchChange model/migration was invented. User confirmed #47 / PR #77 has
only numbering, not this dependency. Required owner handoff: reviewed model SHA,
INITIAL_RELEASE operation/snapshot, tenant-scoped registry, composite foreign keys,
append-only database protection and migration. Then run the owned synthetic database
harness, 15 native cases, actual row-lock/midnight races, rollback, row counts and
verified owned-DB removal, followed by all four ordinary CI jobs. Mock success is
not proof of database rollback or append-only storage.

Initial-release admin receipt reason flow remains pending; browser/keyboard/device
acceptance and policy review are not complete. No merge, deployment, formal role
grant, production seed or production database action.
