-- CreateTable
CREATE TABLE "ProductBundleComponent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductBundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemBundleComponent" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT,
    "componentProductName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemBundleComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductBundleComponent_productId_componentProductId_key" ON "ProductBundleComponent"("productId", "componentProductId");

-- AddForeignKey
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemBundleComponent" ADD CONSTRAINT "OrderItemBundleComponent_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemBundleComponent" ADD CONSTRAINT "OrderItemBundleComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
