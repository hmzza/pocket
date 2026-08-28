-- Link generated meal choices to their source beverage product without changing existing order history.
ALTER TABLE "AddOnOption" ADD COLUMN "linkedProductId" TEXT;

CREATE INDEX "AddOnOption_linkedProductId_idx" ON "AddOnOption"("linkedProductId");

ALTER TABLE "AddOnOption"
  ADD CONSTRAINT "AddOnOption_linkedProductId_fkey"
  FOREIGN KEY ("linkedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
