/**
 * A GUARDA DO RAIO-X DE DISPAROS DO CRM — segredo próprio, e fechada sem ele.
 *
 * ── POR QUE UMA VARIÁVEL NOVA ───────────────────────────────────────────────
 * Esta rota devolve o funil de disparo do CRM de restaurantes: contagens por
 * degrau, por restaurante. Pendurá-la em `CRON_SECRET` daria, de brinde, a
 * quem opera agendamento, a leitura da base de clientes de terceiros; e
 * `ADMIN_SECRET` abre o painel da empresa. Raio de alcance de segredo se
 * escolhe; não se herda.
 *
 * Molde da casa: hash dos dois lados, comparação em TEMPO CONSTANTE, mínimo de
 * 16 caracteres, **não configurada = fechada**.
 *
 * 503 = a porta está DESLIGADA (ninguém configurou o segredo).
 * 401 = a porta está de pé e o segredo apresentado não serve.
 * Nenhuma das duas executa consulta alguma.
 */

import { createHash, timingSafeEqual } from "crypto";

export const VARIAVEL_DO_SEGREDO = "RAIOX_CRM_SECRET";
export const CABECALHO_DO_SEGREDO = "x-raiox-crm-secret";

/** O mínimo do molde da casa. Segredo curto é segredo adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurada (ou tem menos de ` +
  `${TAMANHO_MINIMO_DO_SEGREDO} caracteres). Esta rota aceita EXCLUSIVAMENTE o segredo dela — ` +
  "não existe encosto em segredo de vizinho. Não configurada = fechada.";

export const MOTIVO_SEGREDO_ERRADO = "segredo inválido para o raio-x de disparos do CRM";

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

/** A guarda em código puro — dá para prová-la sem levantar uma rota. */
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
