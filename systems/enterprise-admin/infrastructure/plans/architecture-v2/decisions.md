# Business oracle and decision register

Authority: original Issues/confirmed decisions plus the 2026-11-07 architecture
upgrade in [#37](https://github.com/skydreamer0/startup/issues/37#issuecomment-6700557196).
Historical “local changes only/no redesign” proposals are not the current design
limit. Correct business behavior, compatibility, data preservation and acceptance
remain mandatory. Source scope is frozen in README; no production behavior was run.

## Confirmed invariants (requirements, not fresh test results)

| ID | Rule to preserve | Source and regression destination |
| --- | --- | --- |
| O01 | One intent/result; timeout is UNKNOWN, not an invitation to generate a new command. Preserve old v1 payload/hash/JSON. | #30, ADR-018; AR-02/06; checkout-command, HTTP-restart and abort-retry harnesses. |
| O02 | One caller-owned PG transaction for sale/payment records/stock/movement/allocation/result; no provider/OCR/print waits inside it. | #29/#30, ADR-013/014; AR-06/07/08 and mixed-writer PG acceptance. |
| O03 | Asia/Taipei expiry day is unusable; existing 30-day warning horizon remains. Business date, shift day and expiry are different concepts. | #29/#37 confirmed 2026-10-06; batch-expiry/business-day, AR-05/07. |
| O04 | Monetary refund registration does not physically receive goods or transfer provider money. Returns start quarantined; unknown lot stays unknown. | ADR-015, #29/#30/#37; AR-08/10. |
| O05 | Private ReceivingDraft, formal receipt, approval and posting are different states. Critical/evidence/package revisions must bind approval. | ADR-025, #32 consolidated in #37; AR-09/14. |
| O06 | Exact full-dataset package mapping; preserve leading zeros; ambiguous/retired/unknown conversion is not a unique item or quantity. | ADR-024, #48; AR-03/18/19. Existing reviewed [from,until) and permanent-retirement policy is retained, not re-opened. |
| O07 | Scan/OCR are evidence/proposals, not actual quantity or authority. Late OCR cannot overwrite human work. Manual flow survives. | #34/#37 M0–M2; AR-14/15/19. Local CPU only; no cloud AI fallback. |
| O08 | Batch identity, product P1 label, bin, quantity and job IDs are different. Scan/reprint cannot post stock; transport ACK is not paper confirmation. | #35/#137, ADR-023; AR-18. |
| O09 | Preserve known historical gaps; do not fabricate lot, cost, bin, original image or refund facts. One writer during cutover. | #37, #180; AR-03/07/08/20/23. |
| O10 | Restore older data into recovery hold, reconcile missing post-backup effects before resuming. Missing command is not proof it never happened. | #36/#37 recovery gate; AR-17/18/21. |
| O11 | Single-store scope preserves tenant/RBAC isolation and does not authorize cross-store writes. No automatic clinical substitution or pharmacy approval. | #29/#33/#37; AR-03/04/11. |

## Observed current behavior (characterization is not approval)

| Observation / known gap | Concrete current source | Required treatment |
| --- | --- | --- |
| POS and general-order pricing convert Decimal to Number; POS split accepts a 0.01 tolerance. | backend/src/modules/pos/checkout.service.ts; orders/order.service.ts | AR-05/08 replace arithmetic under versioned policy. Do not turn existing tolerance into the oracle. |
| General order creation debits stock while order is pending; status PATCH alone does not reverse it; generic order lacks CheckoutCommand. | orders/order.service.ts | AR-06/08/11 preserve/explicitly migrate semantics, define subtype/dispatch, add idempotent commands. |
| Refund is a conditional completed→refunded status update, not an immutable date/amount/method allocation. | pos/checkout.service.ts::refundOrder | AR-08 captures real refund facts prospectively; legacy missing facts stay missing. |
| First shift close and settlement confirmation are CAS-protected by #178/#204. | shifts/shifts.service.ts; daily-settlements/daily-settlements.service.ts | Reuse, do not repeat. Native simultaneous HTTP/PG transition and checkout-vs-close cutoff still need evidence. |
| Initial batch receipt is atomic, but same-lot additional delivery hits unique conflict. Private CAS drafts do not post. | product-batches/product-batches.service.ts; receiving-drafts service | AR-09 adds formal partial deliveries with revision approval, not fake new lots. |
| Margin uses current product cost and host calendar helpers. Other reports include estimates/placeholder opening balances. | reports/margin.service.ts; cashflow.service.ts; analytics services | AR-12 links immutable historical facts; shadow diffs may correct known wrong behavior rather than require equality. |
| Invalid/missing accounting provider configuration falls back to mock; call occurs before sync log commit. | accounting/provider.factory.ts; accounting.service.ts | AR-17 fail-closed config and durable intent/attempt/reconcile. Not proof of a real external incident. |
| LINE routes can send live messages if configured; webhook logs follow events, not a durable inbox. | line/line.service.ts; line.controller.ts | AR-17/13; no live sends were made, deployment configuration is UNKNOWN. |
| Docker image entrypoint applies migrations before server startup. | backend/Dockerfile CMD | AR-20 separates controlled DDL, runtime role and version-readiness. Not run here. |
| No durable worker boot in server source; OCR evaluator is synthetic text only. | backend/src/server.ts; scripts/ocr-evaluation/evaluator.py | AR-13/15 implement actual worker/engine with independent evidence; no fictional installed OCR. |

## D01–D09: UNAPPROVED operating choices

Each decision is `UNAPPROVED`, with `approvalSource: null` in manifest.json.
Existing narrowly confirmed rules above are retained; they do not approve an
entire new finance/unit/hosting policy. Test profiles must explicitly identify
TEST_ONLY, chosen example values and prohibited operating use.

| Decision | Missing choice | Blocked activation | Safe preparation now |
| --- | --- | --- | --- |
| D01 | Currency/price/rate precision, limits, rounding order, discount allocation and change | New financial posting and reports | Exact decimal APIs, property tests and counterexamples |
| D02 | Refund period/day, cash/noncash/split/partial allocation and presentation | Refund facts and settlement policy | Fact schema, local-status compatibility, TEST_ONLY reconciliation |
| D03 | Historical cost source/layers and valuation | Financial margin, cost corrections | UNKNOWN provenance and additive snapshot contracts; FEFO is not accounting FIFO |
| D04 | Unit precision, package conversion and split dispensing | Affected unit/SKU posting | Preserve existing integer restrictions and approved mapping revisions |
| D05 | Physical return release, adjustment/opening discrepancy roles | Returned-stock re-release and affected inventory operations | Quarantine-only synthetic flows and audit/ACL tests |
| D06 | Rx role, access, formats, retention and cache/export policy | Real Rx storage/access/fulfillment | Synthetic evidence/ACL and manual review contracts |
| D07 | Final host/OS/resources, devices, operator and setup | Device and final-host use | Portable builds, print-disabled tests and reproducible device scripts |
| D08 | Backup fault domain, maintenance, RPO/RTO/retention | Store recovery acceptance | Owned synthetic restore and recovery-hold tooling |
| D09 | Calibrated workload, latency/resource budget and thresholds | Operational SLO/capacity claims | Reproducible 5k/50k/200k SKU test fixtures and measurement |

Original unresolved B2B pricing/ack/reservation timing, unknown or month-only
expiry handling, labeling-before-release and alert recipients/frequency remain
in the source requirements, not silently approved by these nine categories.
The 300ms lookup/1s checkout/20% OCR overhead figures in #202 are candidate
engineering targets, not approved SLOs. A missing device only blocks that device
result. No clinical, financial, hosting or activation decision is made by this file.
