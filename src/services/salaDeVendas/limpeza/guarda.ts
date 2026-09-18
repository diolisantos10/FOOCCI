/**
 * A GUARDA DA LIMPEZA DE CONVERSAS — segredo PRÓPRIO, e fechada sem ele.
 *
 * Esta porta APAGA conversas. É a porta mais destrutiva do produto, e por isso
 * ela não encosta em segredo de ninguém: nem no do agendador (`CRON_SECRET`),
 * nem no do painel (`ADMIN_SECRET`), nem no do raio-x, nem no do religamento,
 * nem no da reabordagem. Raio de alcance de segredo se ESCOLHE (ADR-003).
 *
 * `LIMPEZA_CONVERSAS_SECRET`, molde da casa: hash dos dois lados, comparação em
 * TEMPO CONSTANTE, mínimo de 16 caracteres, **não configurada = fechada**.
 * 503 = porta desligada; 401 = segredo errado. Nenhuma das duas apaga nada.
 */

import { createHash, timingSafeEqual } from "crypto";

export const VARIAVEL_DO_SEGREDO = "LIMPEZA_CONVERSAS_SECRET";
export const CABECALHO_DO_SEGREDO = "x-limpeza-conversas-secret";
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurada (ou tem menos de ` +
  `${TAMANHO_MINIMO_DO_SEGREDO} caracteres). Esta rota APAGA conversas e aceita ` +
  "EXCLUSIVAMENTE o segredo dela. Não configurada = fechada.";

export const MOTIVO_SEGREDO_ERRADO = "segredo inválido para a limpeza de conversas";

export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function segredoDaPorta(env: NodeJS.ProcessEnv = process.env): string | null {
  const bruto = env[VARIAVEL_DO_SEGREDO]?.trim();
  if (!bruto || bruto.length < TAMANHO_MINIMO_DO_SEGREDO) return null;
  return bruto;
}

export type ResultadoDaGuarda = { ok: true } | { ok: false; status: 503 | 401; motivo: string };

export function conferirSegredo(
  cabecalhos: { proprio: string | null; authorization: string | null },
  env: NodeJS.ProcessEnv = process.env,
): ResultadoDaGuarda {
  const segredo = segredoDaPorta(env);
  if (!segredo) return { ok: false, status: 503, motivo: MOTIVO_PORTA_DESLIGADA };

  const bearer = cabecalhos.authorization?.startsWith("Bearer ")
    ? cabecalhos.authorization.slice("Bearer ".length).trim()
    : null;

  if (segredoConfere(cabecalhos.proprio, segredo) || segredoConfere(bearer, segredo)) {
    return { ok: true };
  }
  return { ok: false, status: 401, motivo: MOTIVO_SEGREDO_ERRADO };
}
