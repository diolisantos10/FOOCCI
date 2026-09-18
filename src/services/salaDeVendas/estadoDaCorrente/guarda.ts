/**
 * A GUARDA DA PORTA DO ESTADO DA CORRENTE — segredo próprio, fechada sem ele.
 *
 * Mesmo raciocínio de `raioX/guarda.ts`, e a comparação em tempo constante vem
 * IMPORTADA de lá, nunca copiada: duas escritas da mesma comparação divergem, e
 * a que diverge é sempre a que ninguém lembra de atualizar.
 *
 * ── POR QUE MAIS UMA VARIÁVEL ───────────────────────────────────────────────
 *
 * Esta porta devolve o estado dos INTERRUPTORES da casa e a fila de quem está
 * largado. Não é a mesma coisa que o raio-x das conversas (que devolve texto e
 * telefone de terceiro), e por isso não herda o segredo dele: raio de alcance
 * de segredo se escolhe, não se herda. `CRON_SECRET` e `ADMIN_SECRET` estão
 * fora pelo mesmo motivo de sempre — quem tem um deles por outro motivo
 * passaria a ler, de brinde, a saúde comercial inteira da empresa.
 *
 * 503 = a porta não está protegida, está DESLIGADA. 401 = o segredo não serve.
 * As duas são "fechada", e nenhuma das duas executa consulta alguma.
 */

import { segredoConfere } from "../raioX/guarda";

export const VARIAVEL_DO_SEGREDO = "CORRENTE_COMERCIAL_SECRET";
export const CABECALHO_DO_SEGREDO = "x-corrente-comercial-secret";

/** O mínimo do molde da casa. Segredo curto é segredo adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurada (ou tem menos de ` +
  `${TAMANHO_MINIMO_DO_SEGREDO} caracteres). Esta rota aceita EXCLUSIVAMENTE o segredo dela — ` +
  "não existe encosto em CRON_SECRET, ADMIN_SECRET nem RAIOX_COMERCIAL_SECRET. Não configurada = fechada.";

export const MOTIVO_SEGREDO_ERRADO = "segredo inválido para o estado da corrente comercial";

/** O segredo desta porta, ou `null` quando ela está desligada. */
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
