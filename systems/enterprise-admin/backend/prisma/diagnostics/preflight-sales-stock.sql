-- Read-only preflight, compatible with the schema before/after ADR-014.
-- Run on a staging copy before enabling sales; a result is an unresolved
-- discrepancy to count/review, never an instruction to invent a batch.
SELECT p.tenant_id, p.id AS product_id, p.sku,
       p.stock_quantity AS product_quantity,
       COALESCE(SUM(b.quantity), 0) AS batch_quantity,
       p.stock_quantity - COALESCE(SUM(b.quantity), 0) AS difference,
       COUNT(b.id) AS batch_count
FROM products p
LEFT JOIN product_batches b ON b.product_id = p.id AND b.tenant_id = p.tenant_id
GROUP BY p.tenant_id, p.id, p.sku, p.stock_quantity
HAVING p.stock_quantity <> COALESCE(SUM(b.quantity), 0)
    OR p.stock_quantity < 0 OR BOOL_OR(b.quantity < 0)
ORDER BY p.tenant_id, p.sku;
