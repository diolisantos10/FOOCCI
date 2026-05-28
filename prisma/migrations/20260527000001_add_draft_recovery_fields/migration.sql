-- AlterTable: add cart recovery tracking fields to order_drafts
ALTER TABLE "order_drafts" ADD COLUMN "recoveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_drafts" ADD COLUMN "lastRecoveryAt" TIMESTAMP(3);
