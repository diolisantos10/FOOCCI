-- Cofre de Experiências (RestaurantExperience) — arquivo protegido, sem PII, de
-- interações reais de cliente por restaurante e por agente. Insumo que otimiza
-- TODAS as IAs (padrões de pergunta, escalação, o que os clientes mais querem).
-- Ingerido das conversas reais, sempre sanitizado. Admin-only.
CREATE TABLE "restaurant_experiences" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "conversationId" TEXT,
    "intent" TEXT,
    "outcome" TEXT NOT NULL,
    "customerText" TEXT NOT NULL,
    "agentText" TEXT,
    "confidence" DOUBLE PRECISION,
    "coherence" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_experiences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_experiences_dedup_key" ON "restaurant_experiences"("restaurantId", "agentId", "conversationId", "sourceAt");

CREATE INDEX "restaurant_experiences_restaurantId_agentId_sourceAt_idx" ON "restaurant_experiences"("restaurantId", "agentId", "sourceAt");

CREATE INDEX "restaurant_experiences_restaurantId_intent_idx" ON "restaurant_experiences"("restaurantId", "intent");
