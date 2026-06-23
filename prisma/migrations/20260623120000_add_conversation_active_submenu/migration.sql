-- Track which configured WhatsApp submenu (top-level option id) the customer is
-- currently viewing; null = top-level menu. Lets numbered selection resolve to
-- the submenu's children instead of the main menu.
ALTER TABLE "conversations" ADD COLUMN "activeSubmenuId" TEXT;
