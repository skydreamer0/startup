-- CreateTable
CREATE TABLE "accounting_sync_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "external_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_sync_logs_tenant_id_entity_type_entity_id_idx" ON "accounting_sync_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "accounting_sync_logs_tenant_id_idx" ON "accounting_sync_logs"("tenant_id");

-- AddForeignKey
ALTER TABLE "accounting_sync_logs" ADD CONSTRAINT "accounting_sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
