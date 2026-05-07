-- AlterTable: add Saipos attempt tracking fields to orders
ALTER TABLE "orders" ADD COLUMN "saiposLastErrorCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "saiposLastAttemptAt" TIMESTAMP(3);
