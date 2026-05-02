-- AlterTable: add AI enrichment fields to menu_items
ALTER TABLE "menu_items" ADD COLUMN "tagFunil"             TEXT;
ALTER TABLE "menu_items" ADD COLUMN "perfilPaladar"        TEXT;
ALTER TABLE "menu_items" ADD COLUMN "harmonizacaoSugerida" TEXT;
ALTER TABLE "menu_items" ADD COLUMN "alergenosDetalhados"  TEXT;
ALTER TABLE "menu_items" ADD COLUMN "storytellingIA"       TEXT;
