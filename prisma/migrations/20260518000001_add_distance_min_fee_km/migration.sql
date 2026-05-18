-- AlterTable: add distanceMinFeeKm to delivery_configs
ALTER TABLE "delivery_configs" ADD COLUMN "distanceMinFeeKm" DOUBLE PRECISION;
