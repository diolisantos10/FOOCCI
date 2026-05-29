-- AddColumn: isUpsell to order_items (Foocci incremental revenue tracking)
ALTER TABLE "order_items" ADD COLUMN "isUpsell" BOOLEAN NOT NULL DEFAULT false;
