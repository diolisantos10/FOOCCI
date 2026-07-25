/**
 * Validators for the fiscal (NFC-e) settings.
 *
 * Secret fields (cscToken, providerToken*) are optional on PUT: the client sends
 * them ONLY when changing. Left blank → the stored (encrypted) value is kept.
 */

import { z } from "zod";

const str = (max: number) => z.string().trim().max(max).optional();

export const upsertFiscalConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(["DISABLED", "FOCUS_NFE", "NUVEM_FISCAL"]).optional(),
  environment: z.enum(["HOMOLOGACAO", "PRODUCAO"]).optional(),
  regimeTributario: z.enum(["SIMPLES_NACIONAL", "SIMPLES_EXCESSO", "REGIME_NORMAL"]).optional(),

  // Identidade
  cnpj: str(18),
  inscricaoEstadual: str(20),
  inscricaoMunicipal: str(20),
  razaoSocial: str(120),
  nomeFantasia: str(120),
  cnae: str(10),

  // Endereço fiscal
  fiscalLogradouro: str(120),
  fiscalNumero: str(20),
  fiscalComplemento: str(60),
  fiscalBairro: str(80),
  fiscalMunicipio: str(80),
  fiscalMunicipioIbge: str(7),
  fiscalUf: str(2),
  fiscalCep: str(9),

  // NFC-e
  serie: z.number().int().min(1).max(999).optional(),
  proximoNumero: z.number().int().min(1).optional(),
  cscId: str(20),
  cscToken: str(120), // secreto — só quando muda

  // Gateway (secretos — só quando mudam)
  providerTokenHomologacao: str(200),
  providerTokenProducao: str(200),

  // Defaults fiscais de comida
  defaultNcm: str(8),
  defaultCfop: str(4),
  defaultCsosn: str(4),
  defaultCst: str(3),
  defaultOrigem: str(1),
  defaultUnidade: str(6),
});

export type UpsertFiscalConfigInput = z.infer<typeof upsertFiscalConfigSchema>;

// ── Campos fiscais do cardápio (edição em lote por categoria/item) ────────────
const fiscalRow = {
  ncm: str(8),
  cest: str(7),
  cfop: str(4),
  csosn: str(4),
  cst: str(3),
  origem: str(1),
  unidade: str(6),
};

export const updateMenuFiscalSchema = z.object({
  categories: z.array(z.object({ id: z.string().min(1), ...fiscalRow })).max(500).optional(),
  items: z
    .array(z.object({ id: z.string().min(1), ...fiscalRow, icmsAliquota: z.number().min(0).max(100).nullable().optional() }))
    .max(1000)
    .optional(),
});

export type UpdateMenuFiscalInput = z.infer<typeof updateMenuFiscalSchema>;

export const testFiscalConnectionSchema = z.object({
  provider: z.enum(["FOCUS_NFE", "NUVEM_FISCAL"]).optional(),
  environment: z.enum(["HOMOLOGACAO", "PRODUCAO"]).optional(),
  token: z.string().trim().max(200).optional(), // omitido → usa o token salvo
});

export type TestFiscalConnectionInput = z.infer<typeof testFiscalConnectionSchema>;
