-- AlterTable: add behavioral & visual identity fields to restaurant_brand_configs
ALTER TABLE "restaurant_brand_configs"
  ADD COLUMN "personalityPreset"   TEXT NOT NULL DEFAULT 'traditional',
  ADD COLUMN "upsellIntensity"      TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN "salesFocus"           TEXT NOT NULL DEFAULT 'balanced',
  ADD COLUMN "salesPriority"        TEXT NOT NULL DEFAULT 'bestsellers',
  ADD COLUMN "brandPrimaryColor"    TEXT,
  ADD COLUMN "brandSecondaryColor"  TEXT;
