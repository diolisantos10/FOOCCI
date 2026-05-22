-- CreateTable
CREATE TABLE "order_edit_logs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL DEFAULT 'ITEM_REPLACED',
    "previousItemId" TEXT,
    "previousItemName" TEXT NOT NULL,
    "previousItemQty" INTEGER NOT NULL,
    "previousItemData" JSONB NOT NULL,
    "newItemName" TEXT NOT NULL,
    "newItemQty" INTEGER NOT NULL,
    "newItemData" JSONB NOT NULL,
    "previousTotal" DECIMAL(10,2) NOT NULL,
    "newTotal" DECIMAL(10,2) NOT NULL,
    "priceDiff" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonNote" TEXT,
    "paymentResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_edit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_edit_logs_orderId_idx" ON "order_edit_logs"("orderId");

-- CreateIndex
CREATE INDEX "order_edit_logs_restaurantId_idx" ON "order_edit_logs"("restaurantId");

-- AddForeignKey
ALTER TABLE "order_edit_logs" ADD CONSTRAINT "order_edit_logs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_edit_logs" ADD CONSTRAINT "order_edit_logs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
