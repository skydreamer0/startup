-- Fail closed: existing batches have no recorded release decision. Leave them
-- quarantined until reviewed; never fabricate allocations for historical orders.
-- CreateEnum
CREATE TYPE "BatchStockStatus" AS ENUM ('RELEASED', 'QUARANTINE', 'BLOCKED');

-- AlterTable
ALTER TABLE "product_batches" ADD COLUMN     "status" "BatchStockStatus" NOT NULL DEFAULT 'QUARANTINE';

-- CreateTable
CREATE TABLE "sale_batch_allocations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "movement_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiry_date_at_sale" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_batch_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_positive_quantity" CHECK ("quantity" > 0);

-- CreateIndex
CREATE INDEX "sale_batch_allocations_tenant_id_order_id_idx" ON "sale_batch_allocations"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "sale_batch_allocations_tenant_id_batch_id_idx" ON "sale_batch_allocations"("tenant_id", "batch_id");

-- CreateIndex
CREATE INDEX "sale_batch_allocations_movement_id_idx" ON "sale_batch_allocations"("movement_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_batch_allocations_order_item_id_batch_id_key" ON "sale_batch_allocations"("order_item_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_id_tenant_id_key" ON "orders"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_id_order_id_product_id_key" ON "order_items"("id", "order_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transactions_id_product_id_tenant_id_key" ON "inventory_transactions"("id", "product_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_id_product_id_tenant_id_key" ON "product_batches"("id", "product_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_order_item_id_order_id_product_id_fkey" FOREIGN KEY ("order_item_id", "order_id", "product_id") REFERENCES "order_items"("id", "order_id", "product_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_batch_id_product_id_tenant_id_fkey" FOREIGN KEY ("batch_id", "product_id", "tenant_id") REFERENCES "product_batches"("id", "product_id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_batch_allocations" ADD CONSTRAINT "sale_batch_allocations_movement_id_product_id_tenant_id_fkey" FOREIGN KEY ("movement_id", "product_id", "tenant_id") REFERENCES "inventory_transactions"("id", "product_id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
