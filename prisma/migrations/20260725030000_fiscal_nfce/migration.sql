-- Migration: fiscal_nfce
-- Emissão de Nota Fiscal (NFC-e, modelo 65) — OPCIONAL por loja.
-- Novos: fiscal_configs (config de emissão por restaurante) e fiscal_documents
-- (livro de notas). Campos fiscais (NCM/CFOP/CSOSN…) em menu_categories e
-- menu_items. Segredos (CSC, tokens do gateway) são gravados CIFRADOS pela app.

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDENTE', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA', 'CONTINGENCIA', 'ERRO');

-- CreateTable
CREATE TABLE "fiscal_configs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'DISABLED',
    "environment" TEXT NOT NULL DEFAULT 'HOMOLOGACAO',
    "cnpj" TEXT,
    "inscricaoEstadual" TEXT,
    "inscricaoMunicipal" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "cnae" TEXT,
    "regimeTributario" TEXT NOT NULL DEFAULT 'SIMPLES_NACIONAL',
    "fiscalLogradouro" TEXT,
    "fiscalNumero" TEXT,
    "fiscalComplemento" TEXT,
    "fiscalBairro" TEXT,
    "fiscalMunicipio" TEXT,
    "fiscalMunicipioIbge" TEXT,
    "fiscalUf" TEXT,
    "fiscalCep" TEXT,
    "serie" INTEGER NOT NULL DEFAULT 1,
    "proximoNumero" INTEGER NOT NULL DEFAULT 1,
    "cscId" TEXT,
    "cscToken" TEXT,
    "providerTokenHomologacao" TEXT,
    "providerTokenProducao" TEXT,
    "certificadoNome" TEXT,
    "certificadoValidadeAte" TIMESTAMP(3),
    "defaultNcm" TEXT,
    "defaultCfop" TEXT,
    "defaultCsosn" TEXT,
    "defaultCst" TEXT,
    "defaultOrigem" TEXT NOT NULL DEFAULT '0',
    "defaultUnidade" TEXT NOT NULL DEFAULT 'UN',
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "modelo" TEXT NOT NULL DEFAULT '65',
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDENTE',
    "ambiente" TEXT NOT NULL,
    "serie" INTEGER,
    "numero" INTEGER,
    "chave" TEXT,
    "protocolo" TEXT,
    "providerRef" TEXT,
    "qrCodeData" TEXT,
    "urlConsulta" TEXT,
    "xmlUrl" TEXT,
    "danfceUrl" TEXT,
    "valorTotal" DECIMAL(10,2),
    "cpfDestinatario" TEXT,
    "rejeicaoCodigo" TEXT,
    "rejeicaoMotivo" TEXT,
    "emitidaAt" TIMESTAMP(3),
    "canceladaAt" TIMESTAMP(3),
    "cancelamentoJustificativa" TEXT,
    "cancelamentoProtocolo" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "menu_categories" ADD COLUMN     "fiscalCest" TEXT,
ADD COLUMN     "fiscalCfop" TEXT,
ADD COLUMN     "fiscalCsosn" TEXT,
ADD COLUMN     "fiscalCst" TEXT,
ADD COLUMN     "fiscalNcm" TEXT,
ADD COLUMN     "fiscalOrigem" TEXT,
ADD COLUMN     "fiscalUnidade" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "fiscalCest" TEXT,
ADD COLUMN     "fiscalCfop" TEXT,
ADD COLUMN     "fiscalCsosn" TEXT,
ADD COLUMN     "fiscalCst" TEXT,
ADD COLUMN     "fiscalIcmsAliquota" DECIMAL(6,3),
ADD COLUMN     "fiscalNcm" TEXT,
ADD COLUMN     "fiscalOrigem" TEXT,
ADD COLUMN     "fiscalUnidade" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_configs_restaurantId_key" ON "fiscal_configs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_orderId_key" ON "fiscal_documents"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_chave_key" ON "fiscal_documents"("chave");

-- CreateIndex
CREATE INDEX "fiscal_documents_restaurantId_status_idx" ON "fiscal_documents"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "fiscal_documents_providerRef_idx" ON "fiscal_documents"("providerRef");

-- AddForeignKey
ALTER TABLE "fiscal_configs" ADD CONSTRAINT "fiscal_configs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
