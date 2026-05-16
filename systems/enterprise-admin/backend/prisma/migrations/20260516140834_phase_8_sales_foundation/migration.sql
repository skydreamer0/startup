-- DropForeignKey
ALTER TABLE "roles" DROP CONSTRAINT "roles_tenant_id_fkey";

-- DropIndex
DROP INDEX "customers_line_uid_key";

-- DropIndex
DROP INDEX "customers_phone_key";

-- DropIndex
DROP INDEX "product_categories_name_key";

-- DropIndex
DROP INDEX "products_sku_key";

-- DropIndex
DROP INDEX "roles_name_key";

-- DropIndex
DROP INDEX "tags_name_key";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_number" TEXT,
ADD COLUMN     "order_type" TEXT NOT NULL DEFAULT 'WALK_IN',
ADD COLUMN     "payment_method" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "shift_id" TEXT;

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "tenant_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opening_cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closing_cash" DOUBLE PRECISION,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_batches" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "cost_price" DOUBLE PRECISION NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_settlements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "total_sales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "cash_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "card_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "line_pay_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "other_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "daily_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shifts_tenant_id_idx" ON "shifts"("tenant_id");

-- CreateIndex
CREATE INDEX "shifts_staff_id_idx" ON "shifts"("staff_id");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE INDEX "product_batches_tenant_id_idx" ON "product_batches"("tenant_id");

-- CreateIndex
CREATE INDEX "product_batches_product_id_idx" ON "product_batches"("product_id");

-- CreateIndex
CREATE INDEX "product_batches_expiry_date_idx" ON "product_batches"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "product_batches_product_id_batch_number_tenant_id_key" ON "product_batches"("product_id", "batch_number", "tenant_id");

-- CreateIndex
CREATE INDEX "daily_settlements_tenant_id_idx" ON "daily_settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "daily_settlements_date_idx" ON "daily_settlements"("date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_settlements_shift_id_date_key" ON "daily_settlements"("shift_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_tenant_id_key" ON "customers"("phone", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_line_uid_tenant_id_key" ON "customers"("line_uid", "tenant_id");

-- CreateIndex
CREATE INDEX "orders_shift_id_idx" ON "orders"("shift_id");

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_tenant_id_key" ON "product_categories"("name", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_tenant_id_key" ON "products"("sku", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_tenant_id_key" ON "roles"("name", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_tenant_id_key" ON "tags"("name", "tenant_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_settlements" ADD CONSTRAINT "daily_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_settlements" ADD CONSTRAINT "daily_settlements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
