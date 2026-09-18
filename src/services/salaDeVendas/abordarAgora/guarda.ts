/**
 * A GUARDA DO "ABORDAR AGORA" — segredo PRÓPRIO, e fechada sem ele.
 *
 * ── POR QUE MAIS UMA VARIÁVEL ───────────────────────────────────────────────
 *
 * Mesma doutrina de `religamento/guarda.ts` e `raioX/guarda.ts` (ADR-003): raio
 * de alcance de segredo se ESCOLHE, não se herda. Esta porta é a mais afiada da
 * casa — ela MANDA MENSAGEM A CLIENTE, por nome de modelo escolhido à mão, e
 * pode passar por cima de "este lead já recebeu mensagem". Pendurá-la em
 * `ADMIN_SECRET` (que abre o painel), em `CRON_SECRET` (que mora em workflow de
 * agendamento) ou em `REABORDAGEM_SECRET` (que dispara a campanha desenhada)
 * daria a quem tem um deles, por outro motivo, o poder de falar com a base de
 * brinde.
 *
 * Então: `ABORDAR_AGORA_SECRET` — hash dos dois lados, comparação em TEMPO
 * CONSTANTE, mínimo de 16 caracteres, **não configurada = fechada**.
 * 503 = a porta está desligada; 401 = o segredo apresentado não serve. Nenhuma
 * das duas envia coisa alguma.
 */

import { createHash, timingSafeEqual } from "crypto";

export const VARIAVEL_DO_SEGREDO = "ABORDAR_AGORA_SECRET";
export const CABECALHO_DO_SEGREDO = "x-abordar-agora-secret";

/** O mínimo do molde da casa. Segredo curto é segredo adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurada (ou tem menos de ` +
  `${TAMANHO_MINIMO_DO_SEGREDO} caracteres). Esta rota aceita EXCLUSIVAMENTE o segredo dela — ` +
  "não existe encosto no segredo do painel, no do agendador nem no da reabordagem, porque ela " +
  "ENVIA mensagem a cliente. Não configurada = fechada.";

export const MOTIVO_SEGREDO_ERRADO = "segredo inválido para a abordagem imediata";

/** Comparação em tempo constante, com hash dos dois lados (molde da casa). */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

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
