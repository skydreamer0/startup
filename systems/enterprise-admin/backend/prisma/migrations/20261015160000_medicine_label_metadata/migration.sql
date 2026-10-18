-- Add reviewed medicine identity metadata without inventing values for existing products.
ALTER TABLE "products"
  ADD COLUMN "strength" TEXT,
  ADD COLUMN "dosage_form" TEXT,
  ADD COLUMN "generic_name" TEXT,
  ADD COLUMN "nhi_code" TEXT,
  ADD COLUMN "license_number" TEXT;
