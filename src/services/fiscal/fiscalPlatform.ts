/**
 * Credencial-mestre da Foocci no gateway (conta parceiro / multi-empresa).
 *
 * Modelo CONTA-MÃE: a Foocci tem UMA conta no gateway; cada lojista só sobe o
 * certificado dele no painel e a Foocci registra a empresa dele por baixo. A
 * emissão usa esta credencial de PLATAFORMA (env, não por-lojista).
 *
 *   FOCUS_NFE → token único (FOCUS_NFE_MASTER_TOKEN_HOMOLOGACAO / _PRODUCAO).
 */

import type { FiscalEnvironment } from "./providers/types";

export function getPlatformFiscalToken(provider: string, ambiente: FiscalEnvironment): string | null {
  if (provider === "FOCUS_NFE") {
    const shared = process.env.FOCUS_NFE_MASTER_TOKEN || null;
    if (ambiente === "PRODUCAO") return process.env.FOCUS_NFE_MASTER_TOKEN_PRODUCAO || shared;
    return process.env.FOCUS_NFE_MASTER_TOKEN_HOMOLOGACAO || shared;
  }
  return null;
}
