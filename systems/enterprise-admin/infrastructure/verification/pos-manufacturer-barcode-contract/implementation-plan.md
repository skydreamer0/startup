# Issue #48 — adopted product/package contract

Owner decisions confirmed on 2026-10-16 in the implementation conversation:

- Validity is `[validFrom, validUntil)`. Retirement is permanent for that revision; a replacement creates a new revision and retains the old record.
- A tenant administrator manually reviews the authority/source and records a reason. No external product catalogue is assumed authoritative.
- Existing unique exact-SKU auto-add remains. New package lookup always requires explicit confirmation. Unknown conversion cannot add to the cart.

## Implemented boundaries

ADR-024 defines the single tenant-owned ProductPackage identity, ProductPackageRevision and ProductPackageIdentifier authority. Product's nullable stockUnitLabel describes its existing integer stock unit; initial review labels that unit without changing stock, prices or history. Subsequent mappings must use the same label. Conversion is a positive integer number of existing stock units, or unknown; fractional/repacked products require a separate policy and are not rounded.

The inventory product list opens authenticated maintenance. Review records label, contents/strength/form, source, reason, actor, validity, literal identifiers and conversion. Revision writes compare the expected head atomically; retirement is one way. Failed or uncertain writes preserve the draft and require refreshed history and an explicit choice before another write.

The existing SKU lookup and scanner timing remain unchanged. POS explicit package lookup queries the complete tenant dataset by MANUFACTURER or GTIN, with no category, stock or product-list cap. Multiple codes may name one package; multiple packages for one product remain distinct. Candidate buttons reuse the existing chooser. Each choice re-resolves the exact revision/conversion before adding one package's base-unit quantity. Pending checkout, draft/scope transitions (including ABA), editing, unmount and consumed choices invalidate outstanding work. Cart stock is rechecked atomically.

Manual and locally decoded image evidence can be explicitly handed to lookup. Segmented symbols cannot be handed off as a whole product identity. Raw evidence is retained. The bounded GS1 reader requires decoder-observed GS1 and matching separator offsets, reading AI 01/10/17/21. Unsupported/duplicate AIs, incomplete boundaries and invalid values fail closed. Present lot, serial and YYMMDD expiry are read-only observations, never receipt, batch release or sale eligibility decisions. Unknown GS1 stays unknown; ordinary numeric text/ASCII29 cannot establish GS1. Current adapters report GS1 unknown and require explicit namespace choice.

Internal P/B versioned labels and URLs are rejected by package lookup without SKU fallback and never opened. Internal batch lookup remains #35/#31→#37. No OCR, cloud vision, LLM or decoding asset is introduced. Receiving quantity and inventory posting remain independently confirmed existing workflows.

## Verification

See [acceptance record](README.md). The existing owned SKU PG15 CI job adds ten native package cases and real built Admin/POS→production API→PG15 browser acceptance. Five SKU, nine category and twenty provenance cases remain separate and required. Every case must pass with zero skips, source identity and owned-resource cleanup. Local mocks cannot substitute for persisted constraints or current browser evidence.

Physical scanner/FNC1, Safari/physical iPad, native zoom, cold-offline device CPU/RAM and production migration are distinct NOT RUN gates. Current local API connectivity is required; no offline database/cache is introduced.

## References

[GS1 check digits](https://www.gs1.org/services/how-calculate-check-digit-manually) and [GS1 DataMatrix guideline](https://www.gs1.org/standards/gs1-datamatrix-guideline/25) define numeric validation and variable-field separators. Checksum success does not prove allocation/ownership.

Community Wisdom informed negative controls, not business policy: [VerdantStack tenant isolation](https://dev.to/verdantstack/-multi-tenant-database-design-shared-tables-the-tenant-column-and-the-three-ways-it-leaks-3cma) and its comments motivated paired native tenant controls; [IQ Tech Solutions concurrency tokens](https://dev.to/iqtechsolutions/a-row-version-is-a-cross-layer-contract-398n) and its comments motivated cross-layer stale-write checks. No RLS/framework change was adopted.
