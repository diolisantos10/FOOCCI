-- Unidade de USO por linha da ficha (conversão de unidade no CMV).
-- Aditivo e nullable: linhas existentes ficam com unit = NULL, que o cálculo
-- interpreta como "usa a unidade de compra do insumo" — custo inalterado.
ALTER TABLE "recipe_lines" ADD COLUMN IF NOT EXISTS "unit" TEXT;
