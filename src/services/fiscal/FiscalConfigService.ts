/**
 * FiscalConfigService — read/write the per-restaurant NFC-e config for the painel.
 *
 * Contract mirrors RestaurantSettingsService: methods return { ok, data } or
 * { ok:false, error }. Secrets (CSC token, gateway tokens) are NEVER returned —
 * the view exposes only `has*` booleans. On save, a secret is (re)encrypted only
 * when the client actually sends a new value; blank = keep what's stored.
 *
 * First-time view is PRE-FILLED from StoreProfile (CNPJ/IE/razão social/endereço
 * já cadastrados na Loja) so the owner doesn't retype — fiscal keeps its own
 * validated copy once saved.
 */

import { prisma } from "@/lib/prisma";
import type { FiscalConfig } from "@prisma/client";
import { encryptFiscalSecret } from "./fiscalCredentials";
import { validateForEmit } from "./nfceBuilder";
import { buildFiscalProvider } from "./FiscalProviderRouter";
import { getFiscalConfig } from "./fiscalCredentials";
import type { UpsertFiscalConfigInput, TestFiscalConnectionInput } from "@/validators/fiscal";
import type { FiscalEnvironment } from "./providers/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface FiscalConfigView {
  exists: boolean;
  prefilledFromStore: boolean;
  enabled: boolean;
  provider: string;
  environment: string;
  regimeTributario: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnae: string;
  fiscalLogradouro: string;
  fiscalNumero: string;
  fiscalComplemento: string;
  fiscalBairro: string;
  fiscalMunicipio: string;
  fiscalMunicipioIbge: string;
  fiscalUf: string;
  fiscalCep: string;
  serie: number;
  proximoNumero: number;
  cscId: string;
  hasCscToken: boolean;
  hasProviderTokenHomologacao: boolean;
  hasProviderTokenProducao: boolean;
  defaultNcm: string;
  defaultCfop: string;
  defaultCsosn: string;
  defaultCst: string;
  defaultOrigem: string;
  defaultUnidade: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  missingForEmit: string[];
}

const s = (v: string | null | undefined) => v ?? "";

function toView(config: FiscalConfig, prefilledFromStore = false): FiscalConfigView {
  return {
    exists: !prefilledFromStore,
    prefilledFromStore,
    enabled: config.enabled,
    provider: config.provider,
    environment: config.environment,
    regimeTributario: config.regimeTributario,
    cnpj: s(config.cnpj),
    inscricaoEstadual: s(config.inscricaoEstadual),
    inscricaoMunicipal: s(config.inscricaoMunicipal),
    razaoSocial: s(config.razaoSocial),
    nomeFantasia: s(config.nomeFantasia),
    cnae: s(config.cnae),
    fiscalLogradouro: s(config.fiscalLogradouro),
    fiscalNumero: s(config.fiscalNumero),
    fiscalComplemento: s(config.fiscalComplemento),
    fiscalBairro: s(config.fiscalBairro),
    fiscalMunicipio: s(config.fiscalMunicipio),
    fiscalMunicipioIbge: s(config.fiscalMunicipioIbge),
    fiscalUf: s(config.fiscalUf),
    fiscalCep: s(config.fiscalCep),
    serie: config.serie,
    proximoNumero: config.proximoNumero,
    cscId: s(config.cscId),
    hasCscToken: Boolean(config.cscToken),
    hasProviderTokenHomologacao: Boolean(config.providerTokenHomologacao),
    hasProviderTokenProducao: Boolean(config.providerTokenProducao),
    defaultNcm: s(config.defaultNcm),
    defaultCfop: s(config.defaultCfop),
    defaultCsosn: s(config.defaultCsosn),
    defaultCst: s(config.defaultCst),
    defaultOrigem: config.defaultOrigem,
    defaultUnidade: config.defaultUnidade,
    lastTestedAt: config.lastTestedAt ? config.lastTestedAt.toISOString() : null,
    lastTestOk: config.lastTestOk,
    lastTestMessage: config.lastTestMessage,
    missingForEmit: validateForEmit(config),
  };
}

