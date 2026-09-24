-- Janela da vitrine "Novidades" do cardápio, configurável pelo dono do restaurante.
-- NULL = nunca configurado → vale o padrão do sistema.
ALTER TABLE "store_profiles" ADD COLUMN "novidadesDias" INTEGER;
