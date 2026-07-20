-- Aba Markup (/precificacao): per-category markup multiplier override.
-- NULL = category follows the restaurant's global markup (from premissas).
-- Additive only.

ALTER TABLE "menu_categories" ADD COLUMN "markupOverride" DECIMAL(6,3);
