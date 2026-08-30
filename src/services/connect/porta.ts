/**
 * A GUARDA DA PORTA DO DIOLI CONNECT — segredo próprio, e fechada sem ele.
 *
 * ─── POR QUE UM SEGREDO SÓ DELA ────────────────────────────────────────────
 *
 * O molde é o do Diário do SDR (`api/sdr/diario`), que é o padrão da casa para
 * porta de robô: **header próprio, hash dos dois lados, comparação em tempo
 * constante, mínimo de 16 caracteres, e "não configurado = fechado"**.
 *
 * ⛔ `ADMIN_SECRET` está proibido aqui, e não por gosto: a ADR-003 é regra desta
 * casa — *rota nova não aceita a senha antiga* — e aquele segredo abre o painel
 * inteiro da empresa. Uma porta que a Control Room usa para acionar um agente
 * não pode, de brinde, entregar a administração do produto a quem a tiver. O
 * raio de alcance de um segredo tem que ser escolhido, não herdado.
 *
 * E o efeito colateral que interessa: **sem `DIOLI_CONNECT_SECRET` configurado,
 * a porta permanece fechada.** Ela não cai para o segredo do vizinho, não abre
 * por omissão, não abre por sorte de ambiente.
 *
 * ─── POR QUE 503, E NÃO 401, QUANDO O SEGREDO NÃO EXISTE ───────────────────
 *
 * Aqui esta porta se afasta de propósito do Diário do SDR, que responde 401 nos
 * dois casos. 401 diz "você não está autorizado", e isso é falso quando o
 * problema é que **a porta não está protegida — está DESLIGADA**. Um operador
 * que esqueceu de configurar o segredo passaria horas procurando o cabeçalho
 * errado. 503 diz a verdade: não há o que autorizar ainda.
 *
 * As duas respostas continuam sendo "fechada". Nenhuma delas executa nada.
 */

import { createHash, timingSafeEqual } from "crypto";

/** O nome da variável e do cabeçalho. Um lugar só, para não divergirem. */
export const VARIAVEL_DO_SEGREDO = "DIOLI_CONNECT_SECRET";
export const CABECALHO_DO_SEGREDO = "x-dioli-connect-secret";

/** O mínimo do molde da casa. Segredo curto é segredo adivinhável. */
export const TAMANHO_MINIMO_DO_SEGREDO = 16;

export const MOTIVO_PORTA_DESLIGADA =
  `porta fechada: ${VARIAVEL_DO_SEGREDO} não está configurado (ou tem menos de ${TAMANHO_MINIMO_DO_SEGREDO} ` +
  "caracteres). Esta porta aceita EXCLUSIVAMENTE o segredo dela — não existe encosto em ADMIN_SECRET " +
  "(proibido para rota nova pela ADR-003, e ele abre o painel inteiro da empresa), nem em CRON_SECRET, nem " +
  "em nenhum outro: segredo de outra finalidade não abre porta corporativa. Não configurado = fechado. " +
  "Nunca aberto por omissão.";

/** Comparação em tempo constante, com hash dos dois lados (molde da casa). */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * O segredo desta porta, ou `null` quando ela está desligada.
 *
 * Repare que a exigência de tamanho mora AQUI, e não na conferência: um segredo
 * de três letras não é "um segredo fraco que ainda vale", é porta desligada.
 */
export function segredoDaPorta(env: NodeJS.ProcessEnv = process.env): string | null {
  const bruto = env[VARIAVEL_DO_SEGREDO]?.trim();
  if (!bruto || bruto.length < TAMANHO_MINIMO_DO_SEGREDO) return null;
  return bruto;
}

export type ResultadoDaGuarda =
  | { ok: true }
  | { ok: false; status: 503 | 401; motivo: string };

/** A guarda, em código puro: dá para prová-la sem levantar uma rota. */
export function conferirSegredo(
  cabecalho: string | null,
  env: NodeJS.ProcessEnv = process.env,
): ResultadoDaGuarda {
  const segredo = segredoDaPorta(env);
  if (!segredo) return { ok: false, status: 503, motivo: MOTIVO_PORTA_DESLIGADA };
  if (!segredoConfere(cabecalho, segredo)) {
    return {
      ok: false,
      status: 401,
      motivo: `segredo inválido: apresente o cabeçalho ${CABECALHO_DO_SEGREDO} com o segredo desta porta`,
    };
  }
  return { ok: true };
}
