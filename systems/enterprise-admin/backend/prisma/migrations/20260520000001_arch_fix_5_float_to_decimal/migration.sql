-- AF-15: Migrate all monetary fields from DOUBLE PRECISION (Float) to DECIMAL(12,4)
-- Rationale: IEEE 754 floating-point arithmetic causes rounding errors in POS checkout,
-- daily settlement, and financial reports. DECIMAL(12,4) stores exact values up to
-- 99,999,999.9999 — sufficient for TWD amounts at 4 decimal places of precision.
-- See ADR-010 (Float → Decimal migration).

-- products: cost_price, retail_price
ALTER TABLE "products"
  ALTER COLUMN "cost_price"   TYPE DECIMAL(12,4) USING "cost_price"::DECIMAL(12,4),
  ALTER COLUMN "retail_price" TYPE DECIMAL(12,4) USING "retail_price"::DECIMAL(12,4);

-- orders: total_amount, discount_amount
ALTER TABLE "orders"
  ALTER COLUMN "total_amount"    TYPE DECIMAL(12,4) USING "total_amount"::DECIMAL(12,4),
  ALTER COLUMN "discount_amount" TYPE DECIMAL(12,4) USING "discount_amount"::DECIMAL(12,4);

-- order_items: unit_price, final_unit_price
ALTER TABLE "order_items"
  ALTER COLUMN "unit_price"       TYPE DECIMAL(12,4) USING "unit_price"::DECIMAL(12,4),
  ALTER COLUMN "final_unit_price" TYPE DECIMAL(12,4) USING "final_unit_price"::DECIMAL(12,4);

-- expenses: amount
ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE DECIMAL(12,4) USING "amount"::DECIMAL(12,4);

-- shifts: opening_cash, closing_cash
ALTER TABLE "shifts"
  ALTER COLUMN "opening_cash" TYPE DECIMAL(12,4) USING "opening_cash"::DECIMAL(12,4),
  ALTER COLUMN "closing_cash" TYPE DECIMAL(12,4) USING "closing_cash"::DECIMAL(12,4);

-- product_batches: cost_price
ALTER TABLE "product_batches"
  ALTER COLUMN "cost_price" TYPE DECIMAL(12,4) USING "cost_price"::DECIMAL(12,4);

-- daily_settlements: total_sales, cash_amount, card_amount, line_pay_amount, other_amount
ALTER TABLE "daily_settlements"
  ALTER COLUMN "total_sales"     TYPE DECIMAL(12,4) USING "total_sales"::DECIMAL(12,4),
  ALTER COLUMN "cash_amount"     TYPE DECIMAL(12,4) USING "cash_amount"::DECIMAL(12,4),
  ALTER COLUMN "card_amount"     TYPE DECIMAL(12,4) USING "card_amount"::DECIMAL(12,4),
  ALTER COLUMN "line_pay_amount" TYPE DECIMAL(12,4) USING "line_pay_amount"::DECIMAL(12,4),
  ALTER COLUMN "other_amount"    TYPE DECIMAL(12,4) USING "other_amount"::DECIMAL(12,4);
