-- Additive only: never rename old orders or reinterpret their historical date.
-- Lock covers duplicate preflight, uniqueness and counter seeding atomically.
BEGIN;
LOCK TABLE "orders" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE duplicates JSONB;
BEGIN
  SELECT jsonb_agg(to_jsonb(d)) INTO duplicates FROM (
    SELECT tenant_id, order_number, count(*) AS occurrences, array_agg(id ORDER BY id) AS order_ids
    FROM orders WHERE order_number IS NOT NULL
    GROUP BY tenant_id, order_number HAVING count(*) > 1
  ) d;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate tenant/order numbers prevent migration; no old orders were changed'
      USING DETAIL = duplicates::text,
      HINT = 'Run prisma/diagnostics/preflight-order-numbers.sql and resolve explicitly before retrying.';
  END IF;
END $$;

ALTER TABLE "orders" ADD COLUMN "business_date" DATE;
CREATE UNIQUE INDEX "orders_tenant_id_order_number_key" ON "orders"("tenant_id", "order_number");

CREATE TABLE "order_number_counters" (
  "tenant_id" TEXT NOT NULL,
  "business_date" DATE NOT NULL,
  "last_sequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "order_number_counters_pkey" PRIMARY KEY ("tenant_id", "business_date"),
  CONSTRAINT "order_number_counters_sequence_check" CHECK ("last_sequence" BETWEEN 0 AND 99999),
  CONSTRAINT "order_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve the date PRINTED on a legacy POS number (including its former UTC
-- meaning). Validate calendar components without throwing on malformed numbers.
-- An existing overflow suffix exhausts that printed date instead of wrapping.
WITH candidates AS (
  SELECT tenant_id, substring(order_number, 5, 8) AS printed_date,
    substring(order_number, 14) AS suffix
  FROM orders WHERE order_number ~ '^POS-[0-9]{8}-[0-9]{5,}$'
), parsed AS (
  SELECT *, CASE
    WHEN substring(printed_date, 1, 4)::int BETWEEN 1 AND 9999
     AND substring(printed_date, 5, 2)::int BETWEEN 1 AND 12
     AND substring(printed_date, 7, 2)::int BETWEEN 1 AND 31
    THEN make_date(substring(printed_date, 1, 4)::int, substring(printed_date, 5, 2)::int, 1)
      + (substring(printed_date, 7, 2)::int - 1)
    END AS business_date
  FROM candidates
)
INSERT INTO order_number_counters (tenant_id, business_date, last_sequence)
SELECT tenant_id, business_date,
  max(CASE WHEN length(suffix) > 5 THEN 99999 ELSE suffix::int END)
FROM parsed WHERE to_char(business_date, 'YYYYMMDD') = printed_date
GROUP BY tenant_id, business_date;
COMMIT;
