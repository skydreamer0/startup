# Reviewed product/package API

Base `/api/v1/admin`, existing JWT/tenant context and success/error envelopes. Tenant derives from authentication; caller tenant fields are not accepted. Unknown fields, duplicate query keys, wrong types and empty identifiers are 400. IDs are UUIDs; product/package ownership is checked together.

| Method/path | Permission | Behavior |
| --- | --- | --- |
| GET `/inventory/products/:productId/packages` | read:products | Product and complete package/revision/identifier history, including retired/future/expired; foreign product 404 |
| POST `/inventory/products/:productId/packages` | update:products | Creates identity and revision1, 201 |
| POST `/inventory/products/:productId/packages/:packageId/revisions` | update:products | `{expectedRevision,data}`, atomic replacement, 201; stale409 |
| POST `/inventory/products/:productId/packages/:packageId/retire` | update:products | `{expectedRevision,reason}`, one-way retirement; repeat/stale409 |
| GET `/pos/packages/lookup?namespace=MANUFACTURER&value=...` | manage:pos | Exact literal valid/unretired candidates, no cap/stock/category filter |
| POST `/pos/packages/resolve` | manage:pos | `{identifier:{namespace,value},packageId,revision}` revalidates current conversion; stale/retired/expired409, unknown conversion422 |

Strict revision data: nonempty trimmed `label`, `contents`, `source`, `reason` max1000; `stockUnitLabel` max80; `unitsPerPackage` positive32-bit integer or null; `validFrom` ISO offset timestamp; later `validUntil` timestamp or null; 1–50 distinct `{namespace,value}` identifiers. Namespace MANUFACTURER or GTIN. Values preserve complete Unicode text including case/leading zeros/whitespace, length1–256, no NUL. GTIN requires8/12/13/14 ASCII digits and GS1 check digit, without padding/number coercion/allocation verification. Internal P/B versioned labels and URLs receive422 on lookup with no SKU fallback.

Validity is `[from,until)` and lookup time is server-owned. Old revisions are never reactivated/edited. New revision replaces the prior head immediately, including when its validity begins in the future (a deliberate gap). Cross-package overlap yields ambiguity. Reviewed product stock unit is immutable; conflicting review409 rolls back all writes.

Candidate: `packageId`, `revisionId`, positive `revision`, `label`, `contents`, nullable `unitsPerPackage`/`stockUnitLabel`, `source`, `validFrom`, nullable `validUntil`, current `product` with existing PosProduct/category shape. Product ID never deduplicates distinct packages. History adds actor/reason/createdAt and retirement actor/reason/time plus identifiers.

Lookup/resolve never change stock, receipt, orders or prices. POS manual confirmation adds reviewed base units after revalidation and local guards; it is not a reservation, and normal checkout still validates stock. No package price is inferred. Legacy `/pos/products/lookup?code=...` remains SKU-only, see [pos-product-lookup.md](pos-product-lookup.md). GS1 is a local read-only proposal, not an implicit namespace/fallback.
