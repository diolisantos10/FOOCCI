-- AlterTable: add new training config fields with safe defaults
ALTER TABLE "agent_training_configs" ADD COLUMN "autoRunArenaOnCapture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "agent_training_configs" ADD COLUMN "autoDiagnoseOnFailure" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "agent_training_configs" ADD COLUMN "smallBatchEveryHours" INTEGER;
ALTER TABLE "agent_training_configs" ADD COLUMN "nightlyBatchEnabled" BOOLEAN NOT NULL DEFAULT false;
