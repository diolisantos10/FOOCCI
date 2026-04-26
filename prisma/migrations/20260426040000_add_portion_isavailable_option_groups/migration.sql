-- Add portion field to menu_item_variants
ALTER TABLE "menu_item_variants" ADD COLUMN IF NOT EXISTS "portion" TEXT;

-- Add portion, isAvailable, timestamps to menu_item_extras
ALTER TABLE "menu_item_extras" ADD COLUMN IF NOT EXISTS "portion" TEXT;
ALTER TABLE "menu_item_extras" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "menu_item_extras" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "menu_item_extras" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create option_groups table
CREATE TABLE IF NOT EXISTS "option_groups" (
  "id"         TEXT NOT NULL,
  "menuItemId" TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "required"   BOOLEAN NOT NULL DEFAULT false,
  "minSelect"  INTEGER NOT NULL DEFAULT 0,
  "maxSelect"  INTEGER NOT NULL DEFAULT 1,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- Create option_group_items table
CREATE TABLE IF NOT EXISTS "option_group_items" (
  "id"          TEXT NOT NULL,
  "groupId"     TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "price"       DECIMAL(10,2) NOT NULL DEFAULT 0,
  "portion"     TEXT,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "option_group_items_pkey" PRIMARY KEY ("id")
);

-- Add FK constraints
ALTER TABLE "option_groups"
  ADD CONSTRAINT IF NOT EXISTS "option_groups_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE;

ALTER TABLE "option_group_items"
  ADD CONSTRAINT IF NOT EXISTS "option_group_items_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "option_groups"("id") ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "option_groups_menuItemId_idx" ON "option_groups"("menuItemId");
CREATE INDEX IF NOT EXISTS "option_group_items_groupId_idx" ON "option_group_items"("groupId");
