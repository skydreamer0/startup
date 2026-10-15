# ADR-023: Local BLE medicine label bridge

## Status

Proposed, pending exact production-origin/browser and physical local-API acceptance.

## Context

The DELI DL-720W NEW was physically verified through a Windows Python/Bleak TSPL path for English, Traditional Chinese, two consecutive labels, reconnect, and the corrected QR layout. Its Code128 scan and local HTTP API physical output remain unverified. STARTUP's existing POS receipt path is WebUSB/browser printing and serves a different printer/workflow. The cloud backend cannot address a cashier workstation's loopback listener.

## Decision

Keep the tested Python renderer, TSPL serializer and BLE transport as an independently installed Windows `local-print-agent/`. Product owns optional, pharmacist-reviewed strength, dosage form, generic name, NHI code and complete licence number. Existing records remain null until reviewed; the admin product editor accepts these fields. The product list opens a medicine identity label only when these fields, name and a valid SKU are present. The physical stock and job are 50 × 30 mm / 400 × 240 dots. The operator preview is upright; the TSPL bitmap is rotated 180° relative to it, following the operator's choice of numbered physical probe 2 on 2026-10-15. The QR carries only `P1:<SKU>` for the pharmacy's internal lookup; it is not a manufacturer GS1 code or a batch identifier. A session-only user-entered local token authorizes exact-origin loopback requests. Dry run returns the upright preview and the exact job SHA-256; a separate explicit confirmation sends one copy with the approved hash and a single idempotency key. The UI requires `medicine-landscape-v2` to reject an older agent's wrong orientation. The UI reports queued, transport-submitted and ambiguous outcomes distinctly. Printing does not mutate receipts, carts or inventory.

The local agent binds only to 127.0.0.1, checks Host, exact Origin and bearer token, starts with physical printing disabled, serializes jobs and persists idempotency reservations before queueing. Explicit HTTPS origins support a deployed admin UI. No wildcard CORS, raw printer commands or automatic resend.

## Consequences and limits

The printer integration is Windows workstation software with a separate Python dependency boundary. The earlier v1 local API produced one label with the wrong orientation. Both numbered direct BLE probes acknowledged all 12,056 bytes; the operator reported probe 2 correct. The final v2 local API and deployed-browser path have not yet been physically rechecked. Packaging/auto-start, exact deployed origin and browser local-network permission remain deployment work. The current output is an internal product-identification label, not a dispensing label; it does not include patient directions, lot or expiry. Manufacturer barcode/DataMatrix recognition, official-source candidate matching, internal `P1` scan lookup and batch identity remain separate workflows. Code128 is omitted pending decode acceptance. Rust/Go replacement has no demonstrated need; it would reset protocol and device acceptance evidence. Reconsider only on measured install, memory, startup or reliability constraints, with parity and new physical verification.
