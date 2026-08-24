-- Template substitutions must survive a retry, so they live with the message
-- rather than being rebuilt from context that may since have changed.
ALTER TABLE "WhatsAppMessage" ADD COLUMN IF NOT EXISTS "templateParams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
