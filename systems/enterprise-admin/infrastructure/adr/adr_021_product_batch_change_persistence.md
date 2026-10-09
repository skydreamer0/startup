# ADR-021: Unique ProductBatchChange persistence

**Status:** Candidate; independent review and operational gates pending
**Date:** 2026-10-09
**Tracking:** #46; shared-model dependency of PR #76 / #79

## Decision

The sole shared schema author supplies `ProductBatchChange`, matching the existing
PR #79 services without creating a parallel audit model. Its additive migration is
`20261009120000_product_batch_changes`. PR #77 only supplies order numbering.

- Required tenant/product/batch/actor identities, enum operation (`STATUS`, `EXPIRY`,
  `COST`, `INITIAL_RELEASE`), JSONB before/after, reason and DB-generated
  CURRENT_TIMESTAMP createdAt stored as TIMESTAMPTZ(3), independent of session
  timezone and client clock.
- Tenant registry injection applies to this model. Composite product/tenant,
  batch/product/tenant and actor/tenant FKs, plus tenant FK, use DELETE/UPDATE
  RESTRICT. Supporting composite unique indexes on products/users add no data
  rewrite; the existing batch composite key is reused. Audited actors can still
  be suspended/soft-deleted; their identity and history are retained.
- History index is tenant/batch/createdAt DESC/id DESC; tenant/product and
  tenant/actor indexes support retained-parent checks.
- Snapshot JSON has exactly status/expiryDate/costPrice string keys. SQL checks
  known status, ISO UTC millisecond date shape and nonnegative Decimal(12,4)
  string range. Service validation owns calendar validity and current Taipei
  cutoff after the product lock. A correction changes only its declared field;
  numeric-equal costs reject. INITIAL_RELEASE has exactly `{exists:false}` before
  and a RELEASED full snapshot after. No previous lot is invented.
- Reason is required, nonblank, space-trimmed, maximum 1000 characters; services
  apply JavaScript trim and derive an active tenant actor from authenticated
  request context. FKs do not replace authentication or actor status checks.
- Row UPDATE/DELETE and statement TRUNCATE triggers raise SQLSTATE 23514. No
  history edit/delete API, cascade deletion, broad seed or trigger-disabling
  cleanup is introduced. Fixtures are retained until the owned synthetic DB is
  dropped. This protects normal persistence paths; it does not prevent a database
  administrator from changing the schema or disabling protections.
- No historical backfill, movement/stock rewrite, production role grants,
  production security changes or production migration are part of this change.

## Service and verification boundary

The existing receipt and correction transaction owners remain unchanged.
INITIAL_RELEASE still requires independent release permission only for that path;
default/QUARANTINE/BLOCKED receipt policy is preserved. Product lock order, post-wait
Taipei expiry checks, physical stock posting and historical accounting snapshots
remain the responsibility of the existing services.

The new CI job invokes the existing guarded runner on GitHub-hosted Actions,
Node22 and dedicated loopback PG15. The original 15 native cases are unchanged.
Six additional real database cases verify composite FK isolation, tenant registry,
snapshot/reason constraints, INITIAL_RELEASE precision/time, retained parents and
TRUNCATE, and atomic rollback when PostgreSQL itself rejects an audit INSERT.
The latter adds a synthetic-only failure trigger without mocking the DB/client or
disabling append-only protection. Five harness negative controls verify evidence
cannot accept missing or skipped tests. Results, source identities and pending
gates are recorded in `../verification/product-batch-change-integration.md`.

Independent review is handed to the parent. UI receipt reason/browser/device
acceptance, operational-role policy and broader inventory gates remain pending.
Draft only; no merge, deployment or production database operation is authorized.
