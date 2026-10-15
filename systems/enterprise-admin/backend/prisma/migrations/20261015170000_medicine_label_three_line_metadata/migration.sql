-- Optional reviewed item name and default SKU storage position for the internal label.
ALTER TABLE "products"
  ADD COLUMN "english_name" TEXT,
  ADD COLUMN "storage_location" TEXT;
