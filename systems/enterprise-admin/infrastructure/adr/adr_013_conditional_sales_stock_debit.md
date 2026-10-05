# ADR-013: Conditional Sales Stock Debit

**Date:** 2026-10-06
**Status:** Accepted
**Tracking:** [#29](https://github.com/skydreamer0/startup/issues/29), [#30](https://github.com/skydreamer0/startup/issues/30), [#37](https://github.com/skydreamer0/startup/issues/37)

## Context

The existing POS checkout and general order services already own Prisma transactions. Their stock checks were separate from unconditional decrements. Real PostgreSQL tests reproduced overselling when both transactions read the last unit, aggregate duplicate demand exceeding stock, and POS duplicate lines debiting the same batch twice.

The complete InventoryPostingService and CheckoutCommand remain pending. This first slice must repair the existing sale paths without prematurely deciding expiry-day rules, base units, money rounding, or a new ledger schema.

## Decision

1. Both sale paths call `backend/src/lib/sale-stock.ts` inside their existing transaction. The helper requires tenant context, validates positive integer quantities within the PostgreSQL `Int` range, and aggregates quantity by product ID. It retains the original sale lines and their discounts for order creation.
2. Process product IDs in ascending order. Debit each projection with `UPDATE ... WHERE tenant_id = ... AND stock_quantity >= demand`; exactly one affected row is required. PostgreSQL Read Committed re-evaluates the predicate after waiting for a concurrent updater. A failed claim rejects the sale; the caller's transaction rolls back all prior claims.
3. POS debits each selected batch immediately, with explicit tenant/product scope and `quantity >= debit`. Later duplicate lines read the transaction's updated batch quantities. FEFO ordering is deterministic by expiry, received time, then ID. Orders, payment records when supplied, and existing inventory movement records remain inside the same transaction.
4. Do not open a transaction or commit inside the helper. Do not automatically retry the whole checkout: durable command identity and unknown-result recovery are still missing.
5. No schema migration or request/response shape changes in this slice. Validate using the existing PostgreSQL 15 schema and real concurrent service calls, not mocked balances.

## Consequences and limits

- Participating POS/general-order sales cannot decrement the same product projection below zero. Positive duplicate lines share one total demand; POS lines also share updated batch availability.
- General orders still debit only the product projection. Batch posting/traceability for that path, allocation persistence, eligibility/expiry rules, refund safety, adjustment/import cutover, command dedupe, unique order numbers, and exact money remain active work.
- Direct product/batch edits and Excel imports do not yet participate in this boundary. They can overwrite or diverge balances. This slice is not G1/G2 completion or authorization to use the system as reliable production stock authority.
- Consistent product order reduces deadlock risk between participating sale paths. It does not prove every other writer follows that order; lock timeouts/deadlocks remain transaction failures, without transparent retries.
- No historical batch allocations are inferred or fabricated.

## Verification

`backend/src/__tests__/stock-contention.integration.test.ts` uses real PostgreSQL queries. A test-only query extension synchronizes reads so competing callers both observe the old balance; it does not substitute results or mock writes. Coverage includes POS/POS and POS/general-order contention, duplicate aggregate demand, line discounts and batch sharing, transaction rollback, invalid quantities, tenant scope, and opposite cart orders. Full command dedupe, allocation, monetary, and mixed adjustment/import gates remain unverified.

## Reference

[PostgreSQL 15 Read Committed semantics](https://www.postgresql.org/docs/15/transaction-iso.html#XACT-READ-COMMITTED).
