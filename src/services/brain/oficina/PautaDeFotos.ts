/**
 * PautaDeFotos — a etapa ANTES do prompt.
 *
 * O cliente não pede "foto do hambúrguer em 45 graus com lente 50mm". Ele diz
 * "preciso divulgar minha clínica de estética, que faz limpeza de pele". A
 * pauta traduz esse objetivo de negócio numa LISTA DE FOTOS que serve ao
 * objetivo — incluindo as que o cliente não sabia que precisava.
 *
 * É o único ponto da Oficina onde a IA é indispensável: descobrir o que
 * fotografar para um negócio exige entender o negócio. Depois disso, cada
 * conceito vira prompt pela ForjaDeFoto, que é determinística.
 *
 * Nunca devolve vazio: se a IA falhar, uma pauta-base entra no lugar. Cliente
 * com prazo não pode ficar sem material porque a API teve um soluço.
 */

import { selectEngine } from "../engines/AIEngineRouter";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import { forjarPromptDeFoto, type PromptDeFoto, type TipoDeFoto } from "./ForjaDeFoto";

export interface PedidoDePauta {
  /** O negócio, como o cliente descreve: "clínica de estética". */
  negocio: string;
  /** O que ele quer que aconteça: "divulgar a limpeza de pele". */
  objetivo: string;
  /** Serviços/produtos reais, quando se sabe. Ancora a pauta na verdade. */
  ofertas?: string[];
  publico?: string;
  /** O que o cliente JÁ tem de imagem — vira inspiração, não é reinventado. */
  insumos?: string[];
  /** Quantos conceitos. Padrão 6. */
  quantos?: number;
  formato?: string;
  agentId?: string;
}

export interface ConceitoDeFoto {
  /** Nome curto da foto: "As mãos da profissional durante a limpeza". */
  titulo: string;
  /** O assunto, do jeito que a ForjaDeFoto consome. */
  assunto: string;
  /** O que precisa aparecer — detalhes verdadeiros. */
  detalhes?: string;
  cenario?: string;
  tipo?: TipoDeFoto;
  /** Por que esta foto serve ao objetivo. É o que você lê pra aprovar. */
  porque: string;
}

export interface ItemDaPauta {
  conceito: ConceitoDeFoto;
  comando: PromptDeFoto;
}

export interface Pauta {
  itens: ItemDaPauta[];
  /** true quando a IA falhou e a pauta-base entrou no lugar. */
  reserva: boolean;
  motivo?: string;
}

const SYSTEM = `Você é diretor de arte de uma agência que atende negócios locais.

Recebe o objetivo de um cliente e devolve uma PAUTA DE FOTOS: as imagens que
realmente servem àquele objetivo — inclusive as que o cliente não pensou em pedir.

Devolva JSON: {"conceitos":[{"titulo","assunto","detalhes","cenario","tipo","porque"}]}

Regras:
- "assunto" é o que a câmera vê, concreto e curto. Não escreva instrução de
  câmera (nada de lente, luz ou ângulo) — outra etapa cuida disso.
- "tipo" é um de: comida, bebida, produto, retrato, ambiente, fachada,
  paisagem, urbano, animal, bastidor, procedimento, detalhe, generico.
- "porque" explica em uma frase o que aquela foto faz pelo objetivo.
- VARIE os ângulos de comunicação: o serviço em ação, o detalhe que prova
  qualidade, o lugar, o resultado, a pessoa que atende, o bastidor.
- Use SÓ o que foi informado como verdade. Não invente serviço, prêmio ou número.
- Nada de pessoa identificável como cliente real; descreva de forma que o rosto
  não seja o assunto.
- Responda só o JSON.`;

