-- AddColumn: recoveryCode to order_drafts
ALTER TABLE "order_drafts" ADD COLUMN "recoveryCode" TEXT;

-- CreateIndex: unique constraint on recoveryCode
CREATE UNIQUE INDEX "order_drafts_recoveryCode_key" ON "order_drafts"("recoveryCode");
