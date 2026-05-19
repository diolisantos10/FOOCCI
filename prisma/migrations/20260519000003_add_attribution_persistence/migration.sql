-- AddColumn: CRM revenue attribution persistence
-- All nullable or have defaults — zero downtime on Postgres.

-- CampaignExecution: conversion tracking per recipient
ALTER TABLE "campaign_executions" ADD COLUMN IF NOT EXISTS "converted"        BOOLEAN       NOT NULL DEFAULT false;
ALTER TABLE "campaign_executions" ADD COLUMN IF NOT EXISTS "convertedAt"      TIMESTAMP(3);
ALTER TABLE "campaign_executions" ADD COLUMN IF NOT EXISTS "revenue"          DECIMAL(10,2);
ALTER TABLE "campaign_executions" ADD COLUMN IF NOT EXISTS "convertedOrderId" TEXT;

-- CRMActionLog: link back to the order that triggered conversion
ALTER TABLE "crm_action_logs" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- Campaign: aggregate conversion counters
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "totalConverted" INTEGER      NOT NULL DEFAULT 0;
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "totalRevenue"   DECIMAL(12,2) NOT NULL DEFAULT 0;
