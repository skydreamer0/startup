# ADR-016: Reviewed product import preserves physical stock

## Status

Accepted — 2026-10-06. An additional #29 slice after ADR-014/015.

## Context

Excel preview and confirmation independently parsed uploads without binding the
confirmation to the reviewed file. Product import also assigned stockQuantity
directly, overwriting sales committed between preview and confirmation and
creating unbatched opening stock for new SKUs.

## Decision

- Treat this route as product master-data import. Update name, description,
  prices and safety stock, but never include stockQuantity in an existing-product
  UPDATE. New products start at zero with no fabricated lot/movement. Preserve
  legacy stock columns for validation/preview compatibility, with an explicit
  operator warning that their quantities are not imported.
- Preview returns SHA-256 fileHash, normalizedRevision, expiresAt and previewToken.
  The normalized revision includes parser-version, ordered row numbers, parsed
  values and validation errors. Bump `PRODUCT_IMPORT_PARSER_VERSION` whenever
  normalization/validation semantics change.
- The token signs tenant/file/revision/expiry with HMAC-SHA256 under a distinct
  `product-import-preview:v1` domain. It has a 15-minute lifetime and is a two-part
  attestation, not an access JWT. The existing server signing secret is used;
  rotating it invalidates outstanding previews. No token or source file is logged.
- Confirm requires the uploaded file and token, verifies signature, tenant and
  expiry, then checks exact bytes and current normalized revision before any
  product writes. Missing/invalid token is 400, another tenant is 403, changed
  file/parser revision or expiry is 409 and requires a fresh preview.
- The admin modal pairs each preview with the reviewed File object. File changes
  remove confirmation eligibility; loading prevents file changes/closing, and a
  rejected confirmation allows preview again. The API client sends the matching
  token in multipart FormData. Hash/signature details stay out of the operator UI.

## Consequences and limits

No stale import can restore previously sold stock. Receipts/opening reconciliation
must use an inventory operation rather than this metadata route. Product/batch
editor cutover, physical returns, bins, corrections and production reconciliation
remain #29 work.

The token is a signed preview identity, not a one-use posting command or durable
result record. Retries may update the same metadata again; they cannot increase
stock. Existing per-row error handling remains, so metadata import is not an
all-or-nothing transaction. Preview create/update counts are estimates against
the then-current database, not locks on later metadata changes. Command/result
recovery and full all-writer acceptance are not implied.

There is no schema migration, historical data rewrite, invented opening batch
or production activation in this change.
