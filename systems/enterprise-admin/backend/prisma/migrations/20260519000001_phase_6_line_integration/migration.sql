-- AlterTable
ALTER TABLE "customers" ADD COLUMN "line_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_line_user_id_key" ON "customers"("line_user_id");

-- CreateTable
CREATE TABLE "message_broadcasts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target_segment" TEXT NOT NULL,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "message_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_broadcasts_tenant_id_idx" ON "message_broadcasts"("tenant_id");

-- CreateIndex
CREATE INDEX "message_broadcasts_created_at_idx" ON "message_broadcasts"("created_at");

-- AddForeignKey
ALTER TABLE "message_broadcasts" ADD CONSTRAINT "message_broadcasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
