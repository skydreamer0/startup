-- Draft-only additive storage. No inventory backfill, release or posting.
CREATE TABLE "receiving_drafts" (
  "id" UUID NOT NULL, "tenant_id" TEXT NOT NULL, "owner_id" TEXT NOT NULL,
  "title" TEXT NOT NULL, "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "payload" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "receiving_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "receiving_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "receiving_drafts_owner_id_tenant_id_fkey" FOREIGN KEY ("owner_id","tenant_id") REFERENCES "users"("id","tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "receiving_drafts_id_tenant_id_owner_id_key" ON "receiving_drafts"("id","tenant_id","owner_id");
CREATE INDEX "receiving_drafts_tenant_id_owner_id_updated_at_idx" ON "receiving_drafts"("tenant_id","owner_id","updated_at");
CREATE TABLE "receiving_draft_revisions" (
  "draft_id" UUID NOT NULL, "tenant_id" TEXT NOT NULL, "owner_id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0), "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receiving_draft_revisions_pkey" PRIMARY KEY ("draft_id","revision"),
  CONSTRAINT "receiving_draft_revisions_draft_id_tenant_id_owner_id_fkey" FOREIGN KEY ("draft_id","tenant_id","owner_id") REFERENCES "receiving_drafts"("id","tenant_id","owner_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "receiving_draft_revisions_tenant_id_owner_id_draft_id_idx" ON "receiving_draft_revisions"("tenant_id","owner_id","draft_id");

-- Append-only historical snapshots; corrections are new CAS revisions.
CREATE FUNCTION "reject_receiving_draft_revision_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Receiving draft revisions are append-only';
END;
$$;
CREATE TRIGGER "receiving_draft_revisions_append_only" BEFORE UPDATE OR DELETE ON "receiving_draft_revisions"
FOR EACH ROW EXECUTE FUNCTION "reject_receiving_draft_revision_change"();
