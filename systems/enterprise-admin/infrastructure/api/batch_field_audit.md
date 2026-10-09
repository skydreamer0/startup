# Batch field audit contract (#46 candidate)

Base: `/api/v1/admin/product-batches`. All routes require the existing tenant and
authentication boundary. No endpoint accepts a caller-supplied actor or tenant.
Dedicated correction bodies reject unknown fields. Initial receipt retains its
existing unknown-field stripping behavior; body actor/tenant cannot supply identity.

| Route | Permission | Body / result |
| --- | --- | --- |
| `POST /` | `create:products`, plus `release:product_batches` only for RELEASED | Existing receipt body; RELEASED also requires `{reason}` |
| `PATCH /:id` | `update:products` | Protected fields return 400; use dedicated operations |
| `POST /:id/status` | `update:products`, plus `release:product_batches` for RELEASED | `{status, reason}` |
| `POST /:id/expiry-corrections` | `update:products` | `{expiryDate: complete ISO datetime, reason}` |
| `POST /:id/cost-corrections` | `update:products` | `{costPrice: positive number < 100000000 with <=4 decimals, reason}` |
| `GET /:id/history?cursor=...` | `read:products` | `{success:true,data:{items:[...],nextCursor:string|null}}` |

Write success preserves `{success:true,data:ProductBatch}`. Reason is trimmed and
must contain 1–1000 characters. Duplicate state/value, invalid input, expired
release and an expiry correction that would keep expired RELEASED stock saleable
return 400. Missing permission is 403. A missing/cross-tenant batch is 404. Audit
persistence failure aborts the entire batch update. No successful correction
changes physical quantity or existing order/movement records.

History entries include id, tenantId, productId, batchId, actorId, operation
(`STATUS`, `EXPIRY`, `COST`, `INITIAL_RELEASE`), before, after, reason and createdAt.
Correction before/after contain status, expiryDate (ISO string) and costPrice (decimal
string). INITIAL_RELEASE before is `{exists:false}` and after is the initial snapshot;
its append shares the receipt/aggregate stock/lot/IN transaction. A trusted active
tenant actor comes exclusively from authenticated request context. Missing independent
release permission rejects before posting. Default/QUARANTINE/BLOCKED receipt policy
is unchanged; no release reason or release history is required. History is
latest-first by createdAt then id, at most 50 records per page. Use nextCursor to
read all older records; null marks the final page. A cursor outside this tenant and
batch is rejected with 400. No update/delete endpoint exists for history.

QUARANTINE and BLOCKED may move to each other or RELEASED; RELEASED may move only
to QUARANTINE or BLOCKED. Same-state transitions reject. Arrival at the expiry date
in Asia/Taipei means unusable, even if a transaction waited across midnight.
A RELEASED batch with old or proposed expiry already unusable must first be
explicitly quarantined/blocked before correcting expiry. Correcting a quarantined
batch does not release it.

ProductBatchChange schema/migration/tenant registry/append-only protection are absent.
This candidate cannot compile or provide native acceptance until the shared-model
owner supplies a reviewed branch/SHA (PR #77 is not that dependency). See ADR-020. No production permission
seeds or grants are made by this change.
