-- Add receipt identity without changing balances or inventing historical lots.
ALTER TABLE "inventory_transactions"
ADD COLUMN "batch_id" TEXT,
ADD COLUMN "cost_price_at_receipt" DECIMAL(12,4);

CREATE INDEX "inventory_transactions_tenant_id_batch_id_idx"
ON "inventory_transactions"("tenant_id", "batch_id");

ALTER TABLE "inventory_transactions"
ADD CONSTRAINT "inventory_transactions_receipt_batch_fkey"
FOREIGN KEY ("batch_id", "product_id", "tenant_id")
REFERENCES "product_batches"("id", "product_id", "tenant_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_transactions"
ADD CONSTRAINT "inventory_transactions_receipt_check"
CHECK ("batch_id" IS NULL OR
  ("type" = 'IN' AND "quantity" > 0 AND "cost_price_at_receipt" IS NOT NULL AND "cost_price_at_receipt" >= 0));
