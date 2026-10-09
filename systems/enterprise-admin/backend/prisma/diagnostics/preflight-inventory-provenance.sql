-- Current-schema, read-only diagnostic for #29 AC8 / #37 G2 preparation only.
-- One SELECT gives every section the same statement snapshot. Run within the
-- READ ONLY / REPEATABLE READ wrapper and timeouts in the verification README.
-- This administrative report includes ALL tenants on the authorized copy; it is
-- not an API or an authorization boundary. Every relationship is tenant-scoped.
-- Quantities/counts are decimal strings in JSON to preserve exact integers.
-- No opening baseline exists: matching numbers NEVER establish historical
-- reconciliation. Unsupported movements are not assigned a guessed sign.
WITH
allocation_links AS (
  SELECT a.*, m.type AS movement_type, m.reference_id,
    (m.id IS NOT NULL AND m.type = 'OUT' AND m.quantity > 0
      AND m.reference_id = a.order_id AND o.id IS NOT NULL
      AND i.id IS NOT NULL AND b.id IS NOT NULL AND p.id IS NOT NULL
      AND a.quantity > 0) IS TRUE AS source_linked
  FROM public.sale_batch_allocations a
  LEFT JOIN public.inventory_transactions m ON m.id = a.movement_id
    AND m.product_id = a.product_id AND m.tenant_id = a.tenant_id
  LEFT JOIN public.orders o ON o.id = a.order_id AND o.tenant_id = a.tenant_id
  LEFT JOIN public.order_items i ON i.id = a.order_item_id
    AND i.order_id = o.id AND i.product_id = a.product_id
  LEFT JOIN public.product_batches b ON b.id = a.batch_id
    AND b.product_id = a.product_id AND b.tenant_id = a.tenant_id
  LEFT JOIN public.products p ON p.id = a.product_id AND p.tenant_id = a.tenant_id
),
batch_totals AS (
  SELECT tenant_id, product_id, SUM(quantity::numeric) AS quantity,
    COUNT(*) AS count, COUNT(*) FILTER (WHERE quantity < 0) AS negative_count
  FROM public.product_batches GROUP BY tenant_id, product_id
),
batch_receipts AS (
  SELECT m.tenant_id, m.product_id, m.batch_id,
    SUM(m.quantity::numeric) AS quantity, COUNT(*) AS count
  FROM public.inventory_transactions m
  JOIN public.product_batches b ON b.id = m.batch_id
    AND b.product_id = m.product_id AND b.tenant_id = m.tenant_id
  WHERE m.type = 'IN' AND m.quantity > 0
  GROUP BY m.tenant_id, m.product_id, m.batch_id
),
batch_sales AS (
  SELECT tenant_id, product_id, batch_id,
    SUM(quantity::numeric) FILTER (WHERE source_linked) AS quantity,
    COUNT(*) FILTER (WHERE source_linked) AS count,
    COUNT(*) FILTER (WHERE NOT source_linked) AS unlinked_count
  FROM allocation_links GROUP BY tenant_id, product_id, batch_id
),
movement_allocations AS (
  SELECT tenant_id, product_id, movement_id,
    SUM(quantity::numeric) AS quantity, COUNT(*) AS count,
    COUNT(*) FILTER (WHERE NOT source_linked) AS unlinked_count
  FROM allocation_links GROUP BY tenant_id, product_id, movement_id
),
item_allocations AS (
  SELECT tenant_id, product_id, order_id, order_item_id,
    SUM(quantity::numeric) AS quantity, COUNT(*) AS count,
    COUNT(*) FILTER (WHERE NOT source_linked) AS unlinked_count
  FROM allocation_links GROUP BY tenant_id, product_id, order_id, order_item_id
),
report AS (
  SELECT 'product' AS section, p.tenant_id, p.id AS product_id, p.id AS record_id,
    jsonb_build_object(
      'sku', p.sku,
      'product_quantity', p.stock_quantity::text,
      'batch_quantity', COALESCE(b.quantity, 0)::text,
      'difference', (p.stock_quantity::numeric - COALESCE(b.quantity, 0))::text,
      'batch_count', COALESCE(b.count, 0)::text,
      'quantity_status', CASE WHEN p.stock_quantity::numeric = COALESCE(b.quantity, 0)
        THEN 'CURRENT_QUANTITIES_EQUAL_HISTORY_UNVERIFIED' ELSE 'CURRENT_QUANTITY_DIFFERENCE' END,
      'history_status', 'UNKNOWN_NO_VERIFIED_OPENING_BASELINE',
      'issues', array_remove(ARRAY[
        'NO_VERIFIED_OPENING_BASELINE',
        CASE WHEN p.stock_quantity < 0 THEN 'NEGATIVE_PRODUCT_QUANTITY' END,
        CASE WHEN b.negative_count > 0 THEN 'NEGATIVE_BATCH_QUANTITY' END,
        CASE WHEN b.count IS NULL AND p.stock_quantity <> 0 THEN 'STOCK_WITHOUT_BATCH' END
      ], NULL)
    ) AS details
  FROM public.products p
  LEFT JOIN batch_totals b ON b.tenant_id = p.tenant_id AND b.product_id = p.id
  UNION ALL
  SELECT 'batch', b.tenant_id, b.product_id, b.id,
    jsonb_build_object(
      'batch_number', b.batch_number, 'status', b.status,
      'expiry_date', b.expiry_date, 'quantity', b.quantity::text,
      'linked_in_quantity', COALESCE(r.quantity, 0)::text,
      'linked_in_count', COALESCE(r.count, 0)::text,
      'linked_sale_quantity', COALESCE(s.quantity, 0)::text,
      'linked_sale_count', COALESCE(s.count, 0)::text,
      'unlinked_allocation_count', COALESCE(s.unlinked_count, 0)::text,
      'linked_evidence_net_quantity', (COALESCE(r.quantity, 0) - COALESCE(s.quantity, 0))::text,
      'difference_from_linked_evidence', (b.quantity::numeric - COALESCE(r.quantity, 0) + COALESCE(s.quantity, 0))::text,
      'history_status', 'UNKNOWN_NO_VERIFIED_OPENING_BASELINE',
      'issues', array_remove(ARRAY[
        CASE WHEN p.id IS NULL THEN 'PRODUCT_TENANT_LINK_MISSING' END,
        CASE WHEN b.quantity < 0 THEN 'NEGATIVE_BATCH_QUANTITY' END,
        CASE WHEN r.count IS NULL THEN 'UNKNOWN_RECEIPT_SOURCE' END,
        CASE WHEN b.quantity::numeric <> COALESCE(r.quantity, 0) - COALESCE(s.quantity, 0)
          THEN 'DIFFERENCE_FROM_LINKED_EVIDENCE' END,
        CASE WHEN s.unlinked_count > 0 THEN 'UNLINKED_SALE_ALLOCATION' END
      ], NULL)
    )
  FROM public.product_batches b
  LEFT JOIN public.products p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
  LEFT JOIN batch_receipts r ON r.tenant_id = b.tenant_id AND r.product_id = b.product_id AND r.batch_id = b.id
  LEFT JOIN batch_sales s ON s.tenant_id = b.tenant_id AND s.product_id = b.product_id AND s.batch_id = b.id
  UNION ALL
  SELECT 'movement', m.tenant_id, m.product_id, m.id,
    jsonb_build_object(
      'type', m.type, 'quantity', m.quantity::text,
      'batch_id', m.batch_id, 'reference_id', m.reference_id,
      'allocated_quantity', COALESCE(a.quantity, 0)::text,
      'allocation_count', COALESCE(a.count, 0)::text,
      'out_allocation_difference', CASE WHEN m.type = 'OUT'
        THEN (m.quantity::numeric - COALESCE(a.quantity, 0))::text END,
      'issues', array_remove(ARRAY[
        CASE WHEN p.id IS NULL THEN 'PRODUCT_TENANT_LINK_MISSING' END,
        CASE WHEN m.quantity <= 0 THEN 'NONPOSITIVE_MOVEMENT_QUANTITY' END,
        CASE WHEN m.type NOT IN ('IN', 'OUT') THEN 'UNKNOWN_UNSUPPORTED_MOVEMENT_TYPE' END,
        CASE WHEN m.type = 'IN' AND b.id IS NULL THEN 'UNKNOWN_RECEIPT_SOURCE' END,
        CASE WHEN m.type = 'OUT' AND o.id IS NULL THEN 'UNKNOWN_ORDER_SOURCE' END,
        CASE WHEN m.type = 'OUT' AND a.count IS NULL THEN 'UNKNOWN_SALE_ALLOCATION' END,
        CASE WHEN m.type = 'OUT' AND m.quantity::numeric <> COALESCE(a.quantity, 0)
          THEN 'OUT_ALLOCATION_QUANTITY_MISMATCH' END,
        CASE WHEN a.unlinked_count > 0 THEN 'UNLINKED_SALE_ALLOCATION' END
      ], NULL)
    )
  FROM public.inventory_transactions m
  LEFT JOIN public.products p ON p.id = m.product_id AND p.tenant_id = m.tenant_id
  LEFT JOIN public.product_batches b ON b.id = m.batch_id AND b.product_id = m.product_id AND b.tenant_id = m.tenant_id
  LEFT JOIN public.orders o ON o.id = m.reference_id AND o.tenant_id = m.tenant_id
  LEFT JOIN movement_allocations a ON a.movement_id = m.id AND a.product_id = m.product_id AND a.tenant_id = m.tenant_id
  UNION ALL
  SELECT 'order_item', o.tenant_id, i.product_id, i.id,
    jsonb_build_object(
      'order_id', o.id, 'order_status', o.status, 'quantity', i.quantity::text,
      'allocated_quantity', COALESCE(a.quantity, 0)::text,
      'allocation_count', COALESCE(a.count, 0)::text,
      'difference', (i.quantity::numeric - COALESCE(a.quantity, 0))::text,
      'issues', array_remove(ARRAY[
        CASE WHEN p.id IS NULL THEN 'PRODUCT_TENANT_LINK_MISSING' END,
        CASE WHEN i.quantity <= 0 THEN 'NONPOSITIVE_ORDER_ITEM_QUANTITY' END,
        CASE WHEN a.count IS NULL THEN 'UNKNOWN_ORDER_ITEM_ALLOCATION' END,
        CASE WHEN i.quantity::numeric <> COALESCE(a.quantity, 0) THEN 'ORDER_ITEM_ALLOCATION_QUANTITY_MISMATCH' END,
        CASE WHEN a.unlinked_count > 0 THEN 'UNLINKED_SALE_ALLOCATION' END
      ], NULL)
    )
  FROM public.order_items i
  JOIN public.orders o ON o.id = i.order_id
  LEFT JOIN public.products p ON p.id = i.product_id AND p.tenant_id = o.tenant_id
  LEFT JOIN item_allocations a ON a.tenant_id = o.tenant_id AND a.product_id = i.product_id
    AND a.order_id = o.id AND a.order_item_id = i.id
  UNION ALL
  SELECT 'allocation', a.tenant_id, a.product_id, a.id,
    jsonb_build_object(
      'order_id', a.order_id, 'order_item_id', a.order_item_id,
      'batch_id', a.batch_id, 'movement_id', a.movement_id,
      'quantity', a.quantity::text, 'source_linked', a.source_linked,
      'issues', CASE WHEN a.source_linked THEN ARRAY[]::text[] ELSE ARRAY['UNLINKED_SALE_ALLOCATION'] END
    )
  FROM allocation_links a
)
SELECT section, tenant_id, product_id, record_id, details
FROM report
ORDER BY tenant_id COLLATE "C", product_id COLLATE "C", section COLLATE "C", record_id COLLATE "C";
