# ADR-024: Reviewed tenant product/package identifiers

Status: Accepted (owner decisions, 2026-10-16).

## Context

Existing exact SKU lookup and guarded chooser are delivered. Manufacturer codes and GTINs need one maintained package authority with literal identity, tenant isolation, reviewed conversion and revision history. Product identity/list truncation cannot prove package uniqueness.

## Decision

ProductPackage is stable tenant/product identity. ProductPackageRevision records source, human actor/reason, label/contents, conversion and `[from,until)` validity. ProductPackageIdentifier seals the literal MANUFACTURER/GTIN set. Product/package/actor references use composite tenant FKs; all three models enter the tenant registry.

Only one unretired revision exists per package. A head revision CAS serializes retirement and replacement. Retirement is permanent; replacement increments the head, retires the preceding revision atomically and creates a new record. Different packages may share a code, yielding explicit ambiguity. No unique code, cap, trim, case fold or numeric normalization establishes uniqueness.

Product stockUnitLabel starts NULL and names the existing integer stock unit after manual review. It never changes historical/current quantities/prices. Once reviewed it is immutable. Positive integer conversion uses that unit; unknown stays NULL and cannot confirm a cart add. Unit changes require a separate reconciliation/migration policy.

Migration `20261016090000_product_package_mapping` adds SQL checks, partial unique unretired index, immutable UPDATE/DELETE guards, deferred head FK and deferred identifier-count/head constraints sealing the complete set at commit. These PostgreSQL features exceed Prisma DSL and remain authoritative SQL; do not regenerate them away with schema push. Revision and its complete identifier set share one transaction. No edit/delete history API exists. Privileged TRUNCATE is used only by guarded empty synthetic fixtures; this is not a database-administrator tamper-proof audit ledger.

Existing SKU API/wedge auto-add remain. New explicit namespace lookup includes every applicable tenant candidate, including zero stock. POS reuses candidate buttons, requires manual selection, re-resolves revision/validity and adds reviewed base units with current cart/stock guards. Lookup/resolve themselves never mutate cart, stock, receipt or batch.

## Consequences

Maintenance uses existing read/update product permissions; POS uses manage:pos. Authority is tenant administrator review, not an external catalogue. No package price/clinical unit is inferred. Receipt remains independently confirmed. Unsupported internal QR/URL never falls back through package lookup. Observed GS1 fields are read-only proposals; unknown metadata stays unknown.

Native PG15/HTTP and current built browser evidence are required alongside units. Device/offline/native zoom/store rollout remain distinct; see `../verification/pos-manufacturer-barcode-contract/README.md`.
