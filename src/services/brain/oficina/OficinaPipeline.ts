/**
 * OficinaPipeline — a esteira ponta a ponta.
 *
 *   verdade → ficha → manual → variador → juiz do comando → [reescrita]
 *           → comando → [produção] → juiz do resultado → memória
 *
 * Quem chama entrega um pedido e recebe uma peça JULGADA, com a ficha junto
 * pra auditoria. Nunca entrega em silêncio: reprovou, o resultado vem marcado
 * como reprovado com o motivo.
 *
 * Modo SOMBRA é o padrão de propósito: a esteira roda inteira e registra, mas
 * o campo `liberado` só fica true no modo produção. Assim dá pra comparar com
 * o que os agentes fazem hoje antes de promover — mesma escada do resto do Brain.
 */

import type { BusinessType } from "../core/BrainTypes";
import type { Ficha, Nota, Pedido, Verdade } from "./OficinaTypes";
import { resolveManual } from "./HouseManual";
import { forjar, type ForjarInput } from "./OficinaService";
import { criticarResultado } from "./OutputCritic";
import { buscarVerdade } from "./TruthSource";
import {
  chaveDeMemoria,
  resolverMemoria,
  JANELA_PADRAO,
} from "./AssinaturaMemory";

export type ModoDaEsteira = "sombra" | "producao";

export interface EsteiraInput {
  pedido: Pedido;
  businessType: BusinessType;
  businessId: string;
  /** O que quem chama já sabe. O resto a Oficina completa. */
  rascunho?: ForjarInput["rascunho"];
  /** Quem escreve a peça de verdade. Ausente = a esteira para no comando. */
  produzir?: (comando: string, ficha: Ficha) => Promise<string>;
  /** Quem conserta a ficha reprovada. Ausente = a Oficina só julga. */
  reescrever?: ForjarInput["reescrever"];
  modo?: ModoDaEsteira;
  corte?: number;
  maxVoltas?: number;
  /** Quantas peças pra trás o anti-mesmice enxerga. */
  janela?: number;
  /**
   * A verdade já em mãos, quando quem chama acabou de carregá-la.
   *
   * Existe para não obrigar uma segunda ida ao banco por peça — e para o piloto
   * da esteira conseguir rodar a corrente inteira sem Postgres. Passar isto NÃO
   * afrouxa nada: a mesma verdade continua passando pelo mesmo juiz, e verdade
   * vazia continua reprovando o comando.
   */
  verdade?: { verdade: Verdade; faltando: string[]; completude: number };
}

export interface EsteiraResult {
  modo: ModoDaEsteira;
  ficha: Ficha;
  comando: string;
  notaComando: Nota;
  /** A peça, quando houve produtor. */
  saida?: string;
  notaResultado?: Nota;
  voltas: number;
  /** Eixos acabaram: hora de ampliar o repertório do manual. */
  esgotado: boolean;
  /** O que o negócio ainda não configurou — explica peça fraca. */
  faltando: string[];
  completude: number;
  /** true só quando TUDO passou E o modo é produção. */
  liberado: boolean;
  /** Por que parou, em uma frase — é o que vai pro log e pro humano. */
  motivoFinal: string;
}

function resumirMotivos(nota: Nota): string {
  return nota.motivos[0] ?? "sem motivo registrado";
}

/**
 * Roda a esteira inteira.
 *
 * Ordem importa: a verdade vem ANTES da ficha (senão o crítico reprova por
 * falta de verdade que a gente nem tentou buscar), e a assinatura só entra na
 * memória quando a peça de fato foi produzida — senão uma execução que morreu
 * no meio queimaria uma combinação boa.
 */
export async function rodarEsteira(input: EsteiraInput): Promise<EsteiraResult> {
  const modo = input.modo ?? "sombra";
  const janela = input.janela ?? JANELA_PADRAO;
  const memory = await resolverMemoria();
  const chave = chaveDeMemoria(input.businessId, input.pedido.agentId, input.pedido.intencao);

  // 1. A verdade primeiro — é o que faz a peça deixar de ser genérica.
  const { verdade, faltando, completude } = input.verdade ?? await buscarVerdade(input.businessType, input.businessId, {
    agentId: input.pedido.agentId,
    queryHint: input.pedido.intencao,
  });

  // 2. O que já foi usado, pro Variador não repetir.
  const usadas = await memory.recentes(chave, janela);

  // 3. Ficha + juiz do comando (+ reescrita, se houver quem reescreva).
  const forja = await forjar({
    pedido: input.pedido,
    verdade,
    usadas,
    ...(input.rascunho   !== undefined ? { rascunho: input.rascunho }     : {}),
    ...(input.reescrever !== undefined ? { reescrever: input.reescrever } : {}),
    ...(input.corte      !== undefined ? { corte: input.corte }           : {}),
    ...(input.maxVoltas  !== undefined ? { maxVoltas: input.maxVoltas }   : {}),
  });

  const base = {
    modo,
    ficha: forja.ficha,
    comando: forja.prompt,
    notaComando: forja.nota,
    voltas: forja.voltas,
    esgotado: forja.esgotado,
    faltando,
    completude,
  };

  // Comando reprovado não vira peça. Barato falhar aqui: nenhuma IA foi gasta.
  if (!forja.nota.aprovado) {
    return { ...base, liberado: false, motivoFinal: `Comando reprovado: ${resumirMotivos(forja.nota)}` };
  }

  // Sem produtor a esteira entrega o comando forjado e para — é o uso normal
  // de quem só quer a pergunta pronta pra chamar a IA por conta própria.
  if (!input.produzir) {
    return { ...base, liberado: modo === "producao", motivoFinal: "Comando aprovado (sem produtor nesta chamada)." };
  }

  // 4. Produção.
  let saida: string;
  try {
    saida = await input.produzir(forja.prompt, forja.ficha);
  } catch (err) {
    return {
      ...base,
      liberado: false,
      motivoFinal: `Produção falhou: ${err instanceof Error ? err.message.slice(0, 120) : "erro"}`,
    };
  }

  // 5. Juiz do resultado.
  const manual = resolveManual(input.pedido.dominio);
  const notaResultado = criticarResultado(saida, forja.ficha, manual, {
    ...(input.corte !== undefined ? { corte: input.corte } : {}),
  });

  // 6. A combinação foi gasta de verdade — agora sim entra na memória.
  await memory.registrar(chave, forja.ficha.assinatura);

  return {
    ...base,
    saida,
    notaResultado,
    liberado: notaResultado.aprovado && modo === "producao",
    motivoFinal: notaResultado.aprovado
      ? modo === "producao" ? "Aprovado e liberado." : "Aprovado (sombra — não publica)."
      : `Resultado reprovado: ${resumirMotivos(notaResultado)}`,
  };
}

/** Só o comando forjado, pra quem já tem seu próprio caminho de geração. */
export async function forjarComando(input: Omit<EsteiraInput, "produzir">): Promise<EsteiraResult> {
  return rodarEsteira(input);
}
