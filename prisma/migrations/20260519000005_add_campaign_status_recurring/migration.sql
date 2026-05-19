-- Add ACTIVE, PAUSED, COMPLETED to CampaignStatus enum
-- ALTER TYPE ... ADD VALUE is additive and safe — no data loss, no lock escalation.

ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
