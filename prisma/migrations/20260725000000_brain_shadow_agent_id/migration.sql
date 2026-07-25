-- Escada por-agente: dimensão de agente na evidência de sombra.
-- Aditivo e seguro: coluna anulável (linhas antigas = recepcionista/whatsapp).
ALTER TABLE "brain_shadow_logs" ADD COLUMN "agentId" TEXT;

CREATE INDEX "brain_shadow_logs_restaurantId_agentId_createdAt_idx"
  ON "brain_shadow_logs"("restaurantId", "agentId", "createdAt");
