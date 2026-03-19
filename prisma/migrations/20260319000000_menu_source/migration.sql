-- Add MenuSource enum and source column to menu_categories
-- source tracks whether a category was created manually or imported
-- from an external POS / menu integration. Defaults to MANUAL.

CREATE TYPE "MenuSource" AS ENUM ('MANUAL', 'EXTERNAL');

ALTER TABLE "menu_categories"
  ADD COLUMN "source" "MenuSource" NOT NULL DEFAULT 'MANUAL';
