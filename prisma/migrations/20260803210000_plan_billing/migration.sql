-- Billing da plataforma: assinaturas de plano da PRÓPRIA Foocci + fila de NFS-e.
--
-- Aditiva: duas tabelas e dois enums novos, uma FK opcional para restaurants.
-- Nada existente muda. Como o SiteLead, a assinatura nasce ANTES do restaurante
-- existir (venda 1:1), por isso restaurantId é NULLable com ON DELETE SET NULL.
--
-- A fila de NFS-e usa o enum FiscalDocumentStatus que JÁ existe: PENDENTE
-- acumula enquanto o CNPJ da Foocci não pode emitir (ver docs/juridico/);
-- quando a SLU-ME sair, emite-se tudo. Nada se perde.

CREATE TYPE "BillingCycle" AS ENUM ('MENSAL', 'TRIMESTRAL', 'ANUAL');

CREATE TYPE "PlanSubscriptionStatus" AS ENUM ('DRAFT', 'AGUARDANDO_ACEITE', 'ACEITO', 'AGUARDANDO_PAGAMENTO', 'ATIVA', 'INADIMPLENTE', 'CANCELADA');

CREATE TABLE "plan_subscriptions" (
    "id"               TEXT NOT NULL,
    "restaurantId"     TEXT,
    "customerName"     TEXT NOT NULL,
    "customerCnpj"     TEXT,
    "customerEmail"    TEXT,
    "customerWhatsapp" TEXT NOT NULL,
    "plan"             "Plan" NOT NULL,
    "cycle"            "BillingCycle" NOT NULL,
    "priceCents"       INTEGER NOT NULL,
    "status"           "PlanSubscriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptToken"      TEXT NOT NULL,
    "termsVersion"     TEXT,
    "termsAcceptedAt"  TIMESTAMP(3),
    "termsAcceptedIp"  TEXT,
    "termsAcceptedBy"  TEXT,
    "mpPreapprovalId"  TEXT,
    "mpInitPoint"      TEXT,
    "activatedAt"      TIMESTAMP(3),
    "canceledAt"       TIMESTAMP(3),
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_subscriptions_acceptToken_key" ON "plan_subscriptions"("acceptToken");
CREATE INDEX "plan_subscriptions_status_idx" ON "plan_subscriptions"("status");
CREATE INDEX "plan_subscriptions_mpPreapprovalId_idx" ON "plan_subscriptions"("mpPreapprovalId");

ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "plan_invoices" (
    "id"             TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountCents"    INTEGER NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "status"         "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDENTE',
    "providerRef"    TEXT,
    "pdfUrl"         TEXT,
    "xmlUrl"         TEXT,
    "errorMessage"   TEXT,
    "mpPaymentId"    TEXT,
    "emittedAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_invoices_providerRef_key" ON "plan_invoices"("providerRef");
CREATE UNIQUE INDEX "plan_invoices_mpPaymentId_key" ON "plan_invoices"("mpPaymentId");
CREATE INDEX "plan_invoices_subscriptionId_idx" ON "plan_invoices"("subscriptionId");
CREATE INDEX "plan_invoices_status_idx" ON "plan_invoices"("status");

ALTER TABLE "plan_invoices" ADD CONSTRAINT "plan_invoices_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "plan_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
