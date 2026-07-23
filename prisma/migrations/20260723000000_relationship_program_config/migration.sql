-- Relationship program: master toggle + rolling classification window.
ALTER TABLE "tier_settings" ADD COLUMN "programEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tier_settings" ADD COLUMN "classificationWindowMonths" INTEGER NOT NULL DEFAULT 0;

-- Physical gift per tier, tracked against real stock.
ALTER TABLE "tier_benefits" ADD COLUMN "isPhysicalGift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tier_benefits" ADD COLUMN "stockTotal" INTEGER;
ALTER TABLE "tier_benefits" ADD COLUMN "stockUsed" INTEGER NOT NULL DEFAULT 0;
