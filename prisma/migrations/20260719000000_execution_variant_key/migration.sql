-- Which phrase (message-pool variant fingerprint) each execution used — per-phrase A/B stats.
ALTER TABLE "campaign_executions" ADD COLUMN "variantKey" TEXT;
