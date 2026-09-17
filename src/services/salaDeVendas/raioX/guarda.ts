/**
 * A GUARDA DO RAIO-X DAS CONVERSAS — segredo próprio, e fechada sem ele.
 *
 * ── POR QUE UMA VARIÁVEL NOVA, E NÃO `CRON_SECRET` NEM `ADMIN_SECRET` ───────
 *
 * Esta rota devolve CONVERSA INTEIRA de terceiro: nome, empresa, telefone e o
 * texto do que a pessoa escreveu. É o dado mais sensível do comercial. Pendurar
 * isso num segredo já em uso teria dois efeitos, os dois ruins:
 *
 * 1. **Alcance herdado.** `CRON_SECRET` mora em workflow de agendamento e
 *    `ADMIN_SECRET` abre o painel da empresa. Quem tem um deles por outro
 *    motivo passaria a ler, de brinde, a caixa de mensagens da prospecção.
 *    Raio de alcance de segredo se escolhe; não se herda (ADR-003).
 * 2. **Sobrescrita.** Trocar ou setar um segredo em uso para "liberar" esta
 *    rota derruba o que já funciona hoje.
 *
 * Então: variável própria, `RAIOX_COMERCIAL_SECRET`, e o molde da casa —
 * hash dos dois lados, comparação em TEMPO CONSTANTE, mínimo de 16 caracteres,
 * **não configurada = fechada**. Nunca aberta por omissão, nunca por sorte de
 * ambiente, e sem encosto em segredo de vizinho.
 *
 * ── 503 E 401 SÃO COISAS DIFERENTES ─────────────────────────────────────────
 * 503 = a porta não está protegida, está DESLIGADA (ninguém configurou).
 * 401 = a porta está de pé e o segredo apresentado não serve.
 * As duas são "fechada". Nenhuma das duas executa consulta alguma.
 */

import { createHash, timingSafeEqual } from "crypto";

export const VARIAVEL_DO_SEGREDO = "RAIOX_COMERCIAL_SECRET";
export const CABECALHO_DO_SEGREDO = "x-raiox-comercial-secret";

/** O mínimo do molde da casa. Segredo curto é segredo adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurada (ou tem menos de ` +
  `${TAMANHO_MINIMO_DO_SEGREDO} caracteres). Esta rota aceita EXCLUSIVAMENTE o segredo dela — ` +
  "não existe encosto em CRON_SECRET nem em ADMIN_SECRET, porque ela devolve conversa e telefone " +
  "de terceiro. Não configurada = fechada.";

export const MOTIVO_SEGREDO_ERRADO = "segredo inválido para o raio-x do comercial";

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

/**
 * A guarda em código puro — dá para prová-la sem levantar uma rota.
 *
 * Aceita o cabeçalho próprio ou `Authorization: Bearer <segredo>`, porque quem
 * chama daqui é tanto um workflow quanto uma pessoa com `curl`. Os dois passam
 * pela MESMA comparação em tempo constante.
 */
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
