/**
 * Token-mestre da Foocci no gateway (conta parceiro / multi-empresa).
 *
 * Modelo CONTA-MÃE: a Foocci tem UMA conta no gateway; cada lojista só sobe o
 * certificado dele no painel e a Foocci registra a empresa dele por baixo. A
 * emissão usa este token de PLATAFORMA (env, não por-lojista).
 *
 * Env (defina quando a conta parceiro existir):
 *   FOCUS_NFE_MASTER_TOKEN_HOMOLOGACAO
 *   FOCUS_NFE_MASTER_TOKEN_PRODUCAO
 *   FOCUS_NFE_MASTER_TOKEN            (fallback p/ ambos)
 */

import type { FiscalEnvironment } from "./providers/types";

export function getPlatformFiscalToken(ambiente: FiscalEnvironment): string | null {
  const shared = process.env.FOCUS_NFE_MASTER_TOKEN || null;
  if (ambiente === "PRODUCAO") return process.env.FOCUS_NFE_MASTER_TOKEN_PRODUCAO || shared;
  return process.env.FOCUS_NFE_MASTER_TOKEN_HOMOLOGACAO || shared;
}
