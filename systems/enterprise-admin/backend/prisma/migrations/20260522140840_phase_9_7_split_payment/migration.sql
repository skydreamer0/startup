-- CreateTable
CREATE TABLE "order_payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(12,4) NOT NULL,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_payments_order_id_idx" ON "order_payments"("order_id");

-- CreateIndex
CREATE INDEX "order_payments_tenant_id_idx" ON "order_payments"("tenant_id");

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
