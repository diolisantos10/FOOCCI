-- Track cycle boundary for recurring campaigns; used by detail API to show current-cycle metrics.
ALTER TABLE "campaigns" ADD COLUMN "lastRunAt" TIMESTAMP(3);