/** Best-effort suggestion of a fresh config from the Loja profile (não persiste). */
async function suggestFromStore(restaurantId: string): Promise<FiscalConfig> {
  const sp = await prisma.storeProfile.findUnique({ where: { restaurantId } }).catch(() => null);
  const now = new Date();
  const regime = mapTaxRegime(sp?.taxRegime);
  return {
    id: "",
    restaurantId,
    enabled: false,
    provider: "DISABLED",
    environment: "HOMOLOGACAO",
    cnpj: sp?.cnpj ?? null,
    inscricaoEstadual: sp?.stateRegistration ?? null,
    inscricaoMunicipal: sp?.municipalRegistration ?? null,
    razaoSocial: sp?.legalName ?? null,
    nomeFantasia: sp?.tradeName ?? null,
    cnae: null,
    regimeTributario: regime,
    fiscalLogradouro: sp?.street ?? null,
    fiscalNumero: sp?.streetNumber ?? null,
    fiscalComplemento: sp?.complement ?? null,
    fiscalBairro: sp?.neighborhood ?? null,
    fiscalMunicipio: sp?.city ?? null,
    fiscalMunicipioIbge: null,
    fiscalUf: sp?.state ?? null,
    fiscalCep: sp?.cep ?? null,
    serie: 1,
    proximoNumero: 1,
    cscId: null,
    cscToken: null,
    providerTokenHomologacao: null,
    providerTokenProducao: null,
    certificadoNome: null,
    certificadoValidadeAte: null,
    defaultNcm: null,
    defaultCfop: "5102",
    defaultCsosn: regime === "REGIME_NORMAL" ? null : "102",
    defaultCst: regime === "REGIME_NORMAL" ? "00" : null,
    defaultOrigem: "0",
    defaultUnidade: "UN",
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mapTaxRegime(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase();
  if (v.includes("normal") || v.includes("real") || v.includes("presumido")) return "REGIME_NORMAL";
  return "SIMPLES_NACIONAL";
}

export const FiscalConfigService = {
  async getView(restaurantId: string): Promise<Result<FiscalConfigView>> {
    try {
      const config = await prisma.fiscalConfig.findUnique({ where: { restaurantId } });
      if (config) return { ok: true, data: toView(config) };
      const suggested = await suggestFromStore(restaurantId);
      return { ok: true, data: toView(suggested, true) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Erro ao carregar config fiscal" };
    }
  },

  async upsert(restaurantId: string, input: UpsertFiscalConfigInput): Promise<Result<FiscalConfigView>> {
    try {
      // Non-secret fields — only include keys the client actually sent.
      const data: Record<string, unknown> = {};
      const set = <K extends keyof UpsertFiscalConfigInput>(k: K) => {
        if (input[k] !== undefined) data[k] = input[k];
      };
      (
        [
          "enabled", "provider", "environment", "regimeTributario",
          "cnpj", "inscricaoEstadual", "inscricaoMunicipal", "razaoSocial", "nomeFantasia", "cnae",
          "fiscalLogradouro", "fiscalNumero", "fiscalComplemento", "fiscalBairro", "fiscalMunicipio",
          "fiscalMunicipioIbge", "fiscalUf", "fiscalCep",
          "serie", "proximoNumero", "cscId",
          "defaultNcm", "defaultCfop", "defaultCsosn", "defaultCst", "defaultOrigem", "defaultUnidade",
        ] as (keyof UpsertFiscalConfigInput)[]
      ).forEach(set);

      // Secrets — (re)encrypt ONLY when a new value is provided (blank = keep).
      if (input.cscToken) data.cscToken = encryptFiscalSecret(input.cscToken);
      if (input.providerTokenHomologacao) data.providerTokenHomologacao = encryptFiscalSecret(input.providerTokenHomologacao);
      if (input.providerTokenProducao) data.providerTokenProducao = encryptFiscalSecret(input.providerTokenProducao);

      const config = await prisma.fiscalConfig.upsert({
        where: { restaurantId },
        create: { restaurantId, ...data },
        update: data,
      });
      return { ok: true, data: toView(config) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Erro ao salvar config fiscal" };
    }
  },

  async testConnection(restaurantId: string, input: TestFiscalConnectionInput): Promise<Result<{ ok: boolean; message: string }>> {
    try {
      const resolved = await getFiscalConfig(restaurantId);
      const providerName = input.provider ?? resolved?.config.provider ?? "FOCUS_NFE";
      const ambiente: FiscalEnvironment = input.environment ?? resolved?.ambiente ?? "HOMOLOGACAO";
      // Prefer a freshly-typed token (test before saving); else the stored one.
      const token = input.token || resolved?.providerToken || null;
      if (!token) return { ok: true, data: { ok: false, message: "Informe o token do gateway para testar." } };
      if (providerName === "DISABLED") return { ok: true, data: { ok: false, message: "Selecione um emissor (gateway)." } };

      const provider = buildFiscalProvider(providerName, token, ambiente);
      if (!provider) return { ok: true, data: { ok: false, message: `Emissor não suportado: ${providerName}` } };

      const result = await provider.testConnection();
      await prisma.fiscalConfig
        .update({
          where: { restaurantId },
          data: { lastTestedAt: new Date(), lastTestOk: result.ok, lastTestMessage: result.message },
        })
        .catch(() => {/* config row may not exist yet — fine */});
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Erro ao testar conexão" };
    }
  },
};
