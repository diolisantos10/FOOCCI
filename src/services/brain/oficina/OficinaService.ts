/**
 * OficinaService — o fluxo: pedido cru → ficha → manual → variador → juiz → prompt.
 *
 * Quem chama nunca escreve prompt em prosa: entrega o pedido e a verdade, e
 * recebe de volta o comando já forjado + a ficha (pra auditoria) + a nota.
 *
 * A IA é OPCIONAL aqui: sem `reescrever`, a Oficina apenas monta e julga — que é
 * exatamente o modo sombra, pra rodar em paralelo e comparar antes de promover.
 */

import type { Ficha, Nota, Pedido, Verdade } from "./OficinaTypes";
import { resolveManual, type Manual } from "./HouseManual";
import { assinar, semear, variar, type Eixo } from "./Variator";
import { criticar, CORTE_PADRAO } from "./PromptCritic";

export interface ForjarInput {
  pedido:   Pedido;
  /** Fatos do banco. Vazio = a Oficina reprova (e é isso que a gente quer). */
  verdade:  Verdade;
  /** Campos que quem chama já sabe. O resto a Oficina completa pelo manual. */
  rascunho?: Partial<Pick<Ficha, "objetivo" | "publico" | "tom" | "formato" | "proibicoes">>;
  /** Assinaturas das últimas peças — a memória do anti-mesmice. */
  usadas?:  string[];
  /** Sobrescreve os eixos do manual (ex.: uma campanha com grade própria). */
  eixos?:   Eixo[];
  corte?:   number;
  maxVoltas?: number;
  /** Injetado: quem sabe reescrever (a IA). Sem isso, a Oficina só julga. */
  reescrever?: (ficha: Ficha, nota: Nota) => Promise<Ficha>;
}

export interface ForjaResult {
  ficha:   Ficha;
  nota:    Nota;
  /** A ficha renderizada — é isso que vai pra IA no lugar do texto solto. */
  prompt:  string;
  /** Quantas reescritas foram necessárias. 0 = passou de primeira. */
  voltas:  number;
  /** true quando os eixos acabaram: hora de ampliar o repertório do manual. */
  esgotado: boolean;
}

/** Monta a ficha a partir do pedido + verdade + manual, já com eixo sorteado. */
export function montarFicha(input: ForjarInput, manual: Manual): { ficha: Ficha; esgotado: boolean } {
  const { pedido, verdade, rascunho = {}, usadas = [], eixos } = input;

  const grade = eixos ?? manual.eixosPorMedium[pedido.medium] ?? [];
  const semente = semear(pedido.dominio, pedido.agentId, pedido.intencao);
  const variacao = variar(grade, usadas, semente);

  const proibicoes = [...new Set([...(rascunho.proibicoes ?? []), ...manual.proibicoesPadrao])];

  return {
    ficha: {
      objetivo:   rascunho.objetivo ?? pedido.intencao,
      publico:    rascunho.publico  ?? "",
      tom:        rascunho.tom      ?? "",
      formato:    rascunho.formato  ?? variacao.eixos.formato ?? "",
      verdade,
      proibicoes,
      eixos:      variacao.eixos,
      assinatura: variacao.assinatura,
    },
    esgotado: variacao.esgotado,
  };
}

/** A ficha em texto — rótulo e valor, sem prosa, sem espaço pra interpretação. */
export function renderizar(ficha: Ficha): string {
  const linhas: string[] = [
    `OBJETIVO: ${ficha.objetivo}`,
    `PÚBLICO: ${ficha.publico}`,
    `TOM: ${ficha.tom}`,
    `FORMATO: ${ficha.formato}`,
  ];

  const verdade = Object.entries(ficha.verdade);
  if (verdade.length > 0) {
    linhas.push("VERDADE (fatos do banco — use só isto, não invente):");
    for (const [chave, valor] of verdade) {
      linhas.push(`  - ${chave}: ${Array.isArray(valor) ? valor.join(", ") : valor}`);
    }
  }

  const eixos = Object.entries(ficha.eixos);
  if (eixos.length > 0) {
    linhas.push(`ABORDAGEM: ${eixos.map(([k, v]) => `${k} = ${v}`).join(" · ")}`);
  }

  if (ficha.proibicoes.length > 0) {
    linhas.push("NÃO FAÇA:");
    for (const p of ficha.proibicoes) linhas.push(`  - ${p}`);
  }

  return linhas.join("\n");
}

/**
 * Forja o comando. Reprovou e tem reescritor? Reescreve e julga de novo, até
 * `maxVoltas`. Estourou as voltas, devolve a última ficha com a nota reprovada —
 * quem chama decide se manda pra um humano. Nunca entrega em silêncio.
 */
export async function forjar(input: ForjarInput): Promise<ForjaResult> {
  const corte = input.corte ?? CORTE_PADRAO;
  const maxVoltas = input.maxVoltas ?? 3;
  const manual = resolveManual(input.pedido.dominio);

  if (!manual) {
    const ficha: Ficha = {
      objetivo: input.pedido.intencao, publico: "", tom: "", formato: "",
      verdade: input.verdade, proibicoes: [], eixos: {}, assinatura: "",
    };
    return { ficha, nota: criticar(ficha, null, corte), prompt: renderizar(ficha), voltas: 0, esgotado: true };
  }

  const montada = montarFicha(input, manual);
  let ficha = montada.ficha;
  let nota = criticar(ficha, manual, corte);
  let voltas = 0;

  while (!nota.aprovado && input.reescrever && voltas < maxVoltas) {
    voltas++;
    const reescrita = await input.reescrever(ficha, nota);
    // O reescritor só manda na REDAÇÃO. `eixos` é da Oficina (senão ele fura o
    // anti-mesmice) e `verdade` é do banco (senão ele inventaria fato só pra
    // passar no crítico — que é exatamente o que a Oficina existe pra impedir).
    ficha = {
      ...reescrita,
      verdade:    ficha.verdade,
      eixos:      ficha.eixos,
      assinatura: assinar(ficha.eixos),
    };
    nota = criticar(ficha, manual, corte);
  }

  return { ficha, nota, prompt: renderizar(ficha), voltas, esgotado: montada.esgotado };
}
