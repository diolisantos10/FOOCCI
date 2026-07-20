-- Track tier level-ups so the "Subiu de nível" campaign can congratulate + reward.
ALTER TABLE "customers" ADD COLUMN "previousTier" TEXT;
ALTER TABLE "customers" ADD COLUMN "tierUpAt" TIMESTAMP(3);
