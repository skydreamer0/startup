# POS manufacturer barcode and package mapping contract — gap review

Status: **gap review only**. This note records the remaining Issue #48 acceptance boundary. It does not claim manufacturer barcode, GTIN, package identity, temporal validity, or active/retired support has been implemented.

## Current implementation evidence at base `94a2184bec6e3221e3efaa427bc75d1ef4435c9b`

- `backend/src/modules/pos/product-lookup.service.ts` parses the literal `code` and queries only `{ tenantId, sku: code }` through tenant persistence.
- `backend/prisma/schema.prisma` `Product` has SKU and tenant uniqueness. `Product` and `ProductBatch` contain no manufacturer identifier, GTIN, package identity/revision, validity interval, or active/retired mapping state.
- The route is tenant-authenticated and permission-guarded, but that does not create missing manufacturer/package lookup semantics.
- POS may compare optional `barcode` values already present in supplied candidate objects. Those values do not establish a maintained, tenant-wide manufacturer mapping or package identity.
- The existing native PostgreSQL test source includes cases for exact SKU lookup, zero-stock inclusion, a result beyond 100 fuzzy rows, and tenant separation for SKU. That is source inspection only for this review; this round did not rerun the PostgreSQL test, so it is not current-run evidence. It does not prove manufacturer-code or package mapping.

## Executable synthetic coverage already present

`backend/src/__tests__/pos.productLookup.test.ts` is database-free and exercises the public lookup service/controller boundary with synthetic Prisma responses. It covers literal SKU preservation, tenant scoping and missing-tenant failure, malformed query rejection, response envelope, and error forwarding.

## This review round's execution record

- Runtime was Node `v24.19.0`; the repository requires Node `>=22.12.0 <23`. No Node 22 runtime manager or Node 22 binary was available, so the supported-runtime check was not run.
- The lockfile-based backend install `npm ci --cache /tmp/startup-npm-cache` completed successfully. A first `npm ci` attempt failed because npm's default cache path `/home/agent/.npm` was unavailable; the retry changed only the cache location. No lockfile or dependency declaration changed.
- `npm test -- src/__tests__/pos.productLookup.test.ts`: **PASS**, 1 file / 10 tests. These are existing pure-synthetic SKU tests only.
- The full backend suite, backend build, lint, PostgreSQL test, and manufacturer/package mapping resolver tests were **NOT RUN** this round. The mapping schema and resolver do not exist at the inspected base.
- The PostgreSQL test source was inspected, but no database test execution or current-round PostgreSQL evidence is claimed. Any prior native PostgreSQL result is prior evidence and was not reproduced in this review round.

The 10/10 result is evidence for the current SKU-only boundary under Node 24, outside the repository's supported runtime range. It is not a passing test of manufacturer barcode/package support. Do not make a mock-only green test stand in for an absent mapping model or resolver.

## Remaining acceptance contract before claiming manufacturer/package support

After a tenant-scoped identifier-to-package mapping exists, add executable pure-synthetic tests for its public resolver boundary. Fixtures must be invented test data only.

1. **Namespace and literal identity**: a manufacturer code and a GTIN are distinct identifier kinds; exact lookup preserves every character, including leading zeroes and case where applicable. No substring, numeric coercion, trim, or cross-namespace fallback.
2. **Multiple codes per package**: separate exact codes can resolve to the same package identity without duplicating the product.
3. **Multiple package identities per product**: each candidate exposes enough stable package identity/revision and human-readable distinction to prevent same-product/different-package auto-selection. Unknown conversion does not infer a case-to-unit quantity.
4. **Tenant isolation**: the same namespace/value in another tenant is invisible; a global result cap cannot establish uniqueness.
5. **Active/retired and valid-time boundary**: test active, retired, not-yet-valid, expired, and exact interval-boundary cases. The inclusive/exclusive boundary convention and whether retired mappings can be reactivated must be specified by the mapping owner before implementing these cases; current schema/service has no such policy to preserve.
6. **Ambiguous or stale mapping**: multiple valid package candidates remain explicit candidates; stale mapping revision cannot be treated as current or auto-added.
7. **No side effects**: lookup only proposes identity. It never increments POS quantity, receipt quantity, or inventory, and does not infer lot/expiry facts from an ordinary manufacturer code.

Pure synthetic resolver tests should precede isolated PostgreSQL constraints/tenant-conflict acceptance. PostgreSQL evidence is still required to prove persisted uniqueness, interval overlap policy, and tenant isolation; synthetic tests cannot substitute for it.

## Scope and exclusions

- Reuse the existing exact-SKU path and SKU acceptance evidence; do not rewrite its API or scanner behavior here.
- This gap review changes no decoder, OCR, GS1 parser, image path, database schema, permission, or production service.
- Internal batch QR remains on #35 / #31 → #37. OCR remains on #34. #109 remains on HOLD; #118 is not part of this work.
- No PR #127 files or `useBarcodeScanner.choice-stock.test.tsx` are part of this candidate.
- Hardware scanner payloads, FNC1/raw bytes, Safari/iPad, and production database behavior remain separate acceptance gates.
