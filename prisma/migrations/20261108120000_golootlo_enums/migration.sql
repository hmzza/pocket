-- Commit enum additions before using these values in product data.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'GOLOOTLO';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'GOLOOTLO';
