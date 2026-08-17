CREATE INDEX "Order_branchId_placedAt_idx" ON "Order"("branchId", "placedAt");
CREATE INDEX "Order_branchId_status_placedAt_idx" ON "Order"("branchId", "status", "placedAt");
CREATE INDEX "Order_branchId_paymentStatus_idx" ON "Order"("branchId", "paymentStatus");
