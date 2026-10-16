-- AlterTable
ALTER TABLE "products" ADD COLUMN     "stock_unit_label" TEXT;

-- CreateTable
CREATE TABLE "product_packages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_package_revisions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "contents" TEXT NOT NULL,
    "units_per_package" INTEGER,
    "identifier_count" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT NOT NULL,
    "retired_at" TIMESTAMP(3),
    "retired_by_id" TEXT,
    "retirement_reason" TEXT,

    CONSTRAINT "product_package_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_package_identifiers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "product_package_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_packages_tenant_id_product_id_idx" ON "product_packages"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_packages_id_tenant_id_key" ON "product_packages"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "product_package_revisions_tenant_id_package_id_idx" ON "product_package_revisions"("tenant_id", "package_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_package_revisions_id_tenant_id_key" ON "product_package_revisions"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_package_revisions_package_id_revision_tenant_id_key" ON "product_package_revisions"("package_id", "revision", "tenant_id");

-- CreateIndex
CREATE INDEX "product_package_identifiers_tenant_id_namespace_value_idx" ON "product_package_identifiers"("tenant_id", "namespace", "value");

-- CreateIndex
CREATE UNIQUE INDEX "product_package_identifiers_revision_id_namespace_value_ten_key" ON "product_package_identifiers"("revision_id", "namespace", "value", "tenant_id");

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_product_id_tenant_id_fkey" FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_package_revisions" ADD CONSTRAINT "product_package_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_package_revisions" ADD CONSTRAINT "product_package_revisions_package_id_tenant_id_fkey" FOREIGN KEY ("package_id", "tenant_id") REFERENCES "product_packages"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_package_revisions" ADD CONSTRAINT "product_package_revisions_actor_id_tenant_id_fkey" FOREIGN KEY ("actor_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_package_revisions" ADD CONSTRAINT "product_package_revisions_retired_by_id_tenant_id_fkey" FOREIGN KEY ("retired_by_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "product_package_identifiers" ADD CONSTRAINT "product_package_identifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_package_identifiers" ADD CONSTRAINT "product_package_identifiers_revision_id_tenant_id_fkey" FOREIGN KEY ("revision_id", "tenant_id") REFERENCES "product_package_revisions"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A package has at most one unretired revision. Separate packages may share an
-- identifier: that is ambiguity to display, never an arbitrary first match.
CREATE UNIQUE INDEX "product_package_one_unretired_revision"
ON "product_package_revisions" ("tenant_id", "package_id") WHERE "retired_at" IS NULL;
ALTER TABLE "product_packages" ADD CONSTRAINT "product_package_current_revision_fkey"
FOREIGN KEY ("id", "revision", "tenant_id")
REFERENCES "product_package_revisions" ("package_id", "revision", "tenant_id")
DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "products" ADD CONSTRAINT "product_reviewed_stock_unit_label"
CHECK ("stock_unit_label" IS NULL OR length(btrim("stock_unit_label")) BETWEEN 1 AND 80);
ALTER TABLE "product_packages" ADD CONSTRAINT "product_package_positive_revision" CHECK ("revision" > 0);
ALTER TABLE "product_package_revisions" ADD CONSTRAINT "product_package_revision_values" CHECK (
  "revision" > 0 AND "identifier_count" BETWEEN 1 AND 50 AND ("units_per_package" IS NULL OR "units_per_package" > 0)
  AND ("valid_until" IS NULL OR "valid_until" > "valid_from")
  AND length(btrim("label")) > 0 AND length(btrim("contents")) > 0
  AND length(btrim("source")) > 0 AND length(btrim("reason")) > 0
  AND (("retired_at" IS NULL AND "retired_by_id" IS NULL AND "retirement_reason" IS NULL)
    OR ("retired_at" IS NOT NULL AND "retired_by_id" IS NOT NULL AND "retirement_reason" IS NOT NULL AND length(btrim("retirement_reason")) > 0))
);
ALTER TABLE "product_package_identifiers" ADD CONSTRAINT "product_package_identifier_values" CHECK (
  "namespace" IN ('MANUFACTURER', 'GTIN') AND length("value") BETWEEN 1 AND 256
);

CREATE FUNCTION guard_package_revision_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Package revision history cannot be deleted'; END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL
    OR (to_jsonb(NEW) - ARRAY['retired_at','retired_by_id','retirement_reason'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['retired_at','retired_by_id','retirement_reason'])
  THEN RAISE EXCEPTION 'Package revisions are immutable except one-way retirement'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_package_revision_history BEFORE UPDATE OR DELETE ON "product_package_revisions"
FOR EACH ROW EXECUTE FUNCTION guard_package_revision_history();

CREATE FUNCTION guard_package_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Package identity history cannot be deleted'; END IF;
  IF (to_jsonb(NEW) - 'revision') IS DISTINCT FROM (to_jsonb(OLD) - 'revision')
    OR NEW.revision NOT IN (OLD.revision, OLD.revision + 1)
  THEN RAISE EXCEPTION 'Package identity is immutable and revisions advance one at a time'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_package_identity BEFORE UPDATE OR DELETE ON "product_packages"
FOR EACH ROW EXECUTE FUNCTION guard_package_identity();

CREATE FUNCTION guard_package_identifier_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Package identifiers are immutable; create a new revision';
END $$;
CREATE TRIGGER product_package_identifier_history BEFORE UPDATE OR DELETE ON "product_package_identifiers"
FOR EACH ROW EXECUTE FUNCTION guard_package_identifier_history();

-- Seal the whole identifier set in the revision's creation transaction. A later
-- insert cannot quietly extend an already reviewed revision.
CREATE FUNCTION guard_package_identifier_set() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE revision_key TEXT; expected_count INTEGER; actual_count INTEGER; correct_head BOOLEAN;
BEGIN
  IF TG_TABLE_NAME = 'product_package_revisions' THEN revision_key := NEW.id;
  ELSE revision_key := NEW.revision_id; END IF;
  SELECT identifier_count INTO expected_count FROM product_package_revisions WHERE id = revision_key;
  SELECT count(*) INTO actual_count FROM product_package_identifiers WHERE revision_id = revision_key;
  SELECT p.revision = r.revision INTO correct_head FROM product_package_revisions r
    JOIN product_packages p ON p.id = r.package_id AND p.tenant_id = r.tenant_id WHERE r.id = revision_key;
  IF actual_count IS DISTINCT FROM expected_count
    OR correct_head IS DISTINCT FROM TRUE
  THEN RAISE EXCEPTION 'Identifier set must be complete and immutable for the current reviewed revision'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER package_revision_identifier_set AFTER INSERT ON "product_package_revisions"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_package_identifier_set();
CREATE CONSTRAINT TRIGGER package_identifier_set AFTER INSERT ON "product_package_identifiers"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_package_identifier_set();

CREATE FUNCTION guard_product_stock_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.stock_unit_label IS NOT NULL AND NEW.stock_unit_label IS DISTINCT FROM OLD.stock_unit_label
  THEN RAISE EXCEPTION 'Reviewed stock unit cannot be changed by product metadata updates'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_stock_unit BEFORE UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION guard_product_stock_unit();

