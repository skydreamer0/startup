# ADR-023: Local BLE medicine label bridge

## Status

Proposed, pending exact production-origin/browser and physical local-API acceptance.

## Context

The DELI DL-720W NEW was physically verified through a Windows Python/Bleak TSPL path for English, Traditional Chinese, two consecutive labels, reconnect, and the corrected QR layout. Its Code128 scan and local HTTP API physical output remain unverified. STARTUP's existing POS receipt path is WebUSB/browser printing and serves a different printer/workflow. The cloud backend cannot address a cashier workstation's loopback listener.

## Decision

Keep the tested Python renderer, TSPL serializer and BLE transport as an independently installed Windows `local-print-agent/`. The admin product list opens a medicine/product label draft populated from the selected Product name and SKU. A session-only user-entered local token authorizes exact-origin loopback requests. Dry run returns the same raster image and job SHA-256; a separate explicit confirmation sends one copy with the approved hash and a single idempotency key. The UI reports queued, transport-submitted and ambiguous outcomes distinctly. No receipt, cart, database, inventory or backend API mutation occurs.

The local agent binds only to 127.0.0.1, checks Host, exact Origin and bearer token, starts with physical printing disabled, serializes jobs and persists idempotency reservations before queueing. Explicit HTTPS origins support a deployed admin UI. No wildcard CORS, raw printer commands or automatic resend.

## Consequences and limits

The printer integration is Windows workstation software with a separate Python dependency boundary. Packaging/auto-start, exact deployed origin, browser local-network permission and physical API print acceptance remain deployment work. Product lacks dosage, patient directions, verified manufacturer barcode and other regulated label fields; the current output is a reviewed product-identification draft, not a dispensing label. QR is user-entered only. Code128 is omitted pending decode acceptance. Rust/Go replacement has no demonstrated need; it would reset protocol and device acceptance evidence. Reconsider only on measured install, memory, startup or reliability constraints, with parity and new physical verification.
