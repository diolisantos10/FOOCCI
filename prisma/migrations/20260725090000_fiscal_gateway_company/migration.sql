-- Migration: fiscal_gateway_company
-- Modelo conta-mãe: o lojista sobe o certificado A1 no painel do Foocci e a
-- Foocci registra a empresa dele no gateway (conta parceiro da Foocci). Guardamos
-- a referência da empresa no gateway para reusar na emissão/consulta.

-- AlterTable
ALTER TABLE "fiscal_configs" ADD COLUMN     "gatewayCompanyRef" TEXT;
