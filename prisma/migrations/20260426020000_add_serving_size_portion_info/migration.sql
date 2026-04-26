-- AddColumn: servingSize Int? and portionInfo String? to menu_items
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "servingSize" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "portionInfo" TEXT;
