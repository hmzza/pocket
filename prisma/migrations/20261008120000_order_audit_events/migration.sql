CREATE TABLE "OrderAuditEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "branchId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderAuditEvent_branchId_createdAt_idx" ON "OrderAuditEvent"("branchId", "createdAt");
CREATE INDEX "OrderAuditEvent_branchId_placedAt_idx" ON "OrderAuditEvent"("branchId", "placedAt");
CREATE INDEX "OrderAuditEvent_branchId_orderNumber_idx" ON "OrderAuditEvent"("branchId", "orderNumber");
CREATE INDEX "OrderAuditEvent_orderId_createdAt_idx" ON "OrderAuditEvent"("orderId", "createdAt");
CREATE INDEX "OrderAuditEvent_eventType_createdAt_idx" ON "OrderAuditEvent"("eventType", "createdAt");
