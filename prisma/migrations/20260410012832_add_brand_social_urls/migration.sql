-- AlterTable
ALTER TABLE "media_uploads" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "restaurant_brand_configs" ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "tiktokUrl" TEXT;

-- RenameIndex
ALTER INDEX "crm_action_logs_restaurantId_created_idx" RENAME TO "crm_action_logs_restaurantId_createdAt_idx";

-- RenameIndex
ALTER INDEX "crm_action_logs_restaurantId_style_idx" RENAME TO "crm_action_logs_restaurantId_messageStyle_idx";
