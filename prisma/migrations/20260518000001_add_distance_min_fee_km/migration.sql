-- AlterTable: add distanceMinFeeKm to DeliveryConfig
ALTER TABLE "DeliveryConfig" ADD COLUMN "distanceMinFeeKm" DOUBLE PRECISION;
