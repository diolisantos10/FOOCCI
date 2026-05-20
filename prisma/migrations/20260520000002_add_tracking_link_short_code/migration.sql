-- Add short link support to tracking_links
-- shortCode is nullable (generated lazily) and globally unique

ALTER TABLE "tracking_links" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "tracking_links_shortCode_key" ON "tracking_links"("shortCode");
