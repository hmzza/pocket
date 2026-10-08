ALTER TABLE "OrderAuditEvent"
ADD COLUMN "meaningfulEdit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "printAttemptId" TEXT;

CREATE INDEX "OrderAuditEvent_orderId_eventType_printAttemptId_idx"
ON "OrderAuditEvent"("orderId", "eventType", "printAttemptId");

CREATE UNIQUE INDEX "OrderAuditEvent_orderId_eventType_printAttemptId_key"
ON "OrderAuditEvent"("orderId", "eventType", "printAttemptId");
