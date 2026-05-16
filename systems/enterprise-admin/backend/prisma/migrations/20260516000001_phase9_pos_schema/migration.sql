-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discount_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "final_unit_price" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "discount_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "discount_note" TEXT,
ADD COLUMN     "sales_staff_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employee_code" TEXT;

-- CreateIndex
CREATE INDEX "orders_sales_staff_id_idx" ON "orders"("sales_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_staff_id_fkey" FOREIGN KEY ("sales_staff_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
