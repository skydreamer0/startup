-- Read-only. Run explicitly against an authorized staging copy:
-- psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f prisma/diagnostics/preflight-order-numbers.sql
-- No automatic remediation, legacy renumbering, or business-date backfill.
BEGIN TRANSACTION READ ONLY;
SELECT tenant_id, order_number, count(*) AS occurrences, array_agg(id ORDER BY id) AS order_ids
FROM orders WHERE order_number IS NOT NULL
GROUP BY tenant_id, order_number HAVING count(*) > 1
ORDER BY tenant_id, order_number;

-- Nonstandard POS numbers require human interpretation, never silent rewriting.
WITH candidates AS (
  SELECT id, tenant_id, order_number,
    CASE WHEN order_number ~ '^POS-[0-9]{8}-[0-9]{5}$' THEN substring(order_number, 5, 8) END AS printed_date
  FROM orders WHERE order_number LIKE 'POS-%'
), parsed AS (
  SELECT *, CASE
    WHEN substring(printed_date, 1, 4)::int BETWEEN 1 AND 9999
     AND substring(printed_date, 5, 2)::int BETWEEN 1 AND 12
     AND substring(printed_date, 7, 2)::int BETWEEN 1 AND 31
    THEN make_date(substring(printed_date, 1, 4)::int, substring(printed_date, 5, 2)::int, 1)
      + (substring(printed_date, 7, 2)::int - 1)
    END AS parsed_date
  FROM candidates
)
SELECT id, tenant_id, order_number FROM parsed
WHERE printed_date IS NULL OR parsed_date IS NULL OR to_char(parsed_date, 'YYYYMMDD') <> printed_date
ORDER BY tenant_id, order_number, id;
ROLLBACK;
