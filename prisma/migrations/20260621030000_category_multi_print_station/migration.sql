-- AlterTable: a category can now route to MULTIPLE print stations (same dish in
-- two kitchens). Replaces the single printStationKey with a printStationKeys array.

ALTER TABLE "menu_categories" ADD COLUMN "printStationKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate existing single-station routing into the new array
UPDATE "menu_categories" SET "printStationKeys" = ARRAY["printStationKey"] WHERE "printStationKey" IS NOT NULL;

-- Drop the old single-station column
ALTER TABLE "menu_categories" DROP COLUMN "printStationKey";
