/**
 * A Sala dos Agentes — ponto de entrada único do SERVIÇO.
 *
 * Doutrina 20 do kit (`dioli-brain-kit/docs/20-sala-dos-agentes.md`), obrigatória
 * em todo projeto da casa. A tela importa daqui:
 *
 *     import { getSalaDosAgentes } from "@/services/agents/sala";
 *     const sala = await getSalaDosAgentes();
 *
 * O formato do retorno é o contrato em `src/services/agents/salaDosAgentes.types.ts`
 * e não muda sem acordo com quem constrói a tela.
 *
 * ── O que esta função NÃO faz ─────────────────────────────────────────────────
 * Não escreve nada, não cria agente, não liga motor. É leitura. As duas
 * populações vêm na mesma lista `agentes`, separadas pelo campo `populacao`, e
 * elas NÃO devem ser somadas juntas: "custo" de quem não gasta com "blocos" de
 * quem não fala com cliente dá um total sem significado.
 */

import { montarSalaDosAgentes } from "./montagem";
import { lerInsumosDaSala, type OpcoesDaSala } from "./leitura";
import type { SalaDosAgentes } from "../salaDosAgentes.types";

export async function getSalaDosAgentes(opts: OpcoesDaSala = {}): Promise<SalaDosAgentes> {
  return montarSalaDosAgentes(await lerInsumosDaSala(opts));
}

export { montarSalaDosAgentes, JANELA_DIAS, ESSENCIAIS } from "./montagem";
export type { InsumosDaSala } from "./montagem";
export { lerInsumosDaSala } from "./leitura";
export type { OpcoesDaSala } from "./leitura";