/** Pauta-base: funciona para qualquer negócio, sem IA. É a rede de segurança. */
function pautaDeReserva(p: PedidoDePauta): ConceitoDeFoto[] {
  const oferta = p.ofertas?.[0]?.trim() || p.objetivo.trim();
  return [
    { titulo: "O serviço acontecendo",  assunto: `${oferta} sendo realizado`, tipo: "procedimento", porque: "mostrar o serviço em ação é o que gera confiança de quem nunca veio." },
    { titulo: "O detalhe que prova",    assunto: `detalhe de perto de ${oferta}`, tipo: "detalhe", porque: "o close prova cuidado e qualidade sem precisar dizer." },
    { titulo: "O lugar",                assunto: `o ambiente de ${p.negocio}`, tipo: "ambiente", porque: "quem vê o espaço se imagina lá dentro." },
    { titulo: "Quem atende",            assunto: `profissional de ${p.negocio} no trabalho`, tipo: "retrato", porque: "negócio local vende pela pessoa, não só pelo serviço." },
    { titulo: "A porta de entrada",     assunto: `fachada de ${p.negocio}`, tipo: "fachada", porque: "ajuda o cliente a achar e reconhecer o lugar." },
    { titulo: "O resultado",            assunto: `resultado de ${oferta}`, tipo: "detalhe", porque: "o resultado é o argumento mais forte que existe." },
  ];
}

function extrairConceitos(bruto: string): ConceitoDeFoto[] {
  try {
    const dados = JSON.parse(bruto) as { conceitos?: unknown };
    if (!Array.isArray(dados.conceitos)) return [];
    return dados.conceitos.flatMap((c): ConceitoDeFoto[] => {
      if (!c || typeof c !== "object") return [];
      const o = c as Record<string, unknown>;
      const assunto = typeof o.assunto === "string" ? o.assunto.trim() : "";
      if (!assunto) return [];
      return [{
        titulo:  typeof o.titulo === "string" && o.titulo.trim() ? o.titulo.trim() : assunto,
        assunto,
        porque:  typeof o.porque === "string" ? o.porque.trim() : "",
        ...(typeof o.detalhes === "string" && o.detalhes.trim() ? { detalhes: o.detalhes.trim() } : {}),
        ...(typeof o.cenario  === "string" && o.cenario.trim()  ? { cenario:  o.cenario.trim() }  : {}),
        ...(typeof o.tipo     === "string" ? { tipo: o.tipo as TipoDeFoto } : {}),
      }];
    });
  } catch {
    return [];
  }
}

/**
 * Monta a pauta e já forja o comando de cada foto.
 *
 * Cada conceito recebe um índice de variação diferente, então duas fotos da
 * mesma pauta não saem com a mesma luz e o mesmo ângulo.
 */
export async function montarPauta(p: PedidoDePauta): Promise<Pauta> {
  const quantos = Math.max(1, Math.min(p.quantos ?? 6, 12));

  let conceitos: ConceitoDeFoto[] = [];
  let motivo: string | undefined;

  try {
    const bruto = await callStructuredJson({
      selection: selectEngine(p.agentId ?? "social"),
      systemPrompt: SYSTEM,
      userContent: JSON.stringify({
        negocio: p.negocio,
        objetivo: p.objetivo,
        ofertas: p.ofertas ?? [],
        publico: p.publico ?? "",
        imagensQueOClienteJaTem: p.insumos ?? [],
        quantosConceitos: quantos,
      }),
      temperature: 0.8,
      maxTokens: 1600,
      responseFormat: "json",
    });
    conceitos = extrairConceitos(bruto);
    if (conceitos.length === 0) motivo = "a IA respondeu sem conceitos utilizáveis";
  } catch (err) {
    motivo = err instanceof Error ? err.message.slice(0, 200) : "falha ao chamar a IA";
  }

  const reserva = conceitos.length === 0;
  if (reserva) conceitos = pautaDeReserva(p);

  const itens = conceitos.slice(0, quantos).map((conceito, i) => ({
    conceito,
    comando: forjarPromptDeFoto({
      pedido: conceito.assunto,
      variacao: i,
      ...(conceito.detalhes !== undefined ? { detalhes: conceito.detalhes } : {}),
      ...(conceito.cenario  !== undefined ? { cenario:  conceito.cenario }  : {}),
      ...(conceito.tipo     !== undefined ? { tipo:     conceito.tipo }     : {}),
      ...(p.formato         !== undefined ? { formato:  p.formato }         : {}),
    }),
  }));

  return { itens, reserva, ...(motivo !== undefined ? { motivo } : {}) };
}
