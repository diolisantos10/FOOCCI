-- Checkout self-service: a costura pagamento → conta criada.
--
-- 100% ADITIVA. Todas as colunas são NULLable e nenhuma linha existente muda de
-- comportamento: uma assinatura criada pelo admin (venda 1:1) simplesmente tem
-- todos estes campos nulos e continua funcionando como antes.
--
-- A peça central é `restaurants.originSubscriptionId` com índice UNIQUE. Ele é a
-- trava de idempotência da criação de conta: o webhook do Mercado Pago reenvia o
-- mesmo evento, e dois processamentos concorrentes tentariam criar dois
-- restaurantes para a mesma assinatura. O UNIQUE derruba o segundo INSERT no
-- banco, dentro da transação — que volta atrás inteira, sem restaurante órfão.
-- Idempotência checada só em código perderia a corrida.

-- ── Restaurante nascido de uma assinatura paga ──────────────────────────────
ALTER TABLE "restaurants" ADD COLUMN "originSubscriptionId" TEXT;
CREATE UNIQUE INDEX "restaurants_originSubscriptionId_key" ON "restaurants"("originSubscriptionId");

-- ── Regra dos 50% do primeiro mês ───────────────────────────────────────────
-- priceCents segue sendo o valor CHEIO do ciclo; firstChargeCents é o que sai na
-- primeira cobrança. fullAmountSyncedAt marca o degrau já aplicado no MP.
ALTER TABLE "plan_subscriptions" ADD COLUMN "firstChargeCents"   INTEGER;
ALTER TABLE "plan_subscriptions" ADD COLUMN "fullAmountSyncedAt" TIMESTAMP(3);
ALTER TABLE "plan_subscriptions" ADD COLUMN "priceSyncError"     TEXT;

-- ── Dados do cadastro que só vira conta depois do pagamento ─────────────────
ALTER TABLE "plan_subscriptions" ADD COLUMN "signupRestaurantName"    TEXT;
ALTER TABLE "plan_subscriptions" ADD COLUMN "signupSlug"              TEXT;
ALTER TABLE "plan_subscriptions" ADD COLUMN "signupOwnerPasswordHash" TEXT;
ALTER TABLE "plan_subscriptions" ADD COLUMN "signupIdempotencyKey"    TEXT;
ALTER TABLE "plan_subscriptions" ADD COLUMN "provisionedAt"           TIMESTAMP(3);
ALTER TABLE "plan_subscriptions" ADD COLUMN "provisionError"          TEXT;

-- Idempotência do POST público de checkout (duplo clique / F5 / retry de rede).
CREATE UNIQUE INDEX "plan_subscriptions_signupIdempotencyKey_key" ON "plan_subscriptions"("signupIdempotencyKey");
