-- CreateEnum
CREATE TYPE "CheckoutCommandStatus" AS ENUM ('PENDING', 'SUCCEEDED');

-- CreateTable
CREATE TABLE "checkout_commands" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "command_id" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" "CheckoutCommandStatus" NOT NULL DEFAULT 'PENDING',
    "order_id" TEXT,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "checkout_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "checkout_commands_tenant_id_kind_command_id_key" ON "checkout_commands"("tenant_id", "kind", "command_id");

-- AddForeignKey
ALTER TABLE "checkout_commands" ADD CONSTRAINT "checkout_commands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_commands" ADD CONSTRAINT "checkout_commands_order_id_tenant_id_fkey" FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "checkout_commands" ADD CONSTRAINT "checkout_commands_result_state_check" CHECK (
    ("status" = 'PENDING' AND "order_id" IS NULL AND "result" IS NULL AND "completed_at" IS NULL)
    OR ("status" = 'SUCCEEDED' AND "order_id" IS NOT NULL AND "completed_at" IS NOT NULL
        AND "result" IS NOT NULL AND jsonb_typeof("result") = 'object'
        AND "result"->>'id' IS NOT NULL AND "result"->>'id' = "order_id")
);
