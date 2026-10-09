-- CreateEnum
CREATE TYPE "ProductBatchChangeOperation" AS ENUM ('STATUS', 'EXPIRY', 'COST', 'INITIAL_RELEASE');

-- CreateTable
CREATE TABLE "product_batch_changes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "operation" "ProductBatchChangeOperation" NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_batch_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_batch_changes_history_idx" ON "product_batch_changes"("tenant_id", "batch_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "product_batch_changes_tenant_id_product_id_idx" ON "product_batch_changes"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "product_batch_changes_tenant_id_actor_id_idx" ON "product_batch_changes"("tenant_id", "actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_tenant_id_key" ON "users"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_id_tenant_id_key" ON "products"("id", "tenant_id");

-- AddForeignKey
ALTER TABLE "product_batch_changes" ADD CONSTRAINT "product_batch_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_batch_changes" ADD CONSTRAINT "product_batch_changes_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_batch_changes" ADD CONSTRAINT "product_batch_changes_batch_id_product_id_tenant_id_fkey" FOREIGN KEY ("batch_id", "product_id", "tenant_id") REFERENCES "product_batches"("id", "product_id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_batch_changes" ADD CONSTRAINT "product_batch_changes_actor_id_tenant_id_fkey" FOREIGN KEY ("actor_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- No backfill, stock rewrite, role grants or changes to existing posting rows.
-- Exact snapshot shape; strings preserve decimal precision and UTC ISO dates.
CREATE FUNCTION batch_change_valid_snapshot(snapshot JSONB) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(
    jsonb_typeof(snapshot) = 'object'
    AND snapshot ?& ARRAY['status', 'expiryDate', 'costPrice']
    AND snapshot - ARRAY['status', 'expiryDate', 'costPrice'] = '{}'::jsonb
    AND jsonb_typeof(snapshot->'status') = 'string'
    AND snapshot->>'status' IN ('RELEASED', 'QUARANTINE', 'BLOCKED')
    AND jsonb_typeof(snapshot->'expiryDate') = 'string'
    AND snapshot->>'expiryDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
    AND jsonb_typeof(snapshot->'costPrice') = 'string'
    AND snapshot->>'costPrice' ~ '^(0|[1-9][0-9]{0,7})([.][0-9]{1,4})?$'
  , false)
$$;

ALTER TABLE "product_batch_changes"
  ADD CONSTRAINT "product_batch_changes_reason_check" CHECK (
    char_length(reason) BETWEEN 1 AND 1000 AND reason = btrim(reason)
    AND reason ~ '[^[:space:]]'
  ),
  ADD CONSTRAINT "product_batch_changes_snapshots_check" CHECK (
    batch_change_valid_snapshot("after") AND
    CASE operation
      WHEN 'INITIAL_RELEASE' THEN "before" = '{"exists":false}'::jsonb AND "after"->>'status' = 'RELEASED'
      WHEN 'STATUS' THEN batch_change_valid_snapshot("before")
        AND "before"->'status' <> "after"->'status'
        AND "before" - 'status' = "after" - 'status'
      WHEN 'EXPIRY' THEN batch_change_valid_snapshot("before")
        AND "before"->'expiryDate' <> "after"->'expiryDate'
        AND "before" - 'expiryDate' = "after" - 'expiryDate'
      WHEN 'COST' THEN batch_change_valid_snapshot("before")
        AND ("before"->>'costPrice')::numeric <> ("after"->>'costPrice')::numeric
        AND "before" - 'costPrice' = "after" - 'costPrice'
      ELSE false
    END
  );

CREATE FUNCTION reject_product_batch_change_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ProductBatchChange is append-only: % rejected', TG_OP
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER product_batch_changes_no_update_delete
BEFORE UPDATE OR DELETE ON "product_batch_changes"
FOR EACH ROW EXECUTE FUNCTION reject_product_batch_change_mutation();

CREATE TRIGGER product_batch_changes_no_truncate
BEFORE TRUNCATE ON "product_batch_changes"
FOR EACH STATEMENT EXECUTE FUNCTION reject_product_batch_change_mutation();

