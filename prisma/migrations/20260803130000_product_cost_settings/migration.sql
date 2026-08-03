-- Add editable cost settings while keeping recipe costing as a fallback.
ALTER TABLE "Product" ADD COLUMN "foodPackagingCost" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "costSettingsUpdatedAt" TIMESTAMP(3);
