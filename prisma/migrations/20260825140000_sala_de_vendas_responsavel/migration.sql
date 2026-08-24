-- Sala de Vendas: quem atende o lead AGORA (v3, Fase 3).
--
-- Aditiva por inteiro: 1 tipo novo, 4 valores novos num enum existente, 4
-- colunas com valor padrão, 1 coluna booleana, 2 índices e 1 chave estrangeira.
-- Zero DROP. Nenhum lead existente muda de sentido.
--
-- ── O QUE ESTA MIGRAÇÃO RESOLVE ──
--
-- A base já sabia em que ETAPA cada lead está. Não sabia de QUEM ele é neste
-- momento. Sem isso não existe fila "sem responsável", não existe "meus leads",
-- e dois atendentes podem responder o mesmo lead sem nenhum dos dois saber do
-- outro.
--
-- Todo lead existente nasce `NINGUEM`, e isso é verdade: ninguém foi designado,
-- porque o conceito não existia. Marcar como IA seria afirmar um atendimento
-- que não aconteceu.
--
-- ── SOBRE `ALTER TYPE ... ADD VALUE` ──
--
-- Os quatro valores novos NÃO são usados nesta mesma migração, de propósito.
-- Usar um valor de enum na transação que o criou é justamente o caso que o
-- Postgres recusa.

-- CreateEnum
CREATE TYPE "LeadAtendidoPor" AS ENUM ('NINGUEM', 'IA', 'HUMANO', 'AGUARDANDO_HUMANO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SiteLeadInteractionType" ADD VALUE 'ASSUMIU_HUMANO';
ALTER TYPE "SiteLeadInteractionType" ADD VALUE 'DEVOLVEU_PARA_IA';
ALTER TYPE "SiteLeadInteractionType" ADD VALUE 'PEDIU_HUMANO';
ALTER TYPE "SiteLeadInteractionType" ADD VALUE 'NOTA_INTERNA';

-- AlterTable
ALTER TABLE "SiteLead" ADD COLUMN     "atendenteDesde" TIMESTAMP(3),
ADD COLUMN     "atendenteUserId" TEXT,
ADD COLUMN     "atendidoPor" "LeadAtendidoPor" NOT NULL DEFAULT 'NINGUEM',
ADD COLUMN     "motivoDoPedido" TEXT;

-- AlterTable
ALTER TABLE "SiteLeadInteraction" ADD COLUMN     "interna" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SiteLead_atendidoPor_stage_idx" ON "SiteLead"("atendidoPor", "stage");

-- CreateIndex
CREATE INDEX "SiteLead_atendenteUserId_idx" ON "SiteLead"("atendenteUserId");

-- AddForeignKey
ALTER TABLE "SiteLead" ADD CONSTRAINT "SiteLead_atendenteUserId_fkey" FOREIGN KEY ("atendenteUserId") REFERENCES "internal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

