-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInDelivery" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showInDineIn" BOOLEAN NOT NULL DEFAULT true;
