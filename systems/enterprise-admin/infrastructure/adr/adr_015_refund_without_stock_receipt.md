# ADR-015: Refund registration does not receive physical stock

## Status

Accepted — 2026-10-06. A further #29 safety slice following ADR-014.

## Context

The POS refund endpoint previously incremented Product.stockQuantity and wrote
an IN movement without receiving goods, identifying their lots or validating
their condition. Product and batch balances diverged. Concurrent refunds both
passed a completed-status read and could increment stock twice. Cashier UI text
incorrectly promised automatic stock restoration.

## Decision

- `POST /pos/orders/:orderId/refund` registers a full monetary refund status only.
  It leaves product/batch balances, original OUT movements and allocations
  unchanged, including historical orders without traceable lots.
- Keep the existing caller-owned transaction and require a tenant-scoped
  conditional `completed -> refunded` update. Concurrent requests that both read
  completed allow one transition; the loser receives 409. Requests already seeing
  refunded receive the existing 400 response and cannot replace the first reason.
- Preserve the original discount note and append the refund reason, returning
  the updated stored order. Validate UUID and optional trimmed reason (max 1000
  characters). Keep existing authentication and `manage:pos` permission.
- Rename the POS action, confirmation, success message and shift report labels
  to refund registration. Explain that a physical return needs separate receipt
  and inspection. This action does not claim to execute a card/LINE Pay transfer.

## Consequences and remaining scope

Money-only refunds no longer create fictitious inventory. Cashiers must not use
this action as a stock-receipt shortcut. Partial physical return quantities,
quarantine receipt, approved release, return command dedupe and linked reversal
records remain #29/#30 follow-up work; no physical-return API is introduced here.
Existing refunded orders and past erroneous IN movements are not silently
rewritten. A reconciliation must identify those legacy inconsistencies.

The reason is still stored in the existing discount-note field as a transitional
compatibility measure, not an immutable refund ledger. Payment status/provider
execution, command result recovery and financial ledger redesign remain outside
this safety correction. Full G1/G2/G4 acceptance and parent Issue closure are not
implied.
